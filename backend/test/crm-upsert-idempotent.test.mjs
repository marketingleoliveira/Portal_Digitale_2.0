import test from "node:test";
import assert from "node:assert/strict";
import { upsertCrmDealsAtomic } from "../src/services/crm-upsert-transaction.mjs";

async function executar({ falhaSql = false } = {}) {
  const actions = [];
  const events = [];

  const connection = {
    async beginTransaction() {
      actions.push("BEGIN");
    },
    async commit() {
      actions.push("COMMIT");
    },
    async rollback() {
      actions.push("ROLLBACK");
    },
    release() {
      actions.push("RELEASE");
    },
    async execute(sql) {
      if (sql.startsWith("SELECT")) {
        actions.push("SELECT");
        return [[{
          id: "deal-1",
          status: "aberto",
          data: JSON.stringify({ status: "aberto" })
        }]];
      }

      if (sql.startsWith("UPDATE")) {
        actions.push("UPDATE");

        if (falhaSql) {
          throw new Error("FALHA_SQL_SIMULADA");
        }

        return [{ affectedRows: 0 }];
      }

      throw new Error("SQL_INESPERADO");
    }
  };

  const pool = {
    async getConnection() {
      return connection;
    }
  };

  const executarUpsert = () => upsertCrmDealsAtomic({
    pool,
    payload: {
      id: "deal-1",
      status: "aberto"
    },
    schema: new Map([
      ["id", {}],
      ["status", {}],
      ["data", {}]
    ]),
    user: {},
    canInsertRow: async () => true,
    canUpdateRow: async () => true,
    validateCrmDealLoss: () => ({ valid: true }),
    nativeValue: value => value,
    emitTableChange: (...args) => events.push(args),
    randomUUID: () => "novo-id"
  });

  return { executarUpsert, actions, events };
}

test("UPSERT idempotente confirma transacao", async () => {
  const ctx = await executar();

  const result = await ctx.executarUpsert();

  assert.equal(result.error, null);
  assert.equal(result.count, 1);

  assert.deepEqual(ctx.actions, [
    "BEGIN",
    "SELECT",
    "UPDATE",
    "COMMIT",
    "RELEASE"
  ]);

  assert.equal(ctx.events.length, 1);
});

test("UPSERT com erro SQL executa rollback", async () => {
  const ctx = await executar({ falhaSql: true });

  await assert.rejects(
    ctx.executarUpsert(),
    /FALHA_SQL_SIMULADA/
  );

  assert.deepEqual(ctx.actions, [
    "BEGIN",
    "SELECT",
    "UPDATE",
    "ROLLBACK",
    "RELEASE"
  ]);

  assert.equal(ctx.events.length, 0);
});
