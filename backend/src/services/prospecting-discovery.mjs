import {DEFAULT_SETTINGS,STATES} from './digitale-ai-settings.mjs';
import crypto from 'node:crypto';
import {getPublic} from './prospecting-verification.mjs';
import {blockedProspectingSource,apparelSearchHint,officialManufacturerPage} from './prospecting-source-quality.mjs';
import {domainOf,excludedDomain} from './prospecting-auto-verification.mjs';
import {contactLinks} from './prospecting-site-pages.mjs';
import {VERIFICATION_POLICY,recoverableCandidate,recoverCandidate} from './prospecting-candidate-recovery.mjs';

const commercialTerms=['confecção private label de','fabricante de','confecção de','fábrica de','produção própria de'];
const paulistaCities=['Americana','Campinas','São José do Rio Preto','Sorocaba','São José dos Campos','Ribeirão Preto','Franca','Birigui','Guarulhos','Osasco','Santo André','São Bernardo do Campo','Indaiatuba','Santa Bárbara d\'Oeste','Nova Odessa','Limeira','Piracicaba','Jundiaí','São Carlos','Araraquara','Bauru','Marília','Presidente Prudente','Brás São Paulo'];
export const SEARCH_SPAN=DEFAULT_SETTINGS.states.length*(paulistaCities.length+1)*DEFAULT_SETTINGS.segments.length*commercialTerms.length*3*2;
export function searchPlan(cursor,settings=DEFAULT_SETTINGS) {
  if(!Number.isSafeInteger(cursor)||cursor<0)throw Error('invalid_search_cursor');
  const states=[...new Set(settings.states)].sort();
  let segments=settings.segments.map(s=>s.trim()).filter(Boolean);
  // O CNAE 1412-6/01 cobre peças de vestuário; prioriza o segmento já configurado.
  if(settings.cnaes?.includes('1412601'))segments=[...new Set(['vestuário','roupas de alfaiataria','moda feminina','moda masculina','moda infantil','camisetas','jeans',...segments])];
  if(!states.length||!segments.length)throw Error('search_regions_empty');
  // Alterna peças/segmentos antes de repetir dezenas de buscas do mesmo produto.
  const uf=states[cursor%states.length],regionalCursor=Math.floor(cursor/states.length);
  const cities=uf==='SP'?['',...paulistaCities]:[''];
  const city=cities[Math.floor(regionalCursor/segments.length)%cities.length];
  const segment=segments[regionalCursor%segments.length];
  const variant=Math.floor(regionalCursor/(cities.length*segments.length));
  const term=commercialTerms[variant%commercialTerms.length];
  const page=1+Math.floor(variant/commercialTerms.length)%3;
  const identityHint=settings.cnaes?.length&&regionalCursor%3===0?' CNPJ':'';
  return {q:`${term} ${segment} ${city?city+' ':''}${STATES[uf]} ${uf} site oficial${identityHint}`,pageno:page,engines:cursor%2===0?'yahoo':'duckduckgo'};
}

// DIGITALE_REGISTRY_DIRECTORY_GUARD_V12
const registryDirectoriesV12 = [
  'cnpjonline.com',
  'consultacnpj.com',
  'consultacnpj.org',
  'consultacnpjfacil.com.br',
  'cnpjob.com.br',
  'radardocnpj.com.br',
  'procuracnpj.com.br',
  'brasilcnpjs.com.br',
  'brasilcnpj.net',
  'achacnpj.com',
  'cnpj.info',
  'cnpja.com',
  'cnpj.biz',
  'hagah.com.br',
  'apontador.com.br'
];

function blockedRegistryDirectoryV12(value) {
  let host;

  try {
    host = new URL(value).hostname;
  } catch {
    host = String(value || '');
  }

  host = host.toLowerCase().replace(/^www\./, '').split(':')[0];

  return registryDirectoriesV12.some(blocked =>
    host === blocked || host.endsWith('.' + blocked)
  );
}

export function discoveryResult(result) {
  // DIGITALE_DISCOVERY_PERFORMANCE_V1
  // Permite indicios comerciais claros, mantendo a verificacao
  // obrigatoria do site oficial antes de criar o candidato.
  const searchText = String(
    (result?.title || '') + ' ' + (result?.content || '')
  );
  const relevantCommercialEvidence =
    /confec[cç][aã]o|fabricante|f[aá]brica de roupas|produ[cç][aã]o pr[oó]pria|private.label|moda fitness|moda feminina|moda masculina|moda infantil|ind[uú]stria do vestu[aá]rio/i
      .test(searchText);

  if (blockedProspectingSource(result?.url)) return null;
  if (
    !apparelSearchHint(result?.title || '', result?.content || '') &&
    !relevantCommercialEvidence
  ) return null;
  if (blockedRegistryDirectoryV12(result?.url)) {
    return null;
  }


  // DIGITALE_DISCOVERY_FILTER_V6
  // Bloqueia guias e diretorios, preservando sites de fabricantes.
  const sourceUrl = String(result?.url || '');
  const sourceTitle = String(result?.title || '');

  let source;
  try {
    source = new URL(sourceUrl);
  } catch {
    return null;
  }

  const hostV6 = source.hostname.toLowerCase()
    .replace(/^www\\./, '');

  const pathV6 = source.pathname.toLowerCase();

  const directoryHostsV6 = [
    'americanamoda.com.br',
    'americana.net.br',
    'encontraamericana.com.br',
    'guiadasroupas.com',
    'procuracnpj.com.br'
  ];

  if (directoryHostsV6.some(h =>
    hostV6 === h || hostV6.endsWith('.' + h)
  )) return null;

  const directoryTitleV6 =
    /^(?:encontre|lista de|listagem de|guia comercial|guia de empresas|f[aá]bricas de .{2,70}:?\s*\d+ op[cç][oõ]es|\\d+ f[aá]bricas e fornecedores)/i;

  const directoryPathV6 =
    /\/(?:resultadobusca\.php|guia\/categorias\/|moda-fitness-em-|fabricas-de-biquinis-em-)/i;

  if (directoryTitleV6.test(sourceTitle) ||
      directoryPathV6.test(pathV6)) {
    return null;
  }

  // DIGITALE_DIRECTORY_FILTER_V1
  // Impede que diretorios sejam tratados como sites de fabricantes.
  let discoveryHost;

  try {
    const address = new URL(result?.url || '');
    discoveryHost = address.hostname.toLowerCase()
      .replace(/^www\./, '');
  } catch {
    return null;
  }

  // DIGITALE_DISCOVERY_FILTER_V5
  // Remove diretórios, consultas cadastrais e fontes genéricas.
  // Não altera os critérios de validação de empresas.

  const blockedHostPattern =
    /(?:^|[.-])(?:cnpj|consultaempresa|consultacnpj|buscacnpj|procuracnpj|mei|contabil|cadastroempresa|guiaempresas|listaempresas|acheiempresa|encontraempresas|empresasbrasil|receitafederal)(?:[.-]|$)/i;

  const blockedHostWords = [
    'procuracnpj',
    'cnpjaberto',
    'cnpjtotal',
    'cnpjconsulta',
    'monitorcnpj',
    'encontradiadema',
    'encontracotia',
    'encontrataubate',
    'encontraitapevi',
    'maismei',
    'acheiempresa',
    'consultacnpj',
    'buscacnpj',
    'guiacomercial',
    'catalogodeempresas'
  ];

  if (
    blockedHostPattern.test(discoveryHost) ||
    blockedHostWords.some(word =>
      discoveryHost.includes(word)
    )
  ) {
    return null;
  }

  // DIGITALE_DISCOVERY_DIRECTORY_V7
  const directoryHostsV7 = [
    'encontrasantoandre.com.br',
    'encontraamericana.com.br',
    'americana.net.br',
    'americanamoda.com.br',
    'guiadasroupas.com',
    'procuracnpj.com.br',
    'buscadorncm.com.br'
  ];

  if (directoryHostsV7.some(host =>
    discoveryHost === host ||
    discoveryHost.endsWith('.' + host)
  )) return null;


  // DIGITALE_DIRECTORY_FILTER_V8
  // Descarta agregadores, preservando sites proprios de empresas.
  const directoryHostsV8 = [
    'telelistas.com',
    'cylex.com.br',
    'brasillocais.com',
    'listamais.com.br',
    'apontador.com.br',
    'modafeminina.com.br',
    'guia.santoandre.br',
    'brasilcnpjs.com.br'
  ];

  if (directoryHostsV8.some(host =>
    discoveryHost === host ||
    discoveryHost.endsWith('.' + host)
  )) {
    return null;
  }

  const blockedHosts = [
    'cnpjob.com.br',
    'encontraitapevi.com.br',
    'encontracotia.com',
    'guiacotia.com',
    'guiataubate.com.br',
    'itapevi.net.br',
    'diadema.net.br',
    'prudenteempresas.com.br',
    'contabilivre.com.br',
    'tudoaquitaubate.com.br',
    'mylinq.com.br'
  ];

  if (blockedHosts.some(host =>
    discoveryHost === host ||
    discoveryHost.endsWith('.' + host)
  )) return null;

  // Sites hospedados em plataformas de paginas comerciais
  // nao sao excluidos automaticamente: alguns sao empresas reais.

  // DIGITALE_DISCOVERY_QUALITY_V1
  const title = String(result?.title || '');
  const content = String(result?.content || '');
  const text = title + ' ' + content;

  if (!/moda|fitness|vestu[aá]rio|lingerie|biqu[ií]ni|roupa|uniforme|confec[cç]|malharia|t[eê]xtil|fac[cç][aã]o|vestimenta|ind[uú]stria de roupas|fabrica[cç][aã]o de roupas|moda praia|private label|beachwear|swimwear/i.test(text)) {
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

async function searchWithFallback(endpoint,fetchSearch) {
  const first=endpoint.searchParams.get('engines');
  let lastError,empty;
  const degraded=[];
  for(const engine of [first,first==='yahoo'?'duckduckgo':'yahoo']) {
    const url=new URL(endpoint);url.searchParams.set('engines',engine);
    try {
      const response=await fetchSearch(url,{signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw Error('discovery_http_'+response.status);
      const body=await response.json();
      if(!Array.isArray(body.results))throw Error('discovery_invalid_response');
      const failed=(body.unresponsive_engines||[]).map(e=>String(e[0]).replace(/[^a-z0-9_]/gi,''));
      degraded.push(...failed);
      if(body.results.length)return {body,engine,degraded:[...new Set(degraded)]};
      if(failed.length)throw Error('discovery_provider_unavailable');
      empty={body,engine,degraded:[...new Set(degraded)]};
    }catch(error){lastError=error;degraded.push(engine);}
  }
  if(empty)return empty;
  throw lastError||Error('discovery_provider_unavailable');
}

export async function discoverCandidates(db,cursor,{fetchSearch=fetch,fetchSite=getPublic,settings=DEFAULT_SETTINGS}={}) {
  const plan=searchPlan(cursor,settings),endpoint=new URL('http://127.0.0.1:8888/search');
  endpoint.search=new URLSearchParams({...plan,pageno:String(plan.pageno),format:'json',language:'pt-BR',safesearch:'1'});
  const search=await searchWithFallback(endpoint,fetchSearch);
  let body=search.body;const degraded=search.degraded;plan.engines=search.engine;
  const resultEngines=new Map(body.results.map(result=>[result.url,search.engine]));
  let found=0,recovered=0,checked=0,rejected=0;
  // Uma página esgotada não deve consumir ciclos indefinidamente com as mesmas empresas.
  const known=[];
  const existingDomains=new Map();
  for(const result of body.results.slice(0,12)) {
    const candidate=discoveryResult(result);if(!candidate)continue;
    if(existingDomains.has(candidate.domain))continue;
    const [existing]=await db.execute('SELECT id,status,reason,proof FROM prospecting_auto_candidates WHERE domain=? LIMIT 1',[candidate.domain]);
    existingDomains.set(candidate.domain,existing[0]||null);
    if(existing.length&&!recoverableCandidate(existing[0]))known.push(candidate.domain);
  }
  if(known.length>=3) {
    const broadened=new URL(endpoint);
    broadened.searchParams.set('q',plan.q+' '+[...new Set(known)].slice(0,8).map(domain=>'-site:'+domain).join(' '));
    broadened.searchParams.set('pageno','1');
    broadened.searchParams.set('engines',plan.engines==='yahoo'?'duckduckgo':'yahoo');
    try {
      const retry=await fetchSearch(broadened,{signal:AbortSignal.timeout(12000)});
      if(retry.ok){const extra=await retry.json();if(Array.isArray(extra.results)){
        for(const result of extra.results)if(!resultEngines.has(result.url))resultEngines.set(result.url,broadened.searchParams.get('engines'));
        body={...body,results:[...body.results,...extra.results]};
      }}
    }catch{}
  }
  const seen=new Set();
  for(const result of body.results.slice(0,40)) {
    const candidate=discoveryResult(result);if(!candidate||seen.has(candidate.domain))continue;
    seen.add(candidate.domain);
    if(!existingDomains.has(candidate.domain)){
      const [existing]=await db.execute('SELECT id,status,reason,proof FROM prospecting_auto_candidates WHERE domain=? LIMIT 1',[candidate.domain]);
      existingDomains.set(candidate.domain,existing[0]||null);
    }
    const existing=existingDomains.get(candidate.domain);
    if(existing&&!recoverableCandidate(existing))continue;
    if(checked>=8)break;
    checked++;
    let official=null;
    // Search snippets only nominate a site. Production evidence must be fetched
    // from that exact host before it enters the candidate queue.
    const pagesToCheck=[...new Set([new URL(candidate.url).origin+'/',candidate.url])];
    for(const url of pagesToCheck) {
      try {
        const page=await fetchSite(url);
        if(domainOf(page.url)===candidate.domain&&officialManufacturerPage(page)){official=page;break;}
        if(domainOf(page.url)===candidate.domain)for(const link of contactLinks(page,candidate.domain)){
          if(pagesToCheck.length>=5)break;
          if(!pagesToCheck.includes(link))pagesToCheck.push(link);
        }
      }catch{}
    }
    if(!official){rejected++;continue;}
    const evidence={verification_policy:VERIFICATION_POLICY,discovery:{query:plan.q,engine:resultEngines.get(result.url)||plan.engines,source_url:candidate.url,checked_url:official.url,manufacturer_evidence:true,checked_at:new Date().toISOString()}};
    if(existing){recovered+=await recoverCandidate(db,existing,official,evidence);continue;}
    const [insert]=await db.execute('INSERT IGNORE INTO prospecting_auto_candidates(id,discovery_url,domain,proof) VALUES(?,?,?,?)',[crypto.randomUUID(),official.url,candidate.domain,JSON.stringify(evidence)]);
    found+=Number(insert.affectedRows||0);
  }
  return {found,recovered,received:body.results.length,checked,rejected,degraded,plan};
}
