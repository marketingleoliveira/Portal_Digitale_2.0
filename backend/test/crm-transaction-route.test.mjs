import {
  insertCrmDealsAtomic
} from "../src/services/crm-insert-transaction.mjs";

import {
  CrmTransactionAbort
} from "../src/services/crm-transaction.mjs";

import {
  upsertCrmDealsAtomic
} from "../src/services/crm-upsert-transaction.mjs";
import { updateCrmDealsAtomic } from "../src/services/crm-update-transaction.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import vm from "node:vm";

import {
  validateCrmDealLoss
} from "../src/services/crm-loss-validation.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const preview = resolve(
  here,
  "../src/routes/data.transaction-preview.js"
);

const source = readFileSync(preview, "utf8");

// Remove apenas as declaracoes import/export do arquivo copiado.
// Nenhum modulo da API de producao e importado.
const transformed = source
  .replace(/^import\s+[\s\S]*?\s+from\s+["'][^"']+["'];?\s*$/gm, "")
  .replace(/^export default router;?\s*$/gm, "");

function buildIsolatedRoute(options = {}) {
  let handler = null;

  const fakeRouter = {
    post(path, callback) {
      if (path === "/query") {
        handler = callback;
      }
    }
  };

  const db = options.db || new Proxy({}, {
    get() {
      throw new Error(
        "Acesso ao banco bloqueado no isolamento"
      );
    }
  });

  const context = vm.createContext({
    console,
    crypto: {
      randomUUID: () => "isolated-test-id"
    },
    express: {
      Router: () => fakeRouter
    },
    db,
    insertCrmDealsAtomic,
    upsertCrmDealsAtomic,
    updateCrmDealsAtomic,
    CrmTransactionAbort,
    validateCrmDealLoss,
    userFromToken: async () => options.user || null,
    tokenFrom: () => null,
    decodeRows: (_table, rows) => rows,
    hydrateRows: async () => [],
    getNestedValue: () => null,
    emitTableChange: (...args) => options.onEvent?.(...args),
    canInsertRow: async (...args) =>
      typeof options.canInsert === "function"
        ? options.canInsert(...args)
        : (options.canInsert ?? false),
    canUpdateRow: async () => options.canUpdate ?? false,
    canDeleteRow: async () => false,
    filterReadableRows: () => [],
    enrichDealClients: async () => []
  });

  vm.runInContext(transformed, context, {
    filename: "data.transaction-preview.js",
    timeout: 3000
  });

  assert.equal(typeof handler, "function");

  return handler;
}



function transactionalMock(failAt = 0) {
  const actions = [];
  const pending = [];
  const committed = [];
  let attempts = 0;

  const connection = {
    async beginTransaction() {
      actions.push("BEGIN");
    },

    async execute(sql, params = []) {
      attempts += 1;
      actions.push("EXECUTE");

      if (attempts === failAt) {
        throw new Error("FALHA_SQL_SIMULADA");
      }

      pending.push({ sql, params });
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

  const db = {
    async execute(sql) {
      if (sql.includes("FROM system_columns")) {
        return [[{ allowed: 1 }]];
      }

      if (sql.includes("information_schema.columns")) {
        return [[
          { name: "id", type: "char" },
          { name: "status", type: "longtext" },
          { name: "loss_reason", type: "longtext" },
          { name: "created_by", type: "char" },
          { name: "owner_user_id", type: "char" }
        ]];
      }

      throw new Error("SQL fora do mock: " + sql.slice(0, 80));
    },

    async getConnection() {
      actions.push("GET_CONNECTION");
      return connection;
    }
  };

  return {
    db,
    actions,
    pending,
    committed,
    get attempts() {
      return attempts;
    }
  };
}

const validRecords = [
  {
    id: "negocio-integracao-1",
    status: "perdido",
    loss_reason: "Sem interesse",
    created_by: "usuario-teste",
    owner_user_id: "usuario-teste"
  },
  {
    id: "negocio-integracao-2",
    status: "perdido",
    loss_reason: "Fora de perfil",
    created_by: "usuario-teste",
    owner_user_id: "usuario-teste"
  }
];

async function invokeTransactionalInsert({
  payload = validRecords,
  failAt = 0,
  canInsert = true
} = {}) {
  const mock = transactionalMock(failAt);
  const events = [];

  const handler = buildIsolatedRoute({
    db: mock.db,
    user: { id: "usuario-teste" },
    canInsert,
    onEvent: (...args) => {
      events.push({
        args,
        committedAtEmission: mock.actions.includes("COMMIT")
      });
    }
  });

  let statusCode = 200;
  let responseBody = null;

  const res = {
    status(value) {
      statusCode = value;
      return this;
    },
    json(value) {
      responseBody = value;
      return this;
    }
  };

  await handler({
    body: {
      table: "crm_deals",
      operation: "insert",
      payload
    }
  }, res);

  return {
    mock,
    events,
    statusCode,
    responseBody
  };
}

test("ROTA EXPERIMENTAL: INSERT confirma lote completo", async () => {
  const result = await invokeTransactionalInsert();

  assert.equal(result.statusCode, 201);
  assert.equal(result.responseBody?.count, 2);
  assert.equal(result.mock.committed.length, 2);
  assert.equal(result.events.length, 2);

  assert.ok(
    result.events.every(event => event.committedAtEmission)
  );

  assert.ok(result.mock.actions.includes("RELEASE"));
});

test("ROTA EXPERIMENTAL: motivo ausente retorna 400", async () => {
  const result = await invokeTransactionalInsert({
    payload: [
      validRecords[0],
      { ...validRecords[1], loss_reason: null }
    ]
  });

  assert.equal(result.statusCode, 400);
  assert.equal(result.mock.committed.length, 0);
  assert.equal(result.mock.attempts, 0);
  assert.equal(result.events.length, 0);
});

test("ROTA EXPERIMENTAL: sem permissao retorna 403", async () => {
  const result = await invokeTransactionalInsert({
    canInsert: false
  });

  assert.equal(result.statusCode, 403);
  assert.equal(result.mock.committed.length, 0);
  assert.equal(result.mock.attempts, 0);
  assert.equal(result.events.length, 0);
});

test("ROTA EXPERIMENTAL: erro SQL executa ROLLBACK", async () => {
  const result = await invokeTransactionalInsert({
    failAt: 2
  });

  assert.equal(result.statusCode, 500);
  assert.equal(result.mock.attempts, 2);
  assert.equal(result.mock.committed.length, 0);
  assert.equal(result.mock.pending.length, 0);
  assert.equal(result.events.length, 0);

  assert.ok(result.mock.actions.includes("ROLLBACK"));
  assert.ok(result.mock.actions.includes("RELEASE"));
  assert.ok(!result.mock.actions.includes("COMMIT"));
});


async function invokeExperimentalUpsert({
  payload = { id: "a", title: "Atualizado" },
  canUpdate = true,
  canInsert = true,
  failWrite = false,
  duplicate = false
} = {}) {
  const actions = [];
  const pending = [];
  const committed = [];
  const events = [];

  const existing = {
    id: "a",
    title: "Original",
    status: "aberto",
    loss_reason: null,
    created_by: "usuario-teste",
    owner_user_id: "usuario-teste"
  };

  const connection = {
    async beginTransaction() {
      actions.push("BEGIN");
    },
    async execute(sql, params = []) {
      if (/FOR UPDATE/i.test(sql)) {
        actions.push("SELECT_FOR_UPDATE");
        return [params[0] === "a" ? [existing] : []];
      }

      actions.push("WRITE");

      if (duplicate) {
        const error = new Error("DUPLICATE_SIMULADO");
        error.code = "ER_DUP_ENTRY";
        throw error;
      }

      if (failWrite && pending.length === 1) {
        throw new Error("FALHA_SQL_SIMULADA");
      }

      pending.push({ sql, params });
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

  const db = {
    async execute(sql) {
      if (sql.includes("FROM system_columns")) {
        return [[{ allowed: 1 }]];
      }
      if (sql.includes("information_schema.columns")) {
        return [[
          { name: "id", type: "char" },
          { name: "title", type: "longtext" },
          { name: "status", type: "longtext" },
          { name: "loss_reason", type: "longtext" },
          { name: "created_by", type: "char" },
          { name: "owner_user_id", type: "char" }
        ]];
      }
      throw new Error("Consulta nao simulada");
    },
    async getConnection() {
      actions.push("GET_CONNECTION");
      return connection;
    }
  };

  const handler = buildIsolatedRoute({
    db,
    user: { id: "usuario-teste" },
    canUpdate,
    canInsert,
    onEvent: (...args) => {
      events.push({
        args,
        afterCommit: actions.includes("COMMIT")
      });
    }
  });

  let status = 200;
  let body = null;

  const res = {
    status(code) {
      status = code;
      return this;
    },
    json(value) {
      body = value;
      return this;
    }
  };

  await handler({
    body: {
      table: "crm_deals",
      operation: "upsert",
      payload
    }
  }, res);

  return { status, body, actions, pending, committed, events };
}

test("ROTA EXPERIMENTAL: UPSERT confirma alteracao", async () => {
  const r = await invokeExperimentalUpsert();

  assert.equal(r.status, 200);
  assert.equal(r.committed.length, 1);
  assert.match(r.committed[0].sql, /^UPDATE/);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].afterCommit, true);
  assert.ok(r.actions.includes("SELECT_FOR_UPDATE"));
  assert.ok(r.actions.includes("RELEASE"));
});

test("ROTA EXPERIMENTAL: UPSERT invalido faz rollback", async () => {
  const r = await invokeExperimentalUpsert({
    payload: [
      { id: "a", title: "Primeira alteracao" },
      { id: "a", status: "perdido", loss_reason: null }
    ]
  });

  assert.equal(r.status, 400);
  assert.equal(r.committed.length, 0);
  assert.equal(r.pending.length, 0);
  assert.equal(r.events.length, 0);
  assert.ok(r.actions.includes("ROLLBACK"));
});

test("ROTA EXPERIMENTAL: UPSERT sem permissao retorna 403", async () => {
  const r = await invokeExperimentalUpsert({ canUpdate: false });

  assert.equal(r.status, 403);
  assert.equal(r.committed.length, 0);
  assert.equal(r.events.length, 0);
  assert.ok(r.actions.includes("ROLLBACK"));
});

test("ROTA EXPERIMENTAL: UPSERT erro SQL faz rollback", async () => {
  const r = await invokeExperimentalUpsert({
    payload: [
      { id: "a", title: "Primeira" },
      { id: "b", title: "Segunda", status: "aberto" }
    ],
    failWrite: true
  });

  assert.equal(r.status, 500);
  assert.equal(r.committed.length, 0);
  assert.equal(r.pending.length, 0);
  assert.equal(r.events.length, 0);
  assert.ok(r.actions.includes("ROLLBACK"));
});

test("ROTA EXPERIMENTAL: UPSERT conflito retorna 409", async () => {
  const r = await invokeExperimentalUpsert({
    payload: {
      id: "b",
      status: "aberto",
      title: "Novo negocio"
    },
    duplicate: true
  });

  assert.equal(r.status, 409);
  assert.equal(r.body?.error?.message, "crm_deal_concurrent_conflict");
  assert.equal(r.committed.length, 0);
  assert.equal(r.events.length, 0);
  assert.ok(r.actions.includes("ROLLBACK"));
});


test("ROTA EXPERIMENTAL: UPDATE confirma transacao", async () => {
  const actions = [];
  const pending = [];
  const committed = [];
  const events = [];

  const db = {
    async execute(sql) {
      if (sql.includes("FROM system_columns")) {
        return [[{ allowed: 1 }]];
      }
      if (sql.includes("information_schema.columns")) {
        return [[
          { name: "id", type: "char" },
          { name: "title", type: "varchar" },
          { name: "status", type: "varchar" },
          { name: "loss_reason", type: "varchar" }
        ]];
      }
      throw Error("SQL fora da transacao");
    },

    async getConnection() {
      return {
        async beginTransaction() {
          actions.push("BEGIN");
        },
        async execute(sql, params = []) {
          const row = {
            id: "negocio-1",
            title: "Original",
            status: "aberto",
            loss_reason: null
          };

          if (sql === "SELECT * FROM `crm_deals`") {
            actions.push("SCAN");
            return [[row]];
          }

          if (sql.includes("FOR UPDATE")) {
            actions.push("LOCK");
            return [params[0] === row.id ? [row] : []];
          }

          actions.push("WRITE");
          pending.push(sql);
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
    }
  };

  const handler = buildIsolatedRoute({
    db,
    user: { id: "usuario-teste" },
    canUpdate: true,
    onEvent: (...args) => {
      assert.ok(actions.includes("COMMIT"));
      events.push(args);
    }
  });

  let status = 200;
  let response = null;

  const res = {
    status(code) {
      status = code;
      return this;
    },
    json(data) {
      response = data;
      return this;
    }
  };

  await handler({
    body: {
      table: "crm_deals",
      operation: "update",
      payload: { title: "Atualizado" },
      filters: []
    }
  }, res);

  assert.equal(status, 200);
  assert.equal(response?.count, 1);
  assert.equal(committed.length, 1);
  assert.equal(events.length, 1);
  assert.deepEqual(actions, [
    "BEGIN", "SCAN", "LOCK", "WRITE", "COMMIT", "RELEASE"
  ]);
});

async function checkUpdateFailure({ patch, allowed = true, failAt = 0 }) {
  const actions = [], pending = [], saved = [], events = [];
  let writes = 0;

  const db = {
    async execute(sql) {
      if (sql.includes("FROM system_columns")) {
        return [[{ allowed: 1 }]];
      }
      if (sql.includes("information_schema.columns")) {
        return [[
          { name: "id", type: "char" },
          { name: "status", type: "varchar" },
          { name: "loss_reason", type: "varchar" },
          { name: "title", type: "varchar" }
        ]];
      }
      throw Error("SQL fora da transacao");
    },
    async getConnection() {
      return {
        async beginTransaction() { actions.push("BEGIN"); },
        async execute(sql, params = []) {
          const rows = [
            { id: "a", status: "aberto", loss_reason: null },
            { id: "b", status: "aberto", loss_reason: null }
          ];

          if (sql === "SELECT * FROM `crm_deals`") {
            return [rows];
          }

          if (sql.includes("FOR UPDATE")) {
            return [rows.filter(row => row.id === params[0])];
          }

          writes++;
          if (writes === failAt) throw Error("FALHA_SQL_TESTE");
          pending.push(sql);
          return [{ affectedRows: 1 }];
        },
        async commit() {
          saved.push(...pending);
          pending.length = 0;
          actions.push("COMMIT");
        },
        async rollback() {
          pending.length = 0;
          actions.push("ROLLBACK");
        },
        release() { actions.push("RELEASE"); }
      };
    }
  };

  const handler = buildIsolatedRoute({
    db,
    user: { id: "teste" },
    canUpdate: allowed,
    onEvent: (...args) => events.push(args)
  });

  let status = 200;
  const res = {
    status(code) { status = code; return this; },
    json() { return this; }
  };

  await handler({
    body: {
      table: "crm_deals",
      operation: "update",
      payload: patch,
      filters: []
    }
  }, res);

  return { status, actions, pending, saved, events, writes };
}

test("UPDATE rota: motivo ausente retorna 400", async () => {
  const r = await checkUpdateFailure({
    patch: { status: "perdido", loss_reason: null }
  });
  assert.equal(r.status, 400);
  assert.equal(r.saved.length, 0);
  assert.equal(r.events.length, 0);
  assert.ok(r.actions.includes("ROLLBACK"));
});

test("UPDATE rota: sem permissao ignora registros", async () => {
  const r = await checkUpdateFailure({
    patch: { title: "Teste" },
    allowed: false
  });
  assert.equal(r.status, 200);
  assert.equal(r.writes, 0);
  assert.equal(r.events.length, 0);
});

test("UPDATE rota: falha na segunda gravacao reverte lote", async () => {
  const r = await checkUpdateFailure({
    patch: { title: "Teste" },
    failAt: 2
  });
  assert.equal(r.status, 500);
  assert.equal(r.saved.length, 0);
  assert.equal(r.pending.length, 0);
  assert.equal(r.events.length, 0);
  assert.ok(r.actions.includes("ROLLBACK"));
});
