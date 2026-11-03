// DIGITALE_COMMERCIAL_FEEDBACK_BRIDGE_V2
// Integracao de leitura do feedback comercial do Agendor.
// Sem escrita, rejeicao automatica ou alteracao de entregas.

import { OWNER } from './prospecting-policy.mjs';

import {
  loadOutsideProfileFeedback
} from './prospecting-feedback-learning.mjs';

import {
  summarizeCommercialFeedback
} from './prospecting-commercial-learning-v2.mjs';

export async function loadCommercialLearningV2(
  db,
  { ownerId = OWNER, limit = 200 } = {}
) {
  if (!db || typeof db.execute !== 'function') {
    throw new Error('database_connection_required');
  }

  const feedbacks = await loadOutsideProfileFeedback(
    db,
    { ownerId, limit }
  );

  const records = feedbacks.map(item => ({
    company: item.company || null,
    cnpj: item.cnpj || null,
    crmStatus: item.feedback_type === 'fora_de_perfil'
      ? 'Fora de perfil'
      : null,
    lossReason: item.loss_reason || null,
    commercialEvidence: Array.isArray(item.commercial_evidence)
      ? item.commercial_evidence
      : []
  }));

  const summary = summarizeCommercialFeedback(records);

  const feedback_details = feedbacks.map(item => ({
    deal_id: item.id,
    company: item.company || null,
    cnpj: item.cnpj || null,
    website: item.website || null,
    business_description: item.business_description || null,
    loss_reason: item.loss_reason || null,
    closed_at: item.closed_at || null,
    evidence_status: 'aguardando_validacao',
    learning_enabled: false
  }));

  return {
    ...summary,
    feedback_details,
    source: 'agendor',
    owner_id: ownerId,
    mode: 'observation',
    feedbacks_without_evidence:
      summary.total_feedbacks - summary.evidence_available,
    database_write: false,
    automatic_rejection: false,
    production_enabled: false
  };
}
