
import {phone} from './prospecting-verification.mjs';

function clean(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function normalized(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(ltda|me|eireli|sa|comercio|industria)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function meaningfulTokens(value) {
  const stop = new Set([
    'de','da','do','das','dos','e','a','o','moda',
    'roupas','confeccoes','confeccao','loja',
    'online','oficial','brasil','home','inicio'
  ]);

  return normalized(value).split(' ')
    .filter(t => t.length >= 4 && !stop.has(t));
}

export function extractCompanyName(html) {
  const text = String(html ?? '');
  const candidates = [];

  const meta = text.match(
    /<meta\b[^>]*property=["']og:site_name["'][^>]*>/i
  )?.[0];

  if (meta) {
    const name = meta.match(
      /\bcontent=["']([^"']+)["']/i
    )?.[1];

    if (name) candidates.push({
      name: clean(name),
      source: 'og:site_name'
    });
  }

  for (const match of text.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      const json = JSON.parse(match[1]);
      const entries = Array.isArray(json) ? json : [json];

      for (const entry of entries) {
        const graph = Array.isArray(entry?.['@graph'])
          ? entry['@graph'] : [entry];

        for (const node of graph) {
          const types = [].concat(node?.['@type'] || []);
          if (types.some(type =>
            /^(Organization|Corporation|LocalBusiness|Store)$/i.test(type)
          ) && node?.name) {
            candidates.push({
              name: clean(node.name),
              source: 'structured_data'
            });
          }
        }
      }
    } catch {
      // JSON-LD malformado nao fornece evidencias.
    }
  }

  const title = text.match(
    /<title[^>]*>([\s\S]*?)<\/title>/i
  )?.[1];

  if (title) {
    const name = clean(title).split(/\s+[-|–]\s+/)[0];
    candidates.push({name, source: 'title'});
  }

  const preferred = candidates.filter(item =>
    item.source === 'structured_data' ||
    item.source === 'og:site_name'
  );

  const selected = preferred.length ? preferred : candidates;
  const unique = new Map();

  for (const item of selected) {
    const name = clean(item.name);
    const key = normalized(name);

    if (
      name.length < 4 ||
      name.length > 100 ||
      meaningfulTokens(name).length === 0 ||
      unique.has(key)
    ) continue;

    unique.set(key, {name, source: item.source});
  }

  return [...unique.values()];
}

export function verifyCompanyRegistryLink({
  siteNames = [],
  sitePhones = [],
  registry = {}
} = {}) {
  const registryNames = [
    registry.nome_fantasia,
    registry.razao_social
  ].filter(Boolean);

  const matches = [];

  for (const item of siteNames) {
    const siteName = typeof item === 'string'
      ? item
      : item?.name;

    const a = [...new Set(meaningfulTokens(siteName))];

    if (a.length < 1) continue;

    for (const registeredName of registryNames) {
      const b = [...new Set(meaningfulTokens(registeredName))];

      const common = a.filter(token => b.includes(token));

      if (
        common.length >= 2 ||
        (
          common.length >= 1 &&
          normalized(siteName) === normalized(registeredName)
        )
      ) {
        matches.push({
          site_name: siteName,
          registry_name: registeredName,
          common_tokens: common
        });
      }
    }
  }

  const registryPhones = [
    registry.ddd_telefone_1,
    registry.ddd_telefone_2,
    registry.telefone1,
    registry.telefone2
  ].map(phone).filter(Boolean);

  const phonesMatch = sitePhones
    .map(phone)
    .filter(Boolean)
    .some(number => registryPhones.includes(number));

  const namesMatch = matches.length > 0;

  return {
    name_match: namesMatch,
    phone_match: phonesMatch,
    identity_confirmed: namesMatch && phonesMatch,
    evidence: {
      name: namesMatch ? 'two_distinctive_tokens' : null,
      phone: phonesMatch ? 'site_and_registry' : null
    }
  };
}
