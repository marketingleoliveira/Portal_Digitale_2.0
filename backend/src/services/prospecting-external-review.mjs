
import {
  getPublic
} from './prospecting-verification.mjs';

import {
  registry,
  registryValid,
  pageContacts,
  domainOf
} from './prospecting-auto-verification.mjs';

import {
  extractCompanyName,
  verifyCompanyRegistryLink
} from './prospecting-company-identity.mjs';

import {
  findExternalCnpjCandidates
} from './prospecting-external-cnpj.mjs';

export async function reviewExternalCompany({
  url,
  fetchPage = getPublic,
  lookup = registry,
  findCnpjs = findExternalCnpjCandidates
} = {}) {
  const target = new URL(url);

  if (!['http:', 'https:'].includes(target.protocol)) {
    throw Error('invalid_site_protocol');
  }

  const domain = domainOf(target.href);
  const page = await fetchPage(target.origin + '/');

  if (domainOf(page.url) !== domain) {
    throw Error('site_domain_mismatch');
  }

  const names = extractCompanyName(page.body);
  const sitePhones = [...new Set(pageContacts(page))];

  const report = {
    domain,
    site_url: page.url,
    site_names: names,
    site_phones_found: sitePhones.length,
    candidates: [],
    approved: false,
    delivery_authorized: false,
    status: 'pending_review'
  };

  if (!names.length) {
    report.reason = 'site_identity_incomplete';
    return report;
  }

  let possible = await findCnpjs({
    company: names[0].name,
    domain,
    maxResults: 5
  });

  // Pesquisa adicional por marca distintiva somente
  // quando o nome completo nao encontrou candidatos.
  if (!possible.length) {
    const ignored = new Set([
      'confeccoes', 'confeccao', 'moda', 'roupas',
      'fabricante', 'industria', 'comercio',
      'ltda', 'fitness', 'tecidos', 'textil'
    ]);

    const tokens = names[0].name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(x => x.length >= 4 && !ignored.has(x));

    if (tokens.length) {
      possible = await findCnpjs({
        company: tokens[0],
        domain,
        maxResults: 5
      });
    }
  }

  for (const candidate of possible.slice(0, 3)) {
    const item = {
      cnpj: candidate.cnpj,
      search_sources: candidate.sources || [],
      registry_active: false,
      name_match: false,
      phone_match: false,
      identity_compatible: false,
      approved: false,
      status: 'pending_review'
    };

    try {
      const record = await lookup(candidate.cnpj);
      const data = record.data;

      item.registry_active = registryValid(data, candidate.cnpj);
      item.legal_name = data.razao_social || '';
      item.registry_source = record.url;

      const identity = verifyCompanyRegistryLink({
        siteNames: names,
        sitePhones,
        registry: data
      });

      item.name_match = identity.name_match;
      item.phone_match = identity.phone_match;

      item.identity_compatible =
        item.registry_active &&
        identity.identity_confirmed;

      item.reason = item.identity_compatible
        ? 'review_identity_evidence'
        : 'insufficient_identity_evidence';

    } catch (error) {
      item.reason = 'registry_lookup_inconclusive';
      item.error = String(error.message || error);
    }

    report.candidates.push(item);
  }

  report.reason = report.candidates.length
    ? 'registry_review_required'
    : 'no_external_cnpj_found';

  return report;
}
