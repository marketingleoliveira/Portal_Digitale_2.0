import test from "node:test";
import assert from "node:assert/strict";

import { normalizeCrmRow } from "../src/services/crm-normalize-row.mjs";

test("CRM: recupera dados legados do JSON", () => {
  const row = normalizeCrmRow({
    id: "deal-1",
    status: null,
    data: JSON.stringify({
      status: "perdido",
      loss_reason: "Preco"
    })
  });

  assert.equal(row.id, "deal-1");
  assert.equal(row.status, "perdido");
  assert.equal(row.loss_reason, "Preco");
});

test("CRM: campo nativo prevalece sobre JSON", () => {
  const row = normalizeCrmRow({
    id: "deal-2",
    status: "ganho",
    data: JSON.stringify({
      id: "id-antigo",
      status: "perdido"
    })
  });

  assert.equal(row.id, "deal-2");
  assert.equal(row.status, "ganho");
});

test("CRM: JSON invalido nao interrompe normalizacao", () => {
  const row = normalizeCrmRow({
    id: "deal-3",
    data: "{invalido"
  });

  assert.equal(row.id, "deal-3");
});
