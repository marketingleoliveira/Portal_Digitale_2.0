import {
  getEmailScanPublic
} from './prospecting-email-safe-fetch.mjs';

import {
  verifyCandidate
} from './prospecting-auto-verification.mjs';

import {
  storeProspectingEmails
} from './prospecting-email-contacts.mjs';

const SCAN_ONLY = 'email_scan_only_complete';

export async function scanProspectingCandidate(
  db,
  candidate,
  {fetchPage} = {}
) {
  if (!candidate?.id) {
    throw Error('candidate_id_required');
  }

  const captured = [];

  // Usa a navegacao ja implementada no verificador,
  // mas nao permite consulta cadastral nem entrega comercial.
  const options = {
    onEmailsFound: async data => {
      captured.push(data);
    },
    emailScanOnly: true,
    beforeRegistry: async () => {
      throw Error(SCAN_ONLY);
    },
    lookup: async () => {
      throw Error(SCAN_ONLY);
    }
  };

  options.fetchPage = fetchPage || getEmailScanPublic;

  let verificationResult = 'site_scan_completed';

  try {
    await verifyCandidate(candidate, options);
  } catch (error) {
    const reason = String(error?.message || 'unknown_error');

    // A ausencia de CNPJ ou telefone nao invalida
    // os emails ja encontrados no site.
    if (
      reason !== SCAN_ONLY &&
      reason !== 'website_cnpj_inconclusive' &&
      reason !== 'business_phone_missing'
    ) {
      verificationResult = reason;
    }
  }

  let stored = 0;

  for (const item of captured) {
    const result = await storeProspectingEmails(db, item);
    stored += result.processed;
  }

  return {
    candidateId: candidate.id,
    emailsFound: stored,
    result: verificationResult
  };
}
