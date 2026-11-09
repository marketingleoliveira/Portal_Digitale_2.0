
import crypto from 'node:crypto';
import {
  evaluateApproval
} from './prospecting-approval-policy.mjs';

function cnaeValues(registry = {}) {
  return [
    registry.cnae,
    registry.cnae_principal,
    registry.cnae_fiscal,
    registry.atividade_principal,
    registry.main_activity,
    ...(Array.isArray(registry.cnaes) ? registry.cnaes : []),
    ...(Array.isArray(registry.cnaes_secundarios)
      ? registry.cnaes_secundarios : [])
  ].filter(Boolean).map(value => {
    if (typeof value === 'object')
      return value.codigo || value.code || value.cnae;
    return value;
  });
}

function businessEmail(proof) {
  const values = [
    proof.email,
    proof.business_email,
    proof.registry?.email,
    ...(Array.isArray(proof.emails) ? proof.emails : [])
  ];

  return values
    .map(v => typeof v === 'string' ? v : v?.email)
    .find(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '')) || null;
}

export async function approveOnlyIA(db, proof, candidateId) {
  const registry = proof.registry || {};

  const decision = evaluateApproval({
    cnpj: proof.cnpj || registry.cnpj,
    phone: proof.phone || proof.telefone || registry.telefone,
    email: businessEmail(proof),
    cnaes: cnaeValues(registry),
    mei: registry.mei_status ?? registry.mei,
    situacao_cadastral: registry.situacao_cadastral
  });

  if (!decision.approved) {
    return {
      created: false,
      approved: false,
      duplicate: false,
      reason: decision.reason || 'approval_requirements_not_met'
    };
  }

  const [existing] = await db.execute(
    `SELECT id FROM ia_digitale_approved_v2
     WHERE cnpj=? LIMIT 1`,
    [decision.cnpj]
  );

  if (existing.length) {
    return {
      created: false,
      approved: false,
      duplicate: true,
      reason: 'already_approved_ia'
    };
  }

  const [previous] = await db.execute(
    `SELECT candidate_id
     FROM prospecting_auto_deliveries
     WHERE candidate_id=? OR cnpj=?
     LIMIT 1`,
    [candidateId, decision.cnpj]
  );

  if (previous.length) {
    return {
      created: false,
      approved: false,
      duplicate: true,
      reason: 'previously_delivered'
    };
  }

  const [historical] = await db.execute(
    `SELECT candidate_id
     FROM prospecting_approved_leads
     WHERE candidate_id=? OR cnpj=?
     LIMIT 1`,
    [candidateId, decision.cnpj]
  );

  if (historical.length) {
    return {
      created: false,
      approved: false,
      duplicate: true,
      reason: 'previously_approved'
    };
  }

  const id = crypto.randomUUID();

  const [insert] = await db.execute(
    `INSERT IGNORE INTO ia_digitale_approved_v2
     (id,candidate_id,cnpj,company,phone,email,cnae,
      proof,disparo_status,approved_at)
     VALUES (?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(6))`,
    [
      id,
      candidateId,
      decision.cnpj,
      String(proof.company || registry.razao_social || ''),
      decision.phone,
      decision.email,
      cnaeValues(registry).map(String).join(','),
      JSON.stringify(proof),
      decision.sendToDisparo ? 'pending' : 'no_email'
    ]
  );

  if (!insert.affectedRows) {
    return {
      created: false,
      approved: false,
      duplicate: true,
      reason: 'already_approved_ia'
    };
  }

  return {
    created: true,
    approved: true,
    duplicate: false,
    owner_id: null,
    deal_id: null,
    sent_to_nicolle: false,
    sent_to_crm: false,
    reason: null
  };
}
