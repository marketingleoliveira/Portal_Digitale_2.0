import {DEFAULT_SETTINGS,STATES} from './digitale-ai-settings.mjs';
import crypto from 'node:crypto';
import {domainOf,excludedDomain} from './prospecting-auto-verification.mjs';

const segments=['moda fitness','moda praia','moda esportiva','moda íntima','vestuário','lingerie','uniformes'];
const terms=['confecção','fabricante de roupas','fábrica de roupas','produção própria','private label','atacado de tecidos'];
const spRegions=['São Paulo SP','Americana SP','Limeira SP','Campinas SP','Santa Bárbara d’Oeste SP','Guarulhos SP','São Bernardo do Campo SP','Santo André SP','Sorocaba SP','Ribeirão Preto SP','São José do Rio Preto SP','Franca SP','Ibitinga SP'];
export const SEARCH_SPAN=segments.length*terms.length*spRegions.length*3;
export function searchPlan(cursor,settings=DEFAULT_SETTINGS) {
  // DIGITALE_SEARCH_EXPANDED_V2
  if (!Number.isSafeInteger(cursor) || cursor < 0)
    throw Error('invalid_search_cursor');

  const products = [
    'leggings', 'moda fitness', 'moda praia',
    'roupas femininas', 'uniformes profissionais',
    'roupas esportivas', 'bermudas fitness',
    'lingerie', 'moda íntima', 'camisetas',
    'roupas de academia', 'roupas para ciclismo',
    'biquínis', 'maiôs', 'tops fitness',
    'moda plus size', 'roupas infantis',
    'moda casual', 'roupas masculinas',
    'roupas para corrida', 'private label'
  ];

  const commercialTerms = [
    'fabricante de',
    'confecção de',
    'fábrica de',
    'indústria de',
    'produção de',
    'atacado de',
    'fornecedor de',
    'facção de'
  ];

  const spCities = [
    'São Paulo', 'Americana', 'Limeira', 'Campinas',
    'Santa Bárbara do Oeste', 'Guarulhos',
    'São Bernardo do Campo', 'Santo André',
    'Sorocaba', 'Ribeirão Preto',
    'São José do Rio Preto', 'Franca', 'Ibitinga',
    'Osasco', 'Barueri', 'Jundiaí', 'Indaiatuba',
    'Piracicaba', 'Hortolândia', 'Sumaré',
    'Nova Odessa', 'Artur Nogueira', 'Valinhos',
    'Vinhedo', 'Bragança Paulista', 'Atibaia',
    'Mogi das Cruzes', 'Suzano', 'Diadema',
    'Mauá', 'São Caetano do Sul', 'Bauru',
    'Marília', 'Araraquara', 'Jaú', 'Botucatu',
    'Presidente Prudente', 'Araçatuba',
    'São Carlos', 'Taubaté', 'Jacareí',
    'São José dos Campos', 'Itapetininga',
    'Itu', 'Salto', 'Cotia', 'Embu das Artes',
    'Carapicuíba', 'Itapevi', 'Louveira'
  ];

  const regions = [...new Set(
    (settings.states || []).flatMap(uf =>
      uf === 'SP'
        ? spCities.map(city => city + ' SP')
        : STATES[uf] ? [STATES[uf] + ' ' + uf] : []
    )
  )];

  if (!regions.length) throw Error('search_regions_empty');

  const segments = (settings.segments || [])
    .map(value => String(value).trim())
    .filter(Boolean);

  const subjects = [...new Set([...products,...segments])];

  const queries = [];
  for (const term of commercialTerms) {
    for (const subject of subjects) {
      queries.push(term + ' ' + subject);
    }
  }

  const searchIndex = Math.floor(cursor / 3);
  const queryIndex = searchIndex % queries.length;
  const regionIndex = Math.floor(searchIndex / queries.length)
    % regions.length;

  return {
    q: queries[queryIndex] + ' ' + regions[regionIndex],
    pageno: cursor % 3 === 2 ? 2 : 1,
    engines: cursor % 3 === 1 ? 'bing' : 'duckduckgo'
  };
}

export function discoveryResult(result) {
  // DIGITALE_DISCOVERY_QUALITY_V1
  const title = String(result?.title || '');
  const content = String(result?.content || '');
  const text = title + ' ' + content;

  if (!/moda|fitness|vestu[aá]rio|lingerie|biqu[ií]ni|roupa|uniforme|confec[cç]|malharia|t[eê]xtil|fac[cç][aã]o|vestimenta|ind[uú]stria de roupas|fabrica[cç][aã]o de roupas|moda praia|private label/i.test(text)) {
    return null;
  }

  // Rejeitar páginas claramente informativas, sem bloquear
  // automaticamente os sites comerciais das empresas.
  const editorial = /guia completo|para iniciantes|o que [eé]|significado de|conceito de|conceito e defini[cç][aã]o|tudo o que voc[eê] deve saber|dicion[aá]rio online/i;

  const definition = /^(?:confec[cç][aã]o|moda|vestu[aá]rio)\s*[-–:]\s*(?:dicio|significado|conceito|defini[cç][aã]o)/i;

  if (editorial.test(title) || definition.test(title)) {
    return null;
  }

  try {
    const url = new URL(result.url);

    if (!['http:', 'https:'].includes(url.protocol)
        || url.username || url.password) {
      return null;
    }

    const domain = domainOf(url.href);

    // DIGITALE_DISCOVERY_SOURCE_GUARD_V1
    // Exclui fontes informativas já identificadas nos diagnósticos.
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const path = url.pathname.toLowerCase();

    if (
      (host === 'olympics.com' &&
       /^\/(?:pt\/)?noticias\//.test(path)) ||
      (host === 'aiyellow.com' &&
       path !== '/') ||
      (host.endsWith('.wikidot.com') &&
       /^\/blog:/.test(path))
    ) {
      return null;
    }

    if (excludedDomain(domain)) return null;

    // Artigos e guias não são a página comercial da empresa.
    const articlePath = /\/(?:blog|artigos?|noticias|conteudos?|guias?)\//i;

    if (articlePath.test(url.pathname)
        && editorial.test(title + ' ' + content)) {
      return null;
    }

    url.hash = '';
    return {url: url.href, domain};
  } catch {
    return null;
  }
}

export async function discoverCandidates(db,cursor,{fetchSearch=fetch,settings=DEFAULT_SETTINGS}={}) {
  const plan=searchPlan(cursor,settings),endpoint=new URL('http://127.0.0.1:8888/search');
  endpoint.search=new URLSearchParams({...plan,pageno:String(plan.pageno),format:'json',language:'pt-BR',safesearch:'1'});
  const response=await fetchSearch(endpoint,{signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('discovery_http_'+response.status);
  const body=await response.json();
  if(!Array.isArray(body.results))throw Error('discovery_invalid_response');
  const degraded=(body.unresponsive_engines||[]).map(e=>String(e[0]).replace(/[^a-z0-9_]/gi,''));
  let found=0;
  for(const result of body.results.slice(0,40)) {
    const candidate=discoveryResult(result);if(!candidate)continue;
    const [insert]=await db.execute('INSERT IGNORE INTO prospecting_auto_candidates(id,discovery_url,domain) VALUES(?,?,?)',[crypto.randomUUID(),candidate.url,candidate.domain]);
    found+=Number(insert.affectedRows||0);
  }
  return {found,received:body.results.length,degraded,plan};
}
