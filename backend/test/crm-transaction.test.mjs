import test from "node:test";
import assert from "node:assert/strict";
import { withCrmTransaction, CrmTransactionAbort } from "../src/services/crm-transaction.mjs";

function fakePool(failOnSecondWrite = false) {
  const actions = [];
  const pending = [];
  const committed = [];

  const connection = {
    async beginTransaction() {
      actions.push("BEGIN");
    },
    async execute(sql, values) {
      actions.push("EXECUTE");
      if (failOnSecondWrite && pending.length === 1) {
        throw new Error("FALHA_SQL_SIMULADA");
      }
      pending.push({ sql, values });
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

  return {
    actions,
    pending,
    committed,
    async getConnection() {
      actions.push("GET_CONNECTION");
      return connection;
    }
  };
}

test("confirma todas as gravacoes validas", async () => {
  const pool = fakePool();
  const events = [];

  await withCrmTransaction(
    pool,
    async ({ connection, queueEvent }) => {
      await connection.execute("INSERT 1", ["a"]);
      queueEvent("INSERT", "a");
      await connection.execute("INSERT 2", ["b"]);
      queueEvent("INSERT", "b");
    },
    (...args) => {
      assert.ok(pool.actions.includes("COMMIT"));
      events.push(args);
    }
  );

  assert.equal(pool.committed.length, 2);
  assert.equal(events.length, 2);
  assert.ok(pool.actions.includes("RELEASE"));
});

test("desfaz tudo quando segunda gravacao falha", async () => {
  const pool = fakePool(true);
  const events = [];

  await assert.rejects(
    withCrmTransaction(
      pool,
      async ({ connection, queueEvent }) => {
        await connection.execute("INSERT 1", ["a"]);
        queueEvent("INSERT", "a");
        await connection.execute("INSERT 2", ["b"]);
      },
      (...args) => events.push(args)
    ),
    /FALHA_SQL_SIMULADA/
  );

  assert.equal(pool.committed.length, 0);
  assert.equal(events.length, 0);
  assert.ok(pool.actions.includes("ROLLBACK"));
  assert.ok(pool.actions.includes("RELEASE"));
  assert.ok(!pool.actions.includes("COMMIT"));
});

test("nao publica eventos antes do commit", async () => {
  const pool = fakePool();
  let emitted = false;

  await withCrmTransaction(
    pool,
    async ({ connection, queueEvent }) => {
      await connection.execute("INSERT", []);
      queueEvent("INSERT");
      assert.equal(emitted, false);
    },
    () => { emitted = true; }
  );

  assert.equal(emitted, true);
});

test("libera conexao e propaga erro de validacao", async () => {
  const pool = fakePool();

  await assert.rejects(
    withCrmTransaction(
      pool,
      async () => {
        throw new Error("loss_reason_required");
      }
    ),
    /loss_reason_required/
  );

  assert.ok(pool.actions.includes("ROLLBACK"));
  assert.ok(pool.actions.includes("RELEASE"));
});


test("erro 400 provoca rollback sem publicar eventos", async () => {
  const pool = fakePool();
  const events = [];

  await assert.rejects(
    withCrmTransaction(
      pool,
      async ({ connection, queueEvent }) => {
        await connection.execute("INSERT 1", ["a"]);
        queueEvent("INSERT", "a");

        throw new CrmTransactionAbort(
          400,
          "loss_reason_required"
        );
      },
      (...args) => events.push(args)
    ),
    error =>
      error instanceof CrmTransactionAbort &&
      error.status === 400 &&
      error.message === "loss_reason_required"
  );

  assert.equal(pool.committed.length, 0);
  assert.equal(events.length, 0);
  assert.ok(pool.actions.includes("ROLLBACK"));
  assert.ok(!pool.actions.includes("COMMIT"));
});

test("erro 403 provoca rollback sem publicar eventos", async () => {
  const pool = fakePool();
  const events = [];

  await assert.rejects(
    withCrmTransaction(
      pool,
      async ({ connection, queueEvent }) => {
        await connection.execute("INSERT 1", ["a"]);
        queueEvent("INSERT", "a");

        throw new CrmTransactionAbort(
          403,
          "forbidden"
        );
      },
      (...args) => events.push(args)
    ),
    error =>
      error instanceof CrmTransactionAbort &&
      error.status === 403 &&
      error.message === "forbidden"
  );

  assert.equal(pool.committed.length, 0);
  assert.equal(events.length, 0);
  assert.ok(pool.actions.includes("ROLLBACK"));
  assert.ok(!pool.actions.includes("COMMIT"));
});
