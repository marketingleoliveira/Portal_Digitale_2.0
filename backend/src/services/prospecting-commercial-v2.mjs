// DIGITALE_COMMERCIAL_V2
// Avaliacao comercial independente. Sem bloqueio automatico.

import {
  evaluateCommercialEvidence
} from './prospecting-feedback-learning.mjs';

import { extractCommercialEvidence } from './prospecting-commercial-evidence-v2.mjs';

export function qualifyCommercialLead(proof = {}, options = {}) {

  const pages = Array.isArray(options.pages)
    ? options.pages
    : [];
  const extraction = extractCommercialEvidence(pages);

  const websiteText = pages.length
    ? pages.map(page => String(page.text || '')).join(' ')
    : String(options.websiteText || '');

  const buyerSegment = proof.buyer_segment || null;

  const assessment = evaluateCommercialEvidence({
    websiteText,
    buyerSegment,
    feedbackRisk: options.feedbackRisk || null
  });

  // DIGITALE_STRICT_EVIDENCE_V2
  // Confirmacao exige evidencias especificas e rastreaveis.


  const extracted = extractCommercialEvidence(pages);
  const evidence = extracted.evidence || [];

  const manufacturing = evidence.some(
    item => item.type === 'fabricacao'
  );

  const textileBuying = evidence.some(
    item =>
      item.type === 'compra_tecidos' &&
      /\\b(compramos tecidos|compra de tecidos)\\b/.test(
        item.matched_term
      )
  );

  const resale = evidence.some(
    item => item.type === 'revenda'
  );

  const confirmed =
    (manufacturing || textileBuying) &&
    !resale &&
    assessment.requires_review === false;

  const reasons = [...assessment.reasons];

  if (resale && (manufacturing || textileBuying)) {
    reasons.push('Atividades comerciais mistas: revisar');
  }

  if (!manufacturing && !textileBuying) {
    reasons.push('Compra ou fabricacao nao comprovada');
  }

  return {
    version: 2,
    company: proof.company || null,
    cnpj: proof.cnpj || null,
    original_segment: buyerSegment,
    commercial_status: confirmed
      ? 'potencial_comprador'
      : 'revisao_comercial',
    requires_review: !confirmed,
    reasons,
    evidence,
    evidence_count: evidence.length,
    evidence: extraction.evidence,
    evidence_count: extraction.evidence_count,
    automatic_rejection: false,
    production_enabled: false
  };
}
