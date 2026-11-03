import test from "node:test";
import assert from "node:assert/strict";

import {
  insertCrmDealsAtomic
} from "../src/services/crm-insert-transaction.mjs";

import {
  CrmTransactionAbort
} from "../src/services/crm-transaction.mjs";

function makeEnvironment({ failAt = 0, allowed = true } = {}) {
  const actions = [];
  const committed = [];
  const pending = [];
  const events = [];
  let attempts = 0;

  const connection = {
    async beginTransaction() {
      actions.push("BEGIN");
    },
    async execute(sql, values) {
      attempts += 1;
      actions.push("EXECUTE");

      if (failAt === attempts) {
        throw new Error("FALHA_SQL_SIMULADA");
      }

      pending.push({ sql, values });
      return [{ affectedRows: 1 }];
    },
    async commit() {
      actions.push("COMMIT");
      committed.push(...pending);
      pending.length = 0;
    },
    async rollback() {
      actions.push("ROLLBACK");
      pending.length = 0;
    },
    release() {
      actions.push("RELEASE");
    }
  };

  const pool = {
    async getConnection() {
      actions.push("GET_CONNECTION");
      return connection;
    }
  };

  const schema = new Map([
    ["id", "char"],
    ["status", "longtext"],
    ["loss_reason", "longtext"],
    ["created_by", "char"],
    ["owner_user_id", "char"],
    ["data", "longtext"]
  ]);

  const run = payload => insertCrmDealsAtomic({
    pool,
    payload,
    schema,
    user: { id: "usuario-teste" },
    canInsertRow: async () => allowed,
    validateCrmDealLoss: (_current, next) => {
      if (
        next.status === "perdido" &&
        !String(next.loss_reason || "").trim()
      ) {
        return {
          valid: false,
          code: "loss_reason_required",
          message: "Motivo obrigatorio"
        };
      }
      return { valid: true };
    },
    nativeValue: value => value,
    emitTableChange: (...args) => {
      assert.ok(actions.includes("COMMIT"));
      events.push(args);
    },
    randomUUID: () => "uuid-simulado"
  });

  return {
    run, actions, committed, pending, events,
    get attempts() { return attempts; }
  };
}

const valid = [
  {
    id: "negocio-1",
    status: "perdido",
    loss_reason: "Fora de perfil",
    created_by: "usuario-teste",
    owner_user_id: "usuario-teste"
  },
  {
    id: "negocio-2",
    status: "perdido",
    loss_reason: "Sem interesse",
    created_by: "usuario-teste",
    owner_user_id: "usuario-teste"
  }
];

test("INSERT confirma lote completo e eventos apos COMMIT", async () => {
  const env = makeEnvironment();
  const result = await env.run(valid);

  assert.equal(result.count, 2);
  assert.equal(env.committed.length, 2);
  assert.equal(env.events.length, 2);
  assert.ok(env.actions.includes("COMMIT"));
  assert.ok(env.actions.includes("RELEASE"));
});

test("INSERT invalido nao inicia transacao nem grava", async () => {
  const env = makeEnvironment();

  await assert.rejects(
    env.run([
      valid[0],
      { ...valid[1], loss_reason: null }
    ]),
    error =>
      error instanceof CrmTransactionAbort &&
      error.status === 400
  );

  assert.equal(env.attempts, 0);
  assert.equal(env.events.length, 0);
});

test("INSERT sem autorizacao retorna erro 403", async () => {
  const env = makeEnvironment({ allowed: false });

  await assert.rejects(
    env.run(valid),
    error =>
      error instanceof CrmTransactionAbort &&
      error.status === 403
  );

  assert.equal(env.attempts, 0);
  assert.equal(env.committed.length, 0);
});

test("falha na segunda gravacao executa ROLLBACK", async () => {
  const env = makeEnvironment({ failAt: 2 });

  await assert.rejects(
    env.run(valid),
    /FALHA_SQL_SIMULADA/
  );

  assert.equal(env.attempts, 2);
  assert.equal(env.committed.length, 0);
  assert.equal(env.pending.length, 0);
  assert.equal(env.events.length, 0);
  assert.ok(env.actions.includes("ROLLBACK"));
  assert.ok(env.actions.includes("RELEASE"));
  assert.ok(!env.actions.includes("COMMIT"));
});
