import {
  withCrmTransaction,
  CrmTransactionAbort
} from "./crm-transaction.mjs";

export async function insertCrmDealsAtomic({
  pool,
  payload,
  schema,
  user,
  canInsertRow,
  validateCrmDealLoss,
  nativeValue,
  emitTableChange,
  randomUUID
}) {
  const records = Array.isArray(payload) ? payload : [payload];
  const prepared = [];

  // Prepara e valida TODOS os registros antes de gravar.
  for (const original of records) {
    const item = { ...(original || {}) };

    if (schema.has("id") && !item.id) {
      item.id = randomUUID();
    }

    const check = validateCrmDealLoss(null, item, item);

    if (!check.valid) {
      throw new CrmTransactionAbort(
        400, check.code, check.message
      );
    }

    if (!await canInsertRow(user, "crm_deals", item)) {
      throw new CrmTransactionAbort(403, "forbidden");
    }

    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(item)) {
      if (key === "data" || !schema.has(key)) continue;

      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        throw new CrmTransactionAbort(400, "invalid_column");
      }

      fields.push("`" + key + "`");
      values.push(nativeValue(value, schema.get(key)));
    }

    if (schema.has("data")) {
      fields.push("`data`");
      values.push(JSON.stringify(item));
    }

    if (!fields.length) {
      throw new CrmTransactionAbort(400, "no_valid_columns");
    }

    const placeholders = fields.map(() => "?").join(",");

    prepared.push({
      item,
      sql:
        "INSERT INTO `crm_deals` (" + fields.join(",") +
        ") VALUES (" + placeholders + ")",
      values
    });
  }

  return withCrmTransaction(
    pool,
    async ({ connection, queueEvent }) => {
      const output = [];

      for (const entry of prepared) {
        await connection.execute(entry.sql, entry.values);

        queueEvent("crm_deals", "INSERT", entry.item, null);
        output.push(entry.item);
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
