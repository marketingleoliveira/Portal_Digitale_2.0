import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(
  "backend/src/lib/authorization.js",
  "utf8"
);

const transformed = source
  .replace(/^import[^\n]*\n/gm, "")
  .replace(/^export /gm, "");

function setup() {
  const deals = [
    {
      id: "deal-1",
      owner_user_id: "user-1",
      created_by: "user-2"
    },
    {
      id: "deal-2",
      owner_user_id: "user-3",
      created_by: "user-3"
    }
  ];

  const queries = [];

  const db = {
    async execute(sql, params) {
      queries.push({ sql, params });

      assert.match(
        sql,
        /SELECT 1 FROM crm_deals/
      );

      assert.match(
        sql,
        /owner_user_id=\? OR created_by=\?/
      );

      const [id, owner, creator] = params;

      const found = deals.find(
        row =>
          row.id === id &&
          (
            row.owner_user_id === owner ||
            row.created_by === creator
          )
      );

      return [found ? [{ 1: 1 }] : []];
    }
  };

  const context = vm.createContext({ db });

  vm.runInContext(transformed, context, {
    filename: "authorization-isolated.js",
    timeout: 3000
  });

  return {
    canReadRow: context.canReadRow,
    filterReadableRows: context.filterReadableRows,
    queries
  };
}

test("proprietario visualiza seu negocio", async () => {
  const ctx = setup();

  assert.equal(
    await ctx.canReadRow(
      { id: "user-1", role: "vendedor" },
      "crm_deals",
      { id: "deal-1" }
    ),
    true
  );
});

test("criador visualiza seu negocio", async () => {
  const ctx = setup();

  assert.equal(
    await ctx.canReadRow(
      { id: "user-2", role: "sdr" },
      "crm_deals",
      { id: "deal-1" }
    ),
    true
  );
});

test("outro usuario nao visualiza negocio", async () => {
  const ctx = setup();

  assert.equal(
    await ctx.canReadRow(
      { id: "user-4", role: "vendedor" },
      "crm_deals",
      { id: "deal-1" }
    ),
    false
  );
});

test("administrador possui acesso completo", async () => {
  const ctx = setup();

  assert.equal(
    await ctx.canReadRow(
      { id: "admin-1", role: "admin" },
      "crm_deals",
      { id: "deal-1" }
    ),
    true
  );

  assert.equal(ctx.queries.length, 0);
});

test("usuario anonimo nao visualiza negocios", async () => {
  const ctx = setup();

  assert.equal(
    await ctx.canReadRow(
      null,
      "crm_deals",
      { id: "deal-1" }
    ),
    false
  );
});

test("filtro nao retorna negocios de terceiros", async () => {
  const ctx = setup();

  const rows = [
    { id: "deal-1" },
    { id: "deal-2" }
  ];

  const result = await ctx.filterReadableRows(
    { id: "user-1", role: "vendedor" },
    "crm_deals",
    rows
  );

  assert.deepEqual(
    Array.from(result, row => row.id),
    ["deal-1"]
  );
});
