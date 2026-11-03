
import {
  validCnpj,
  normCnpj
} from './prospecting-verification.mjs';

const ENDPOINT = 'http://127.0.0.1:8888/search';

const normalize = value => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const ignored = new Set([
  'confeccoes', 'confeccao', 'moda',
  'fitness', 'roupas', 'industria',
  'comercio', 'ltda', 'tecidos',
  'textil', 'fabricante', 'empresa',
  'brasil', 'oficial'
]);

function distinctiveTokens(name) {
  return [...new Set(
    normalize(name).split(/\s+/)
      .filter(token => token.length >= 4 && !ignored.has(token))
  )];
}

function extractCnpjs(value) {
  const found = new Set();

  const pattern =
    /(?<!\d)\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}(?!\d)/g;

  for (const match of String(value ?? '').matchAll(pattern)) {
    const cnpj = normCnpj(match[0]);

    if (validCnpj(cnpj)) found.add(cnpj);
  }

  return [...found];
}

export async function findExternalCnpjCandidates({
  company,
  domain,
  fetchSearch = fetch,
  maxResults = 12
} = {}) {
  const name = String(company ?? '').trim().slice(0, 150);
  const site = String(domain ?? '').trim().toLowerCase();

  const tokens = distinctiveTokens(name);

  if (!tokens.length || !site) return [];

  const queries = [
    `"${name}" CNPJ`,
    `"${tokens.join(' ')}" CNPJ`,
    `"${site}" "${tokens[0]}" CNPJ`
  ];

  const found = new Map();

  for (const query of [...new Set(queries)]) {
    const endpoint = new URL(ENDPOINT);

    endpoint.searchParams.set('q', query);
    endpoint.searchParams.set('format', 'json');
    endpoint.searchParams.set('language', 'pt-BR');

    try {
      const response = await fetchSearch(
        endpoint.toString(),
        {signal: AbortSignal.timeout(12000)}
      );

      if (!response.ok) continue;

      const payload = await response.json();

      for (const item of (payload.results || []).slice(0, 15)) {
        const url = String(item.url || '');

        if (!/^https?:\/\//i.test(url)) continue;

        // A marca precisa aparecer no titulo do resultado.
        // O simples fato de a busca retornar uma pagina
        // nao estabelece relacao entre empresa e CNPJ.
        const titleTokens = new Set(
          normalize(item.title).split(/\s+/)
        );

        if (!tokens.some(token => titleTokens.has(token))) {
          continue;
        }

        // CNPJ extraido somente do titulo ou URL do
        // resultado relevante, nao de snippets genericos.
        const cnpjs = extractCnpjs(
          `${item.title || ''} ${url}`
        );

        for (const cnpj of cnpjs) {
          const entry = found.get(cnpj) || {
            cnpj,
            sources: [],
            queries: []
          };

          if (!entry.sources.includes(url)) {
            entry.sources.push(url);
          }

          if (!entry.queries.includes(query)) {
            entry.queries.push(query);
          }

          found.set(cnpj, entry);
        }
      }
    } catch {
      // Erros de motores externos nao aprovam cadastros.
    }
  }

  return [...found.values()]
    .sort((a, b) => b.sources.length - a.sources.length)
    .slice(0, Math.max(0, Math.min(Number(maxResults) || 0, 30)))
    .map(item => ({
      ...item,
      verified: false,
      identity_confirmed: false,
      status: 'pending_registry_verification'
    }));
}
