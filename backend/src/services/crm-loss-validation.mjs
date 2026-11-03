export function validateCrmDealLoss(current, next, payload = {}) {
  if (!next || next.status !== "perdido") {
    return { valid: true };
  }

  const hasReason = typeof next.loss_reason === "string" &&
    next.loss_reason.trim().length > 0;

  if (hasReason) {
    return { valid: true };
  }

  const wasLost = current?.status === "perdido";

  const statusChanged = Object.prototype.hasOwnProperty.call(
    payload, "status"
  );

  const reasonChanged = Object.prototype.hasOwnProperty.call(
    payload, "loss_reason"
  );

  // Registros historicos sem motivo permanecem editaveis,
  // desde que nao haja nova perda nem tentativa de apagar o motivo.
  if (wasLost && !statusChanged && !reasonChanged) {
    return { valid: true, legacy: true };
  }

  return {
    valid: false,
    code: "loss_reason_required",
    message: "Selecione o motivo da perda."
  };
}
