// DIGITALE_COMMERCIAL_LEARNING_V2
// Aprendizado comercial em modo experimental.
// Nao altera o CRM, os candidatos ou as entregas.

import {
  extractCommercialEvidence
} from './prospecting-commercial-evidence-v2.mjs';

const normalize = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

export function evaluateCommercialFeedback({
  company = null,
  cnpj = null,
  crmStatus = null,
  lossReason = null,
  commercialEvidence = []
} = {}) {
  const status = normalize(crmStatus);
  const reason = normalize(lossReason);

  const outsideProfile =
    status === 'fora de perfil' ||
    reason.includes('fora de perfil');

  const evidence = Array.isArray(commercialEvidence)
    ? commercialEvidence.filter(item =>
        item &&
        typeof item === 'object' &&
        typeof item.source_url === 'string' &&
        typeof item.type === 'string'
      )
    : [];

  return {
    version: 2,
    company,
    cnpj,
    crm_status: crmStatus,
    loss_reason: lossReason,
    feedback_type: outsideProfile
      ? 'perfil_rejeitado'
      : 'revisao_pendente',
    commercial_evidence: evidence,
    evidence_count: evidence.length,
    learning_eligible: outsideProfile && evidence.length > 0,
    automatic_rejection: false,
    production_enabled: false
  };
}

export function summarizeCommercialFeedback(records = []) {
  const results = records.map(evaluateCommercialFeedback);

  return {
    version: 2,
    total_feedbacks: results.length,
    outside_profile: results.filter(
      r => r.feedback_type === 'perfil_rejeitado'
    ).length,
    evidence_available: results.filter(
      r => r.learning_eligible
    ).length,
    records: results,
    automatic_rejection: false,
    production_enabled: false
  };
}
