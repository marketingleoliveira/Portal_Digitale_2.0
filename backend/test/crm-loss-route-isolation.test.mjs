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
  "../src/routes/data.loss-validation-preview.js"
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
    validateCrmDealLoss,
    userFromToken: async () => options.user || null,
    tokenFrom: () => null,
    decodeRows: (_table, rows) => rows,
    hydrateRows: async () => [],
    getNestedValue: () => null,
    emitTableChange: () => {},
    canInsertRow: async () => options.canInsert ?? false,
    canUpdateRow: async () => options.canUpdate ?? false,
    canDeleteRow: async () => false,
    filterReadableRows: () => [],
    enrichDealClients: async () => []
  });

  vm.runInContext(transformed, context, {
    filename: "data.loss-validation-preview.js",
    timeout: 3000
  });

  assert.equal(typeof handler, "function");

  return handler;
}

test("rota verdadeira carrega sem MariaDB", () => {
  const handler = buildIsolatedRoute();
  assert.equal(typeof handler, "function");
});

test("acesso ao banco permanece bloqueado", async () => {
  const handler = buildIsolatedRoute();

  const req = {
    body: {
      table: "crm_deals",
      operation: "insert",
      payload: {
        status: "perdido"
      }
    }
  };

  let statusCode = 200;
  let responseBody = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseBody = data;
      return this;
    }
  };

  await handler(req, res);

  assert.equal(statusCode, 500);
  assert.ok(responseBody?.error);
});


function mockDatabase(existing = null) {
  const writes = [];

  const db = {
    async execute(sql, params = []) {
      if (sql.includes("FROM system_columns")) {
        return [[{ allowed: 1 }]];
      }

      if (sql.includes("information_schema.columns")) {
        return [[
          { name: "id", type: "char" },
          { name: "status", type: "longtext" },
          { name: "loss_reason", type: "longtext" },
          { name: "title", type: "longtext" }
        ]];
      }

      if (/information_schema.KEY_COLUMN_USAGE/i.test(sql)) {
        return [[{ name: "id" }]];
      }

      if (/SELECT \* FROM crm_deals WHERE id/i.test(sql)) {
        return [existing ? [existing] : []];
      }

      if (/UPDATE `?crm_deals`?/i.test(sql)) {
        writes.push({ sql, params });
        return [{ affectedRows: 1 }];
      }

      if (/INSERT INTO/i.test(sql)) {
        writes.push({ sql, params });
        return [{ affectedRows: 1 }];
      }

      throw new Error("SQL nao simulado: " + sql.slice(0, 80));
    },

    async query(sql) {
      if (/SELECT \* FROM `?crm_deals`?/i.test(sql)) {
        return [existing ? [existing] : []];
      }
      throw new Error("Consulta nao simulada");
    }
  };

  return { db, writes };
}

async function invokeInsert(payload, canInsert = true) {
  const mock = mockDatabase();

  const handler = buildIsolatedRoute({
    db: mock.db,
    user: { id: "usuario-teste" },
    canInsert
  });

  let code = 200;
  let body = null;

  const res = {
    status(value) {
      code = value;
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
      operation: "insert",
      payload
    }
  }, res);

  return { code, body, writes: mock.writes };
}

test("INSERT real sem motivo retorna 400", async () => {
  const result = await invokeInsert({
    status: "perdido",
    loss_reason: null
  });

  assert.equal(result.code, 400);
  assert.equal(result.body.error.message, "loss_reason_required");
  assert.equal(result.writes.length, 0);
});

test("INSERT real com motivo retorna 201", async () => {
  const result = await invokeInsert({
    status: "perdido",
    loss_reason: "Fora de perfil"
  });

  assert.equal(result.code, 201);
  assert.equal(result.writes.length, 1);
});

test("INSERT real sem permissao retorna 403", async () => {
  const result = await invokeInsert({
    status: "perdido",
    loss_reason: "Fora de perfil"
  }, false);

  assert.equal(result.code, 403);
  assert.equal(result.writes.length, 0);
});


async function invokeMutation(operation, payload, options = {}) {
  const mock = mockDatabase(options.existing ?? null);

  const handler = buildIsolatedRoute({
    db: mock.db,
    user: { id: "usuario-teste" },
    canInsert: options.canInsert ?? true,
    canUpdate: options.canUpdate ?? true
  });

  let code = 200;
  let body = null;

  const res = {
    status(value) {
      code = value;
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
      operation,
      payload
    }
  }, res);

  return { code, body, writes: mock.writes };
}

test("UPDATE real sem motivo retorna 400", async () => {
  const result = await invokeMutation(
    "update",
    { status: "perdido" },
    {
      existing: {
        id: "teste-update-1",
        status: "aberto",
        loss_reason: null
      }
    }
  );

  assert.equal(result.code, 400);
  assert.equal(result.writes.length, 0);
});

test("UPDATE real preserva motivo anterior", async () => {
  const result = await invokeMutation(
    "update",
    { title: "Titulo atualizado" },
    {
      existing: {
        id: "teste-update-2",
        status: "perdido",
        loss_reason: "Fora de perfil"
      }
    }
  );

  assert.equal(result.code, 200);
  assert.equal(result.writes.length, 1);
  assert.equal(
    result.body.data[0].loss_reason,
    "Fora de perfil"
  );
});

test("UPSERT real sem permissao retorna 403", async () => {
  const result = await invokeMutation(
    "upsert",
    { id: "teste-upsert-1", title: "Alterado" },
    {
      existing: {
        id: "teste-upsert-1",
        status: "aberto"
      },
      canInsert: true,
      canUpdate: false
    }
  );

  assert.equal(result.code, 403);
  assert.equal(result.writes.length, 0);
});

test("UPSERT real preserva motivo de perda", async () => {
  const result = await invokeMutation(
    "upsert",
    {
      id: "teste-upsert-2",
      title: "Atualizado"
    },
    {
      existing: {
        id: "teste-upsert-2",
        status: "perdido",
        loss_reason: "Fora de perfil"
      },
      canInsert: false,
      canUpdate: true
    }
  );

  assert.ok([200, 201].includes(result.code));
  assert.equal(result.writes.length, 1);
  assert.ok(
    !result.writes[0].sql.includes("`loss_reason`")
  );
});

test("UPSERT real impede nova perda sem motivo", async () => {
  const result = await invokeMutation(
    "upsert",
    {
      id: "teste-upsert-3",
      status: "perdido"
    },
    {
      existing: {
        id: "teste-upsert-3",
        status: "aberto",
        loss_reason: null
      }
    }
  );

  assert.equal(result.code, 400);
  assert.equal(result.writes.length, 0);
});


test("REGRESSAO lote INSERT nao grava quando algum item e invalido", async () => {
  const mock = mockDatabase();

  const handler = buildIsolatedRoute({
    db: mock.db,
    user: { id: "usuario-teste" },
    canInsert: true,
    canUpdate: true
  });

  let status = 200;

  const res = {
    status(value) {
      status = value;
      return this;
    },
    json() {
      return this;
    }
  };

  await handler({
    body: {
      table: "crm_deals",
      operation: "insert",
      payload: [
        {
          id: "teste-lote-1",
          status: "perdido",
          loss_reason: "Fora de perfil"
        },
        {
          id: "teste-lote-2",
          status: "perdido",
          loss_reason: null
        }
      ]
    }
  }, res);

  assert.equal(status, 400);

  // Comportamento atual indesejado:
  // o primeiro INSERT ocorre antes da rejeicao do segundo.
  assert.equal(mock.writes.length, 0);
});


test("REGRESSAO erro SQL no segundo INSERT", async () => {
  const writes = [];
  let attempts = 0;

  const db = {
    async execute(sql, params = []) {
      if (sql.includes("FROM system_columns")) {
        return [[{ allowed: 1 }]];
      }

      if (sql.includes("information_schema.columns")) {
        return [[
          { name: "id", type: "char" },
          { name: "status", type: "longtext" },
          { name: "loss_reason", type: "longtext" }
        ]];
      }

      if (/INSERT INTO/i.test(sql)) {
        attempts += 1;

        if (attempts === 2) {
          throw new Error("FALHA_SQL_SIMULADA");
        }

        writes.push({ sql, params });
        return [{ affectedRows: 1 }];
      }

      throw new Error("SQL nao simulado");
    },

    async query() {
      throw new Error("Consulta nao permitida");
    }
  };

  const handler = buildIsolatedRoute({
    db,
    user: { id: "usuario-teste" },
    canInsert: true
  });

  let status = 200;

  const res = {
    status(value) {
      status = value;
      return this;
    },
    json() {
      return this;
    }
  };

  await handler({
    body: {
      table: "crm_deals",
      operation: "insert",
      payload: [
        {
          id: "teste-sql-1",
          status: "perdido",
          loss_reason: "Sem interesse"
        },
        {
          id: "teste-sql-2",
          status: "perdido",
          loss_reason: "Fora de perfil"
        }
      ]
    }
  }, res);

  assert.equal(attempts, 2);
  assert.equal(status, 500);

  // Sem transacao, a primeira escrita nao e revertida.
  assert.equal(writes.length, 1);
});


test("REGRESSAO UPSERT parcial antes de erro 400", async () => {
  const writes = [];

  const existing = {
    id: "negocio-existente",
    status: "aberto",
    loss_reason: null,
    title: "Negocio original"
  };

  const db = {
    async execute(sql, params = []) {
      if (sql.includes("FROM system_columns")) {
        return [[{ allowed: 1 }]];
      }

      if (sql.includes("information_schema.columns")) {
        return [[
          { name: "id", type: "char" },
          { name: "status", type: "longtext" },
          { name: "loss_reason", type: "longtext" },
          { name: "title", type: "longtext" }
        ]];
      }

      if (/SELECT \* FROM crm_deals WHERE id/i.test(sql)) {
        return [[existing]];
      }

      if (/INSERT INTO/i.test(sql)) {
        writes.push({ sql, params });
        return [{ affectedRows: 1 }];
      }

      throw new Error("SQL nao simulado");
    }
  };

  const handler = buildIsolatedRoute({
    db,
    user: { id: "usuario-teste" },
    canInsert: true,
    canUpdate: true
  });

  let status = 200;

  const res = {
    status(value) {
      status = value;
      return this;
    },
    json() {
      return this;
    }
  };

  await handler({
    body: {
      table: "crm_deals",
      operation: "upsert",
      payload: [
        {
          id: "negocio-existente",
          status: "aberto",
          title: "Alteracao valida"
        },
        {
          id: "negocio-existente",
          status: "perdido",
          loss_reason: null
        }
      ]
    }
  }, res);

  assert.equal(status, 400);

  // Documenta o comportamento atual, ainda sem transacao.
  assert.equal(writes.length, 1);
});
