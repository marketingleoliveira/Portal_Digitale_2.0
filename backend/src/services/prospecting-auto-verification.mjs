import { classifyTextileBuyer } from './prospecting-textile-profile.mjs';
import {DEFAULT_SETTINGS,matchesRegion} from './digitale-ai-settings.mjs';
import {normCnpj,validCnpj,phone,containsCnpj,publishedCnpjs,getPublic,plain,links,socialUrl} from './prospecting-verification.mjs';
import {OWNER} from './prospecting-policy.mjs';
import {contactLinks,robotsAllowed} from './prospecting-site-pages.mjs';
export const excludedDomain = domain => ['digitaletextil.com.br','digitale.com.br','instagram.com','facebook.com','linkedin.com','youtube.com','cnpj.biz','econodata.com.br','casadosdados.com.br','mercadolivre.com.br','shopee.com.br','pinterest.com','tiktok.com','freepik.com','shutterstock.com','pixabay.com','reddit.com','magnific.com','xnxx.com','xvideos.com','xhamster.com','pornhub.com','pornobrasil.com','eguias.net','solutudo.com.br','ilista.com.br','cadastroempresa.com.br','b2brazil.com.br','forneceb2b.com.br','fornecedoresdeconfianca.com.br','sacoleiradesucesso.com.br','fabricas.moda','conceito.de','dicio.com.br','lucidarium.com.br','amazon.com.br','amazon.com','booking.com','trivago.com','medium.com','forbes.com.br','gov.br','wikipedia.org','quemfornece.com'].some(d=>domain===d||domain.endsWith('.'+d));
export function domainOf(url) { return new URL(url).hostname.toLowerCase().replace(/^www\./,''); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
let lastRegistry = 0;
async function registryUnqueued(cnpj, fetchPage = getPublic) {
  // Shared serialized worker, conservative pace below the public CNPJ.ws ceiling.
  await sleep(Math.max(0,22000-(Date.now()-lastRegistry)));
  lastRegistry = Date.now();
  const primary=`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`;
  try {const result=await fetchPage(primary);return {url:result.url, data:JSON.parse(result.body)};} catch {
    await sleep(22000);
    lastRegistry=Date.now();
    const url=`https://publica.cnpj.ws/cnpj/${cnpj}`;
    const result=await fetchPage(url), raw=JSON.parse(result.body), e=raw.estabelecimento;
    if(!e)throw Error('registry_inconclusive');
    return {url:result.url,data:{cnpj:e.cnpj,razao_social:raw.razao_social,nome_fantasia:e.nome_fantasia,situacao_cadastral:String(e.situacao_cadastral).toUpperCase()==='ATIVA'?2:0,cnae_fiscal:e.atividade_principal?.id,cnaes_secundarios:(e.atividades_secundarias||[]).map(a=>({codigo:a.id})),ddd_telefone_1:[e.ddd1,e.telefone1].filter(Boolean).join(''),ddd_telefone_2:[e.ddd2,e.telefone2].filter(Boolean).join(''),uf:e.estado?.sigla,municipio:e.cidade?.nome,updated_at:e.atualizado_em}};
  }
}

// Serializa todas as consultas ao cadastro CNPJ.
let registryQueue = Promise.resolve();

export function registry(cnpj, fetchPage = getPublic) {
  const job = registryQueue.then(
    () => registryUnqueued(cnpj, fetchPage)
  );
  registryQueue = job.catch(() => {});
  return job;
}

export function registryValid(data, cnpj) {
  return normCnpj(data.cnpj)===cnpj && Number(data.situacao_cadastral)===2 && Boolean(data.razao_social);
}
export function manufacturing(data) {
  return [data.cnae_fiscal,...(data.cnaes_secundarios||[]).map(a=>a.codigo)].some(c=>/^14[12]/.test(String(c)));
}
export function pageContacts(page) {
  const text=plain(page.body), numbers=[];
  for(const m of text.matchAll(/(?<!\d)(?:\+?55[\s.-]*)?\(?\d{2}\)?[\s.-]*\d{4,5}[\s.-]*\d{4}(?!\d)/g)) if(phone(m[0])) numbers.push(phone(m[0]));
  for(const link of links(page.body,page.url)) {
    try {const u=new URL(link); let value;
      if(u.protocol==='tel:')value=u.pathname;
      if(['wa.me','api.whatsapp.com','web.whatsapp.com'].includes(u.hostname))value=u.hostname==='wa.me'?u.pathname.slice(1):u.searchParams.get('phone');
      if(value&&phone(value))numbers.push(phone(value));
    }catch{}
  }
  return [...new Set(numbers)];
}


export function pageEmails(page, domain) {
  const html = String(page.body || '');
  const text = plain(html);
  const values = [
    ...text.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi),
    ...html.matchAll(/mailto:([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi)
  ];
  const found = new Set();

  for (const match of values) {
    const email = String(match[1] || match[0]).toLowerCase();
    const host = email.split('@')[1];
    if (host === domain || host.endsWith('.' + domain)) {
      if (email.length <= 254) found.add(email);
    }
  }
  return [...found];
}

// Extrai CNPJs visiveis e identificadores empresariais de JSON-LD.
// Somente campos explicitos de identidade, sem executar scripts.
export function pageCnpjs(html) {
  const found = new Set(publishedCnpjs(plain(html)));

  const scripts = String(html).matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  );

  for (const match of scripts) {
    if (!/\btype\s*=\s*["']?application\/ld\+json/i.test(match[1])) {
      continue;
    }

    let data;
    try {
      data = JSON.parse(match[2].trim());
    } catch {
      continue;
    }

    let visited = 0;
    function inspect(value, depth = 0) {
      if (depth > 12 || ++visited > 500 || value == null) return;

      if (Array.isArray(value)) {
        for (const item of value) inspect(item, depth + 1);
        return;
      }

      if (typeof value !== 'object') return;

      for (const [key, item] of Object.entries(value)) {
        if (/^(cnpj|taxid)$/i.test(key)) {
          if (typeof item === 'string' || typeof item === 'number') {
            for (const number of publishedCnpjs(String(item))) {
              found.add(number);
            }
          }
        }
        if (item && typeof item === 'object') inspect(item, depth + 1);
      }
    }

    inspect(data);
  }

  return [...found];
}

export async function verifyCandidate(candidate,{fetchPage=getPublic, lookup=registry,beforeRegistry=async()=>{},onProgress=async()=>{},onEmailsFound=async()=>{},onCommercialObservation=null,emailScanOnly=false,settings=DEFAULT_SETTINGS}={}) {
  const root=candidate.discovery_url||candidate.website;
  const domain=domainOf(root);
  await onProgress('site');
  if(excludedDomain(domain)||socialUrl(root))throw Error('excluded_or_own_domain');
  const origin=new URL(root).origin;
  let robotsBody='';
  try {
    const robots=await fetchPage(origin+'/robots.txt');
    robotsBody=robots.body;
    if(!robotsAllowed(robotsBody,new URL(root).pathname+new URL(root).search))throw Error('robots_disallow');
  } catch(e) {
      if (e.message === 'robots_disallow') throw e;
      if (emailScanOnly && e.message !== 'fonte_http_404') {
        throw Error('email_scan_robots_unavailable');
      }
    }
  const pages=[];
  const pending=[...new Set([root,origin+'/'])],seen=new Set();
  for(let index=0;index<pending.length&&seen.size<10;index++) {
    const url=pending[index];if(seen.has(url))continue;seen.add(url);
    if(!robotsAllowed(robotsBody,new URL(url).pathname+new URL(url).search))continue;
    await onProgress('site',{url,pages_checked:pages.length});
    try {const p=await fetchPage(url);if(domainOf(p.url)===domain){pages.push(p);
      for(const linked of contactLinks(p,domain))if(!pending.includes(linked)&&pending.length<12)pending.push(linked);
      const numbers=pageCnpjs(p.body);
      // Continuar procurando email nas paginas comerciais.
    }}catch{}
    if(index===0)for(const path of ['/contato','/sobre','/quem-somos','/politica-de-privacidade']){const fallback=origin+path;if(!pending.includes(fallback))pending.push(fallback);}
  }
  // Captura independente da qualificacao comercial.
  // O callback nao implica autorizacao para envio de campanhas.
  const discoveredEmails = [...new Set(
    pages.flatMap(page => pageEmails(page, domain))
  )];

  if (discoveredEmails.length) {
    await onEmailsFound({
      candidateId: candidate.id || null,
      domain,
      emails: discoveredEmails,
      sourceUrl: pages[0]?.url || root
    });
  }

  if(emailScanOnly){
    if(!pages.length)throw Error('email_scan_no_pages');
    return {pages_checked:pages.length,emails_found:discoveredEmails.length};
  }
  await onProgress('identity',{pages_checked:pages.length});
  if (!pages.length) throw Error('website_no_pages');
  const cnpjs=[...new Set(pages.flatMap(p=>pageCnpjs(p.body)))];
  
  // DIGITALE_CNPJ_SEARCH_V1
  let cnpj = normCnpj(candidate.cnpj) ||
    (cnpjs.length === 1 ? cnpjs[0] : null);

  // Procurar CNPJ fora do site quando necessario.
  if (!cnpj) {
    try {
      const endpoint = new URL(
        'http://127.0.0.1:8888/search'
      );

      endpoint.search = new URLSearchParams({
        q: '"' + domain + '" CNPJ',
        format: 'json',
        language: 'pt-BR',
        safesearch: '1'
      }).toString();

      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(8000)
      });

      if (response.ok) {
        const data = await response.json();
        const possible = new Set();

        for (const result of
          (Array.isArray(data.results)
            ? data.results.slice(0, 20)
            : [])) {

          const title = String(result.title || '');
          const content = String(result.content || '');
          const resultUrl = String(result.url || '');

          const combined = [
            title,
            content,
            resultUrl
          ].join(' ');

          // O resultado precisa mencionar o dominio.
          if (!combined.toLowerCase().includes(domain)) {
            continue;
          }

          for (const found of publishedCnpjs(
            title + ' ' + content
          )) {
            possible.add(found);
          }
        }

        // Sem escolher arbitrariamente entre empresas.
        if (possible.size === 1) {
          cnpj = [...possible][0];

          await onProgress('identity', {
            cnpj,
            source: 'public_search',
            domain
          });
        }
      }
    } catch (error) {
      // Falha do buscador nao derruba a prospeccao.
      console.error(JSON.stringify({
        event: 'cnpj_public_search_failed',
        reason: String(error.message || error)
          .slice(0, 120)
      }));
    }
  }

  if(!cnpj||!validCnpj(cnpj))throw Error('website_cnpj_inconclusive');
  await onProgress('identity',{cnpj});
  const phonePage=pages.find(p=>pageContacts(p).length);
  // Telefone pode vir do cadastro empresarial.
  await beforeRegistry(cnpj);
  await onProgress('registry',{cnpj});
  const record=await lookup(cnpj,fetchPage), r=record.data;
  if(!registryValid(r,cnpj))throw Error('registry_inactive_or_mismatch');
  await onProgress('profile',{cnpj,company:r.nome_fantasia||r.razao_social,uf:r.uf});
  const uf=String(r.uf||'').trim().toUpperCase();
  if(!/^[A-Z]{2}$/.test(uf))throw Error('registry_state_inconclusive');
  // UF registrada sem restricao comercial.
  const textoComercial = pages.map(p => plain(p.body)).join(' ').slice(0,120000);
  const fitness = /moda\s+fitness|roupas?\s+fitness|activewear|sportswear|moda\s+esportiva|moda\s+praia|biqu[ií]ni|mai[oô]s|legging|top\s+fitness/i.test(textoComercial);
  const fabrica = /confec[cç][aã]o|fabricante\s+de\s+roupas|f[aá]brica\s+de\s+roupas|private\s+label|fac[cç][aã]o|produ[cç][aã]o\s+pr[oó]pria/i.test(textoComercial);
  const tecidos = /atacado\s+de\s+tecidos|distribui[cç][aã]o\s+de\s+tecidos|revenda\s+de\s+tecidos|tecidos\s+para\s+confec[cç][aã]o/i.test(textoComercial);
  const buyerSegment = classifyTextileBuyer(textoComercial);
  const resolvedBuyerSegment = buyerSegment || 'perfil_pendente';
  await onProgress('contact',{cnpj,company:r.nome_fantasia||r.razao_social,uf});
  const cnpjPage=pages.find(p=>pageCnpjs(p.body).includes(cnpj));
  const sitePhone=phonePage?pageContacts(phonePage)[0]:null;
  const registryPhone=[
    r.ddd_telefone_1,
    r.ddd_telefone_2,
    r.telefone1,
    r.telefone2
  ].map(phone).find(Boolean);

  const normalizeName = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  const names = [r.razao_social, r.nome_fantasia]
    .map(normalizeName)
    .filter(name => name.length >= 12);

  const siteText = pages
    .map(p => normalizeName(plain(p.body)))
    .join(' ');

  const companyNameMatch = names.some(name =>
    siteText.includes(name)
  );

  const registryPhones = [
    r.ddd_telefone_1,
    r.ddd_telefone_2,
    r.telefone1,
    r.telefone2
  ].map(phone).filter(Boolean);

  const phoneRegistryMatch = Boolean(
    sitePhone && registryPhones.includes(sitePhone)
  );

  const alternativeIdentity = Boolean(
    normCnpj(candidate.cnpj) === cnpj &&
    companyNameMatch &&
    phoneRegistryMatch
  );

  if (!cnpjPage && !alternativeIdentity) {
    throw Error('website_cnpj_inconclusive');
  }

  const number=sitePhone||registryPhone;
  if(!number)throw Error('business_phone_missing');
  const phoneSource=sitePhone?'website':'registry';
  const email=pages.flatMap(page=>pageEmails(page,domain))[0]||null;
  // DIGITALE_COMMERCIAL_OBSERVATION_CALLBACK_V2
  // Observacao opcional; nao modifica a prova nem a entrega.
  if (typeof onCommercialObservation === 'function') {
    try {
      await onCommercialObservation({
        company: r.nome_fantasia || r.razao_social,
        cnpj,
        buyer_segment: resolvedBuyerSegment,
        pages: pages.map(page => ({
          url: page.url,
          body: page.body
        }))
      });
    } catch (error) {
      console.error(JSON.stringify({
        event: 'commercial_observation_failed',
        reason: String(error?.message || error).slice(0, 120)
      }));
    }
  }

   return {version:2,buyer_segment:resolvedBuyerSegment,email_search_completed:true,owner_id:OWNER,checked_at:new Date().toISOString(),cnpj,phone:number,company:r.nome_fantasia||r.razao_social,domain,email,phone_call_tested:false,registry:{url:record.url,cnpj,active:true,uf,municipio:r.municipio||null,legal_name:r.razao_social,trade_name:r.nome_fantasia||null,source_updated_at:r.updated_at||null},identity_verified:true,identity_method:cnpjPage?'cnpj_publicado':'nome_e_telefone_cadastral',identity_evidence:{company_name_match:companyNameMatch,phone_registry_match:phoneRegistryMatch,cnpj_published:Boolean(cnpjPage),registry_url:record.url},website:{url:phonePage?.url||cnpjPage?.url||origin+'/',cnpj_url:cnpjPage?.url||null,cnpj_match:Boolean(cnpjPage),phone_match:Boolean(sitePhone),phone_source:phoneSource},discovery_url:root};
}
