// Observador comercial V2.
// Nao altera candidatos, entregas ou CRM.

import {
  qualifyCommercialLead
} from './prospecting-commercial-v2.mjs';

import { plain } from './prospecting-verification.mjs';

export function observeCommercialProfile(proof = {}, pages = []) {
  const normalizedPages = Array.isArray(pages)
    ? pages.map(page => ({
        url: String(page?.url || ''),
        text: plain(String(page?.body || '')).slice(0, 120000)
      }))
    : [];

  const result = qualifyCommercialLead(proof, {
    pages: normalizedPages
  });

  return {
    ...result,
    mode: 'observation',
    observed_pages: normalizedPages.length,
    automatic_rejection: false,
    production_enabled: false
  };
}
