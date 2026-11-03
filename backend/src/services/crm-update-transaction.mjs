import { normalizeCrmRow } from "./crm-normalize-row.mjs";
import {
  withCrmTransaction,
  CrmTransactionAbort
} from "./crm-transaction.mjs";

const quote = name => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new CrmTransactionAbort(400, "invalid_column");
  }
  return "`" + name + "`";
};


const CRM_OPERATORS = new Set([
  "eq", "neq", "gt", "gte", "lt", "lte",
  "is", "in", "like", "ilike", "contains"
]);

function validateCrmUpdateFilters(filters, schema) {
  if (!Array.isArray(filters)) {
    throw new CrmTransactionAbort(400, "invalid_filters");
  }

  const validColumn = name =>
    typeof name === "string" &&
    schema.has(name);

  const validOperator = name =>
    typeof name === "string" &&
    CRM_OPERATORS.has(name);

  for (const filter of filters) {
    if (!filter || typeof filter !== "object" ||
        Array.isArray(filter)) {
      throw new CrmTransactionAbort(400, "invalid_filter");
    }

    if (filter.type === "match") {
      const value = filter.value;

      if (!value || typeof value !== "object" ||
          Array.isArray(value) ||
          Object.keys(value).length === 0 ||
          !Object.keys(value).every(validColumn)) {
        throw new CrmTransactionAbort(400, "invalid_match");
      }
      continue;
    }

    if (filter.type === "not") {
      if (!validColumn(filter.column) ||
          !validOperator(filter.operator)) {
        throw new CrmTransactionAbort(400, "invalid_not");
      }
      continue;
    }

    if (filter.type === "or") {
      if (typeof filter.expression !== "string") {
        throw new CrmTransactionAbort(400, "invalid_or");
      }

      const clauses = filter.expression.split(",");

      const valid = clauses.every(clause => {
        const parts = clause.split(".");
        const column = parts.shift();
        const operator = parts.shift();

        return parts.length > 0 &&
          validColumn(column) &&
          validOperator(operator);
      });

      if (!valid) {
        throw new CrmTransactionAbort(400, "invalid_or");
      }
      continue;
    }

    if (!validOperator(filter.type) ||
        !validColumn(filter.column)) {
      throw new CrmTransactionAbort(
        400, "invalid_filter_operator"
      );
    }

    if (filter.type === "in" &&
        !Array.isArray(filter.value)) {
      throw new CrmTransactionAbort(400, "invalid_in");
    }
  }
}

export async function updateCrmDealsAtomic({
  pool, payload, filters, schema, user,
  canUpdateRow, validateCrmDealLoss,
  matchesFilters, nativeValue, emitTableChange
}) {
  const patch = payload || {};
  validateCrmUpdateFilters(filters, schema);

  return withCrmTransaction(
    pool,
    async ({ connection, queueEvent }) => {
      // Otimizacao conservadora: igualdade explicita por ID.
      const idFilter = (filters || []).find(f =>
        (
          f?.type === "eq" &&
          f.column === "id" &&
          typeof f.value === "string"
        ) ||
        (
          f?.type === "match" &&
          typeof f.value?.id === "string"
        )
      );

      const id = idFilter?.type === "match"
        ? idFilter.value.id
        : idFilter?.value;

      const targeted = typeof id === "string";

      let rows = [];

      if (targeted) {
        // Mantem a atualizacao individual pela chave primaria.
        const [locked] = await connection.execute(
          "SELECT * FROM `crm_deals` WHERE `id` = ? FOR UPDATE",
          [id]
        );

        if (!Array.isArray(locked)) {
          throw new Error("CRM_LOCK_INVALID_RESULT");
        }

        rows = locked;
      } else {
        // Busca candidatos sem bloqueio exclusivo.
        const [snapshot] = await connection.execute(
          "SELECT * FROM `crm_deals`"
        );

        if (!Array.isArray(snapshot)) {
          throw new Error("CRM_SNAPSHOT_INVALID_RESULT");
        }

        const candidateIds = [...new Set(
          snapshot
            .map(raw => normalizeCrmRow(raw))
            .filter(record =>
              record.id != null &&
              matchesFilters(record, filters || [])
            )
            .map(record => String(record.id))
        )].sort();

        // Bloqueia cada candidato pela chave primaria.
        // Preserva todos os bloqueios ate COMMIT ou ROLLBACK.
        for (const candidateId of candidateIds) {
          const [locked] = await connection.execute(
            "SELECT * FROM `crm_deals` WHERE `id` = ? FOR UPDATE",
            [candidateId]
          );

          if (!Array.isArray(locked)) {
            throw new Error("CRM_LOCK_INVALID_RESULT");
          }

          rows.push(...locked);
        }
      }

      const output = [];

      for (const raw of rows) {
        const current = normalizeCrmRow(raw);
        if (!matchesFilters(current, filters || [])) continue;
        if (current.id == null) continue;

        // Preserva a regra atual de ignorar registros sem permissao.
        if (!await canUpdateRow(
          user, "crm_deals", current, patch
        )) continue;

        const next = { ...current, ...patch };
        const check = validateCrmDealLoss(current, next, patch);

        if (!check.valid) {
          throw new CrmTransactionAbort(
            400, check.code, check.message
          );
        }

        const sets = [];
        const values = [];

        for (const [key, value] of Object.entries(patch)) {
          if (key === "id" || key === "data" || !schema.has(key)) {
            continue;
          }
          sets.push(quote(key) + " = ?");
          values.push(nativeValue(value, schema.get(key)));
        }

        if (schema.has("data")) {
          sets.push("`data` = ?");
          values.push(JSON.stringify(next));
        }

        if (schema.has("updated_at")) {
          sets.push("`updated_at` = CURRENT_TIMESTAMP");
        }

        if (sets.length) {
          const [result] = await connection.execute(
            "UPDATE `crm_deals` SET " + sets.join(", ") +
            " WHERE `id` <=> ?",
            [...values, current.id]
          );

          // A linha ja foi localizada e bloqueada pela transacao.
          // affectedRows = 0 pode significar valores inalterados.
          // Nao tratar uma atualizacao idempotente como erro.

          queueEvent("crm_deals", "UPDATE", next, current);
        }

        output.push(next);
      }

      return {
        data: output,
        error: null,
        count: output.length
      };
    },
    emitTableChange
  );
}
