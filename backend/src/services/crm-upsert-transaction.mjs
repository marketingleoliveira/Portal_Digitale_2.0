import { normalizeCrmRow } from "./crm-normalize-row.mjs";
import {
  withCrmTransaction,
  CrmTransactionAbort
} from "./crm-transaction.mjs";

const quote = key => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    throw new CrmTransactionAbort(400, "invalid_column");
  }
  return "`" + key + "`";
};

export async function upsertCrmDealsAtomic({
  pool, payload, schema, user, canInsertRow, canUpdateRow,
  validateCrmDealLoss, nativeValue, emitTableChange, randomUUID
}) {
  const records = Array.isArray(payload) ? payload : [payload];

  return withCrmTransaction(
    pool,
    async ({ connection, queueEvent }) => {
      const output = [];

      for (const original of records) {
        const item = { ...(original || {}) };

        if (!item.id) item.id = randomUUID();

        const [rows] = await connection.execute(
          "SELECT * FROM `crm_deals` WHERE id = ? LIMIT 1 FOR UPDATE",
          [item.id]
        );

        const current = rows[0] ? normalizeCrmRow(rows[0]) : null;
        const allowed = current
          ? await canUpdateRow(user, "crm_deals", current, item)
          : await canInsertRow(user, "crm_deals", item);

        if (!allowed) {
          throw new CrmTransactionAbort(403, "forbidden");
        }

        const next = current ? { ...current, ...item } : item;
        const check = validateCrmDealLoss(current, next, item);

        if (!check.valid) {
          throw new CrmTransactionAbort(
            400, check.code, check.message
          );
        }

        const fields = [];
        const values = [];

        for (const [key, value] of Object.entries(item)) {
          if (key === "data" || !schema.has(key)) continue;
          if (current && key === "id") continue;

          fields.push(quote(key));
          values.push(nativeValue(value, schema.get(key)));
        }

        if (schema.has("data")) {
          fields.push("`data`");
          values.push(JSON.stringify(next));
        }

        if (!fields.length) {
          throw new CrmTransactionAbort(400, "no_valid_columns");
        }

        if (current) {
          const sets = fields.map(field => field + " = ?");
          if (schema.has("updated_at")) {
            sets.push("`updated_at` = CURRENT_TIMESTAMP");
          }

          const [result] = await connection.execute(
            "UPDATE `crm_deals` SET " + sets.join(", ") +
            " WHERE `id` = ?",
            [...values, item.id]
          );

          // O registro foi localizado com SELECT FOR UPDATE.
          // affectedRows = 0 pode indicar operacao idempotente.
          // Erros SQL continuam provocando ROLLBACK.
        } else {
          const placeholders = fields.map(() => "?").join(",");
          try {
            await connection.execute(
              "INSERT INTO `crm_deals` (" +
              fields.join(",") + ") VALUES (" +
              placeholders + ")",
              values
            );
          } catch (error) {
            if (error?.code === "ER_DUP_ENTRY") {
              throw new CrmTransactionAbort(
                409, "crm_deal_concurrent_conflict"
              );
            }
            throw error;
          }
        }

        queueEvent(
          "crm_deals",
          current ? "UPDATE" : "INSERT",
          next,
          current
        );

        output.push(next);
      }

      return {
        data: Array.isArray(payload) ? output : output[0],
        error: null,
        count: output.length
      };
    },
    emitTableChange
  );
}
