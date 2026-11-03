import test from "node:test";
import assert from "node:assert/strict";

import {
  validateCrmDealLoss
} from "../src/services/crm-loss-validation.mjs";

// Simulacao das permissoes e da persistencia.
// Nenhuma conexao com MariaDB e criada.
async function simulateOperation({
  operation,
  current = null,
  payload = {},
  canInsert = true,
  canUpdate = true
}) {
  const existing = Boolean(current);

  if (operation === "insert" || (operation === "upsert" && !existing)) {
    if (!canInsert) {
      return { status: 403, saved: false };
    }
  }

  if (operation === "update" || (operation === "upsert" && existing)) {
    if (!canUpdate) {
      return { status: 403, saved: false };
    }
  }

  const next = current
    ? { ...current, ...payload }
    : { ...payload };

  const result = validateCrmDealLoss(
    current,
    next,
    payload
  );

  if (!result.valid) {
    return {
      status: 400,
      saved: false,
      error: result.code
    };
  }

  return {
    status: operation === "insert" ? 201 : 200,
    saved: true,
    record: next
  };
}

test("INSERT sem motivo retorna 400", async () => {
  const result = await simulateOperation({
    operation: "insert",
    payload: {
      status: "perdido",
      loss_reason: null
    }
  });

  assert.equal(result.status, 400);
  assert.equal(result.saved, false);
});

test("INSERT com motivo e autorizado", async () => {
  const result = await simulateOperation({
    operation: "insert",
    payload: {
      status: "perdido",
      loss_reason: "Fora de perfil"
    }
  });

  assert.equal(result.status, 201);
  assert.equal(result.saved, true);
});

test("UPDATE preserva motivo anterior", async () => {
  const result = await simulateOperation({
    operation: "update",
    current: {
      status: "perdido",
      loss_reason: "Fora de perfil"
    },
    payload: { title: "Novo titulo" }
  });

  assert.equal(result.status, 200);
  assert.equal(result.record.loss_reason, "Fora de perfil");
});

test("UPDATE nao permite apagar motivo", async () => {
  const result = await simulateOperation({
    operation: "update",
    current: {
      status: "perdido",
      loss_reason: "Fora de perfil"
    },
    payload: { loss_reason: null }
  });

  assert.equal(result.status, 400);
});

test("UPSERT existente exige permissao de atualizacao", async () => {
  const result = await simulateOperation({
    operation: "upsert",
    current: {
      id: "teste-1",
      status: "aberto"
    },
    payload: { title: "Alterado" },
    canInsert: true,
    canUpdate: false
  });

  assert.equal(result.status, 403);
  assert.equal(result.saved, false);
});

test("UPSERT existente nao exige permissao de criacao", async () => {
  const result = await simulateOperation({
    operation: "upsert",
    current: {
      id: "teste-2",
      status: "aberto"
    },
    payload: { title: "Alterado" },
    canInsert: false,
    canUpdate: true
  });

  assert.equal(result.status, 200);
  assert.equal(result.saved, true);
});

test("UPSERT novo exige permissao de criacao", async () => {
  const result = await simulateOperation({
    operation: "upsert",
    payload: { status: "aberto" },
    canInsert: false
  });

  assert.equal(result.status, 403);
  assert.equal(result.saved, false);
});

test("UPDATE historico sem motivo permanece editavel", async () => {
  const result = await simulateOperation({
    operation: "update",
    current: {
      status: "perdido",
      loss_reason: null
    },
    payload: { description: "Registro historico" }
  });

  assert.equal(result.status, 200);
  assert.equal(result.saved, true);
});

test("UPSERT nao permite nova perda sem motivo", async () => {
  const result = await simulateOperation({
    operation: "upsert",
    current: {
      id: "teste-3",
      status: "aberto",
      loss_reason: null
    },
    payload: { status: "perdido" }
  });

  assert.equal(result.status, 400);
  assert.equal(result.saved, false);
});
