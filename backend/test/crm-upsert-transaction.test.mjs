import test from "node:test";
import assert from "node:assert/strict";
import { upsertCrmDealsAtomic } from "../src/services/crm-upsert-transaction.mjs";
import { CrmTransactionAbort } from "../src/services/crm-transaction.mjs";

function environment({ failSecond = false, allow = true } = {}) {
  const actions = [], pending = [], committed = [], events = [];
  let writes = 0;

  const existing = {
    id: "a", status: "aberto", loss_reason: null,
    created_by: "u", owner_user_id: "u"
  };

  const connection = {
    async beginTransaction() { actions.push("BEGIN"); },
    async execute(sql, params) {
      if (/SELECT .*FOR UPDATE/i.test(sql)) {
        return [[params[0] === "a" ? existing : null].filter(Boolean)];
      }
      writes++;
      if (failSecond && writes === 2) {
        throw new Error("FALHA_SQL_SIMULADA");
      }
      pending.push({ sql, params });
      return [{ affectedRows: 1 }];
    },
    async commit() {
      committed.push(...pending);
      pending.length = 0;
      actions.push("COMMIT");
    },
    async rollback() {
      pending.length = 0;
      actions.push("ROLLBACK");
    },
    release() { actions.push("RELEASE"); }
  };

  const pool = {
    async getConnection() { return connection; }
  };

  const schema = new Map([
    ["id", "char"], ["status", "varchar"],
    ["loss_reason", "varchar"], ["title", "varchar"],
    ["created_by", "char"], ["owner_user_id", "char"],
    ["data", "longtext"]
  ]);

  const run = payload => upsertCrmDealsAtomic({
    pool, payload, schema, user: { id: "u" },
    canInsertRow: async () => allow,
    canUpdateRow: async () => allow,
    validateCrmDealLoss: (current, next) => {
      if (next.status === "perdido" &&
          current?.status !== "perdido" &&
          !String(next.loss_reason || "").trim()) {
        return {
          valid: false, code: "loss_reason_required",
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
    randomUUID: () => "novo-id"
  });

  return {
    run, actions, pending, committed, events,
    get writes() { return writes; }
  };
}

test("UPSERT atualiza negocio existente e confirma", async () => {
  const env = environment();
  const result = await env.run({
    id: "a", status: "perdido",
    loss_reason: "Fora de perfil"
  });
  assert.equal(result.count, 1);
  assert.equal(env.committed.length, 1);
  assert.equal(env.events.length, 1);
  assert.match(env.committed[0].sql, /^UPDATE/);
});

test("UPSERT com segundo negocio invalido desfaz primeiro", async () => {
  const env = environment();
  await assert.rejects(
    env.run([
      { id: "a", title: "Alteracao valida" },
      { id: "a", status: "perdido", loss_reason: null }
    ]),
    error => error instanceof CrmTransactionAbort &&
      error.status === 400
  );
  assert.equal(env.committed.length, 0);
  assert.equal(env.pending.length, 0);
  assert.equal(env.events.length, 0);
  assert.ok(env.actions.includes("ROLLBACK"));
});

test("UPSERT sem autorizacao nao grava", async () => {
  const env = environment({ allow: false });
  await assert.rejects(
    env.run({ id: "a", title: "Alteracao" }),
    error => error instanceof CrmTransactionAbort &&
      error.status === 403
  );
  assert.equal(env.writes, 0);
  assert.equal(env.committed.length, 0);
});

test("UPSERT desfaz lote com erro SQL intermediario", async () => {
  const env = environment({ failSecond: true });
  await assert.rejects(
    env.run([
      { id: "a", title: "Primeiro" },
      { id: "b", status: "aberto" }
    ]),
    /FALHA_SQL_SIMULADA/
  );
  assert.equal(env.committed.length, 0);
  assert.equal(env.pending.length, 0);
  assert.equal(env.events.length, 0);
  assert.ok(env.actions.includes("ROLLBACK"));
});

test("UPSERT cria novo negocio por INSERT", async () => {
  const env = environment();
  await env.run({
    id: "b", status: "perdido",
    loss_reason: "Sem interesse"
  });
  assert.match(env.committed[0].sql, /^INSERT/);
  assert.equal(env.events[0][1], "INSERT");
});
