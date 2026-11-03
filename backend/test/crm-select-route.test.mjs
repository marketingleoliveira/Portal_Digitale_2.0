import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { normalizeCrmRow } from "../src/services/crm-normalize-row.mjs";

const source = readFileSync(
  resolve("backend/src/routes/data.transaction-preview.js"),
  "utf8"
);

const transformed = source
  .replace(/^import\s+[\s\S]*?\s+from\s+["'][^"']+["'];?\s*$/gm, "")
  .replace(/^export default router;?\s*$/gm, "");

const records = [
  {
    id: "deal-1",
    title: "Negocio A",
    owner_user_id: "user-1",
    created_by: "user-1",
    value: 100
  },
  {
    id: "deal-2",
    title: "Negocio B",
    owner_user_id: "user-2",
    created_by: "user-2",
    value: 200
  },
  {
    id: "deal-3",
    title: "Negocio C",
    owner_user_id: "user-1",
    created_by: "user-1",
    value: 300
  }
];

function setup(user = { id: "user-1", role: "vendedor" }) {
  let handler;
  const queries = [];

  const db = {
    async execute(sql, params) {
      queries.push({ sql, params });

      if (/FROM system_columns/i.test(sql)) {
        return [[{ 1: 1 }]];
      }

      if (/information_schema\.columns/i.test(sql)) {
        return [[
          { name: "id", type: "char" },
          { name: "title", type: "longtext" },
          { name: "owner_user_id", type: "char" },
          { name: "created_by", type: "char" },
          { name: "value", type: "decimal" }
        ]];
      }

      throw new Error("SQL inesperado: " + sql);
    },

    async query(sql) {
      queries.push({ sql });

      if (/SELECT \* FROM `?crm_deals`?/i.test(sql)) {
        return [records.map(row => ({ ...row }))];
      }

      throw new Error("Consulta inesperada: " + sql);
    }
  };

  const context = vm.createContext({
    console,
    crypto: { randomUUID: () => "mock-id" },
    express: {
      Router: () => ({
        post(path, fn) {
          if (path === "/query") handler = fn;
        }
      })
    },
    db,
    normalizeCrmRow,
    userFromToken: async () => user,
    tokenFrom: () => null,
    decodeRows: async (_table, rows) => rows,
    hydrateRows: async (_table, rows) => rows,
    enrichDealClients: async (_db, rows) => rows,
    filterReadableRows: async (loggedUser, _table, rows) =>
      rows.filter(row =>
        loggedUser?.role === "admin" ||
        row.owner_user_id === loggedUser?.id ||
        row.created_by === loggedUser?.id
      ),
    getNestedValue: () => null,
    emitTableChange: () => {},
    canInsertRow: async () => false,
    canUpdateRow: async () => false,
    canDeleteRow: async () => false,
    insertCrmDealsAtomic: async () => {
      throw new Error("INSERT bloqueado");
    },
    updateCrmDealsAtomic: async () => {
      throw new Error("UPDATE bloqueado");
    },
    upsertCrmDealsAtomic: async () => {
      throw new Error("UPSERT bloqueado");
    },
    CrmTransactionAbort: class extends Error {},
    validateCrmDealLoss: () => ({ valid: true })
  });

  vm.runInContext(transformed, context, {
    filename: "data.transaction-preview.js",
    timeout: 3000
  });

  assert.equal(typeof handler, "function");

  async function request(body = {}) {
    let status = 200;
    let result;

    const res = {
      status(code) {
        status = code;
        return this;
      },
      json(value) {
        result = value;
        return this;
      }
    };

    await handler({
      body: {
        table: "crm_deals",
        operation: "select",
        ...body
      }
    }, res);

    return {
      status,
      body: JSON.parse(JSON.stringify(result))
    };
  }

  return { request, queries };
}

test("SELECT retorna apenas negocios autorizados", async () => {
  const { request } = setup();
  const response = await request();

  assert.equal(response.status, 200);
  assert.deepEqual(
    response.body.data.map(row => row.id),
    ["deal-1", "deal-3"]
  );
  assert.equal(response.body.count, 2);
});

test("SELECT bloqueia usuario anonimo", async () => {
  const { request } = setup(null);
  const response = await request();

  assert.equal(response.status, 401);
  assert.equal(response.body.data, null);
});

test("SELECT aplica filtros depois da permissao", async () => {
  const { request } = setup();

  const response = await request({
    filters: [{
      type: "match",
      value: { id: "deal-2" }
    }]
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.count, 0);
  assert.deepEqual(response.body.data, []);
});

test("SELECT ordena e pagina registros autorizados", async () => {
  const { request } = setup();

  const response = await request({
    orders: [{ column: "value", ascending: false }],
    limit: 1
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.count, 2);
  assert.deepEqual(
    response.body.data.map(row => row.id),
    ["deal-3"]
  );
});

test("SELECT single responde com objeto", async () => {
  const { request } = setup();

  const response = await request({
    single: "single",
    filters: [{
      type: "match",
      value: { id: "deal-1" }
    }]
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.data.id, "deal-1");
});

test("SELECT head retorna contagem sem dados", async () => {
  const { request } = setup();

  const response = await request({ head: true });

  assert.equal(response.status, 200);
  assert.equal(response.body.data, null);
  assert.equal(response.body.count, 2);
});
