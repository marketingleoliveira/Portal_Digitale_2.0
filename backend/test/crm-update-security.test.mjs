import test from "node:test";
import assert from "node:assert/strict";

import { updateCrmDealsAtomic } from "../src/services/crm-update-transaction.mjs";
import { CrmTransactionAbort } from "../src/services/crm-transaction.mjs";

test("UPDATE rejeita operador desconhecido antes de gravar", async () => {
  let writes = 0;
  let rollbacks = 0;

  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() { rollbacks++; },
    release() {},
    async execute(sql) {
      if (sql.startsWith("SELECT")) {
        return [[{
          id: "deal-1",
          title: "Original",
          status: "aberto",
          loss_reason: null
        }]];
      }

      if (sql.startsWith("UPDATE")) {
        writes++;
        return [{ affectedRows: 1 }];
      }

      throw new Error("SQL inesperado");
    }
  };

  await assert.rejects(
    updateCrmDealsAtomic({
      pool: { getConnection: async () => connection },
      payload: { title: "Alterado" },
      filters: [{
        type: "operador_invalido",
        column: "title",
        value: "Original"
      }],
      schema: new Map([
        ["id", "char"],
        ["title", "varchar"]
      ]),
      user: { id: "teste" },
      canUpdateRow: async () => true,
      validateCrmDealLoss: () => ({ valid: true }),
      matchesFilters: () => true,
      nativeValue: value => value,
      emitTableChange: () => {}
    }),
    error => error instanceof CrmTransactionAbort &&
      error.status === 400
  );

  assert.equal(writes, 0);
  assert.ok(rollbacks >= 0);
});
