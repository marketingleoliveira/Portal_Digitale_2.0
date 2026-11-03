import test from "node:test";
import assert from "node:assert/strict";
import { validateCrmDealLoss } from "../src/services/crm-loss-validation.mjs";

test("exige motivo em nova perda", () => {
  const result = validateCrmDealLoss(
    { status: "aberto" },
    { status: "perdido", loss_reason: null },
    { status: "perdido" }
  );
  assert.equal(result.valid, false);
});

test("aceita perda com motivo", () => {
  const result = validateCrmDealLoss(
    { status: "aberto" },
    { status: "perdido", loss_reason: "Fora de perfil" },
    { status: "perdido", loss_reason: "Fora de perfil" }
  );
  assert.equal(result.valid, true);
});

test("preserva edicao historica sem motivo", () => {
  const result = validateCrmDealLoss(
    { status: "perdido", loss_reason: null },
    { status: "perdido", loss_reason: null },
    { description: "Atualizacao historica" }
  );
  assert.equal(result.valid, true);
});

test("impede apagar motivo existente", () => {
  const result = validateCrmDealLoss(
    { status: "perdido", loss_reason: "Preco" },
    { status: "perdido", loss_reason: null },
    { loss_reason: null }
  );
  assert.equal(result.valid, false);
});

test("permite negocios ganhos", () => {
  const result = validateCrmDealLoss(
    { status: "aberto" },
    { status: "ganho", loss_reason: null },
    { status: "ganho" }
  );
  assert.equal(result.valid, true);
});


test("nova perda com motivo em branco", () => {
  const result = validateCrmDealLoss(
    { status: "aberto" },
    { status: "perdido", loss_reason: "   " },
    { status: "perdido", loss_reason: "   " }
  );
  assert.equal(result.valid, false);
});

test("upsert criando negocio perdido exige motivo", () => {
  const result = validateCrmDealLoss(
    null,
    { status: "perdido", loss_reason: null },
    { status: "perdido" }
  );
  assert.equal(result.valid, false);
});

test("upsert parcial preserva motivo existente", () => {
  const current = {
    status: "perdido",
    loss_reason: "Fora de perfil"
  };
  const payload = { title: "Atualizado" };

  const next = { ...current, ...payload };
  const result = validateCrmDealLoss(current, next, payload);

  assert.equal(result.valid, true);
  assert.equal(next.loss_reason, "Fora de perfil");
});

test("negocio aberto permanece editavel sem motivo", () => {
  const result = validateCrmDealLoss(
    { status: "aberto", loss_reason: null },
    { status: "aberto", loss_reason: null },
    { title: "Atualizado" }
  );
  assert.equal(result.valid, true);
});

test("registro historico perdido pode receber motivo", () => {
  const result = validateCrmDealLoss(
    { status: "perdido", loss_reason: null },
    { status: "perdido", loss_reason: "Preco" },
    { loss_reason: "Preco" }
  );
  assert.equal(result.valid, true);
});
