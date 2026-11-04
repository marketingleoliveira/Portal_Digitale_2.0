import { classifyTextileBuyer } from './prospecting-textile-profile.mjs';
import {DEFAULT_SETTINGS,matchesRegion,STATES} from './digitale-ai-settings.mjs';
import {normCnpj,validCnpj,phone,containsCnpj,publishedCnpjs,getPublic,plain,links,socialUrl} from './prospecting-verification.mjs';
import {OWNER} from './prospecting-policy.mjs';
import {contactLinks,robotsAllowed} from './prospecting-site-pages.mjs';
import {blockedProspectingSource,officialManufacturerPage} from './prospecting-source-quality.mjs';
export const excludedDomain = domain => ['digitaletextil.com.br','digitale.com.br','instagram.com','facebook.com','linkedin.com','youtube.com','cnpj.biz','econodata.com.br','casadosdados.com.br','mercadolivre.com.br','shopee.com.br','pinterest.com','tiktok.com','freepik.com','shutterstock.com','pixabay.com','reddit.com','magnific.com','xnxx.com','xvideos.com','xhamster.com','pornhub.com','pornobrasil.com','eguias.net','solutudo.com.br','ilista.com.br','cadastroempresa.com.br','b2brazil.com.br','forneceb2b.com.br','fornecedoresdeconfianca.com.br','sacoleiradesucesso.com.br','fabricas.moda','conceito.de','dicio.com.br','lucidarium.com.br','amazon.com.br','amazon.com','booking.com','trivago.com','medium.com','forbes.com.br','gov.br','wikipedia.org','quemfornece.com'].some(d=>domain===d||domain.endsWith('.'+d));
export function domainOf(url) { return new URL(url).hostname.toLowerCase().replace(/^www\./,''); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));
let lastRegistry = 0;

// DIGITALE_MEI_FILTER_V1
function meiStatus(value) {
  if (value === false || value === 0) return false;
  if (value === true || value === 1) return true;

  if (typeof value === 'string') {
    const normalized = value.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim().toLowerCase();

    if (['nao', 'false', '0'].includes(normalized)) return false;
    if (['sim', 'true', '1'].includes(normalized)) return true;
  }

  return null;
}

async function registryUnqueued(cnpj, fetchPage = getPublic) {
  // Shared serialized worker, conservative pace below the public CNPJ.ws ceiling.
  await sleep(Math.max(0,22000-(Date.now()-lastRegistry)));
  lastRegistry = Date.now();
  const primary=`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`;
  try {const result=await fetchPage(primary);return {url:result.url, data:(() => {const raw=JSON.parse(result.body);return {...raw,mei_status:meiStatus(raw.opcao_pelo_mei)};})()};} catch {
    await sleep(22000);
    lastRegistry=Date.now();
    const url=`https://publica.cnpj.ws/cnpj/${cnpj}`;
    const result=await fetchPage(url), raw=JSON.parse(result.body), e=raw.estabelecimento;
    if(!e)throw Error('registry_inconclusive');
    return {url:result.url,data:{mei_status:meiStatus(raw.simples?.mei),cnpj:e.cnpj,razao_social:raw.razao_social,nome_fantasia:e.nome_fantasia,situacao_cadastral:String(e.situacao_cadastral).toUpperCase()==='ATIVA'?2:0,cnae_fiscal:e.atividade_principal?.id,cnaes_secundarios:(e.atividades_secundarias||[]).map(a=>({codigo:a.id})),ddd_telefone_1:[e.ddd1,e.telefone1].filter(Boolean).join(''),ddd_telefone_2:[e.ddd2,e.telefone2].filter(Boolean).join(''),uf:e.estado?.sigla,municipio:e.cidade?.nome,updated_at:e.atualizado_em}};
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

export function selectCompanyCnpj(pages,supplied=null) {
  const eligible=new Set(),contacts=new Set(),partners=new Set();
  const partner=/parceria\s+com|desenvolvid[oa]\s+por|criado\s+por|powered\s+by|ag[eê]ncia\s+(?:de\s+publicidade|digital|de\s+marketing)|desenvolvimento\s+(?:do\s+site|por)/i;
  for(const page of pages) {
    const text=plain(page.body),contact=/\/(?:[^/]+\/)*(?:contato|fale-conosco|contact)(?:\/|$)/i.test(new URL(page.url).pathname);
    const visible=new Set();
    for(const m of text.matchAll(/(?<![A-Z0-9])([A-Z0-9]{2}\s*\.?\s*[A-Z0-9]{3}\s*\.?\s*[A-Z0-9]{3}\s*\/?\s*[A-Z0-9]{4}\s*-?\s*\d{2})(?![A-Z0-9])/gi)) {
      const number=normCnpj(m[1]);if(!validCnpj(number))continue;
      visible.add(number);
      // The credit immediately preceding an identifier belongs to its agency.
      const prefix=text.slice(Math.max(0,m.index-160),m.index);
      if(partner.test(prefix)){partners.add(number);continue;}
      eligible.add(number);
      if(contact&&/cnpj\s*[:\-]?\s*$/i.test(prefix))contacts.add(number);
    }
    // A structured identity is accepted only when its entity URL is on the
    // company's own host. A creator/author identifier cannot establish ownership.
    for(const script of String(page.body).matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      let data;try{data=JSON.parse(script[1]);}catch{continue;}
      let visited=0;
      function inspect(node,role='',depth=0){
        if(!node||typeof node!=='object'||depth>12||++visited>500)return;
        if(Array.isArray(node)){node.forEach(n=>inspect(n,role,depth+1));return;}
        const numbers=publishedCnpjs(String(node.taxID||node.taxId||node.cnpj||''));
        let own=false;try{own=domainOf(node.url)===domainOf(page.url);}catch{}
        for(const number of numbers){
          if(/creator|author|provider|developer/i.test(role)||(!own&&node.url))partners.add(number);
          else if(own)eligible.add(number);
        }
        for(const [key,value] of Object.entries(node))if(value&&typeof value==='object')inspect(value,key,depth+1);
      }
      inspect(data);
    }
  }
  // Explicit partner evidence takes precedence over an unlabelled repetition.
  for(const number of partners){eligible.delete(number);contacts.delete(number);}
  const requested=normCnpj(supplied);
  if(requested&&partners.has(requested))throw Error('website_cnpj_inconclusive');
  const selected=contacts.size===1?[...contacts][0]:eligible.size===1?[...eligible][0]:null;
  if(requested&&selected&&requested!==selected)throw Error('website_cnpj_inconclusive');
  if(eligible.size>1&&!selected)throw Error('website_cnpj_inconclusive');
  if(partners.size&&!eligible.size)throw Error('website_cnpj_inconclusive');
  return {cnpj:selected||requested||null,published:eligible.has(selected),source:contacts.has(selected)?'contact_page':'published_identity',partner_count:partners.size};
}

export async function verifyCandidate(candidate,{fetchPage=getPublic, fetchSearch=fetch, lookup=registry,beforeRegistry=async()=>{},onProgress=async()=>{},onEmailsFound=async()=>{},onCommercialObservation=null,emailScanOnly=false,settings=DEFAULT_SETTINGS}={}) {
  const root=candidate.discovery_url||candidate.website;
  const domain=domainOf(root);
  await onProgress('site');
  if(excludedDomain(domain)||socialUrl(root)||blockedProspectingSource(root))throw Error('excluded_or_own_domain');
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
    }}catch(e){
      if(index < 2){
        console.error(JSON.stringify({
          event:'digitale_site_access_diagnostic',
          domain,
          url,
          reason:String(e?.message || e).slice(0,150)
        }));
      }
    }
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
  let cnpjFromPublicSearch = false;
  // Preserve V15 contact-page priority, excluding partner identifiers on any
  // page and refusing conflicts with a previously supplied candidate CNPJ.
  const selection=selectCompanyCnpj(pages,candidate.cnpj);
  let cnpj=selection.cnpj;
  if(cnpj)console.log(JSON.stringify({event:'digitale_cnpj_selection_v16',domain,selected_cnpj:cnpj,source:selection.source,partner_count:selection.partner_count,identity_status:'requires_registry_validation'}));

  // DIGITALE_CNPJ_DIAGNOSTIC_V13
  // Diagnostico apenas: nao atribui CNPJ e nao aprova leads.
  if (!cnpj) {
    console.log(JSON.stringify({
      event: 'digitale_cnpj_search_v13',
      domain,
      site_cnpj_count: cnpjs.length,
      site_pages_checked: pages.length,
      search_required: true,
      identity_status: 'pending_confirmation'
    }));
  }

  // DIGITALE_CNPJ_SEARCH_V2
  // Busca externa com segunda fonte quando a primeira nao encontra.
  // Sem associar CNPJ por semelhanca de nome.
  if (!cnpj && cnpjs.length > 1) throw Error('website_cnpj_inconclusive');
  if (!cnpj) {
    // DIGITALE_CNPJ_SEARCH_V14
    // Prioriza associacao ao dominio exato.
    // Nao aprova CNPJ por semelhanca de nome.
    const searches = [
      {q: '"' + domain + '" CNPJ', engines: 'yahoo'},
      {q: '"' + domain + '" "razao social"', engines: 'yahoo'}
    ];

    const possible = new Set();

    for (const search of searches) {
      try {
        const endpoint = new URL('http://127.0.0.1:8888/search');

        endpoint.search = new URLSearchParams({
          ...search,
          format: 'json',
          language: 'pt-BR',
          safesearch: '1'
        });

        const response = await fetchSearch(endpoint, {
          signal: AbortSignal.timeout(12000)
        });

        if (!response.ok) continue;

        const data = await response.json();

        for (const result of
          (Array.isArray(data.results) ? data.results.slice(0, 20) : [])) {

          const title = String(result.title || '');
          const content = String(result.content || '');
          const resultUrl = String(result.url || '');

          const combined = [title, content, resultUrl].join(' ');

          if (!combined.toLowerCase().split(/[^a-z0-9.-]+/).some(token=>token.replace(/^www\./,'').replace(/\.$/,'')===domain)) {
            continue;
          }

          for (const found of publishedCnpjs(title + ' ' + content)) {
            if (validCnpj(found)) possible.add(found);
          }
        }

        // Se encontrou mais de um CNPJ, nao escolhe arbitrariamente.
        if (possible.size > 1) break;

        // Evita pesquisa adicional desnecessaria.
        if (possible.size === 1) break;

      } catch (error) {
        console.error(JSON.stringify({
          event: 'cnpj_public_search_failed',
          engine: search.engines,
          reason: String(error.message || error).slice(0, 120)
        }));
      }
    }

    if (possible.size === 1) {
      cnpj = [...possible][0];
      cnpjFromPublicSearch = true;

      await onProgress('identity', {
        cnpj,
        source: 'public_search_v2',
        domain
      });
    }
  }

  // DIGITALE_IDENTITY_DIAGNOSTICS_V3
  if(!cnpj||!validCnpj(cnpj)) {
    console.log(JSON.stringify({
      event:'identity_diagnostic_v3',
      domain,
      stage:'cnpj_discovery',
      reason:'cnpj_not_confirmed',
      site_cnpj_count:cnpjs.length,
      public_search_match:cnpjFromPublicSearch,
      candidate_cnpj_present:Boolean(normCnpj(candidate.cnpj))
    }));
    throw Error('website_cnpj_inconclusive');
  }
  await onProgress('identity',{cnpj});
  const phonePage=pages.find(p=>pageContacts(p).length);
  // Telefone pode vir do cadastro empresarial.
  await beforeRegistry(cnpj);
  await onProgress('registry',{cnpj});
  const record=await lookup(cnpj,fetchPage), r=record.data;
  if(!registryValid(r,cnpj))throw Error('registry_inactive_or_mismatch');
  if(r.mei_status === true)throw Error('mei_excluded');
  if(r.mei_status !== false)throw Error('mei_status_unconfirmed');
  if(!manufacturing(r))throw Error('not_apparel_manufacturer');
  await onProgress('profile',{cnpj,company:r.nome_fantasia||r.razao_social,uf:r.uf});
  const uf=String(r.uf||'').trim().toUpperCase();
  if(!Object.hasOwn(STATES,uf))throw Error('registry_state_inconclusive');
  if(!matchesRegion({uf},settings))throw Error('outside_target_state');
  // UF registrada sem restricao comercial.
  if(!pages.some(officialManufacturerPage))throw Error('outside_textile_buyer_profile');
  const textoComercial = pages.map(p => plain(p.body)).join(' ').slice(0,120000);
  const fitness = /moda\s+fitness|roupas?\s+fitness|activewear|sportswear|moda\s+esportiva|moda\s+praia|biqu[ií]ni|mai[oô]s|legging|top\s+fitness/i.test(textoComercial);
  const fabrica = /confec[cç][aã]o|fabricante\s+de\s+roupas|f[aá]brica\s+de\s+roupas|private\s+label|fac[cç][aã]o|produ[cç][aã]o\s+pr[oó]pria/i.test(textoComercial);
  const tecidos = /atacado\s+de\s+tecidos|distribui[cç][aã]o\s+de\s+tecidos|revenda\s+de\s+tecidos|tecidos\s+para\s+confec[cç][aã]o/i.test(textoComercial);
  const buyerSegment = classifyTextileBuyer(textoComercial);
  const resolvedBuyerSegment = buyerSegment || 'perfil_pendente';
  if(resolvedBuyerSegment === 'perfil_pendente')throw Error('outside_textile_buyer_profile');
  await onProgress('contact',{cnpj,company:r.nome_fantasia||r.razao_social,uf});
  const cnpjPage=selection.published?pages.find(p=>pageCnpjs(p.body).includes(cnpj)):null;
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
    (normCnpj(candidate.cnpj) === cnpj || cnpjFromPublicSearch) &&
    companyNameMatch &&
    phoneRegistryMatch
  );

  if (!cnpjPage && !alternativeIdentity) {
    console.log(JSON.stringify({
      event:'identity_diagnostic_v3',
      domain,
      stage:'company_identity',
      reason:'identity_evidence_insufficient',
      cnpj_from_public_search:cnpjFromPublicSearch,
      company_name_match:companyNameMatch,
      phone_registry_match:phoneRegistryMatch,
      site_phone_present:Boolean(sitePhone),
      registry_phone_count:registryPhones.length
    }));
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

   return {version:2,buyer_segment:resolvedBuyerSegment,email_search_completed:true,owner_id:OWNER,checked_at:new Date().toISOString(),cnpj,phone:number,company:r.nome_fantasia||r.razao_social,domain,email,phone_call_tested:false,registry:{url:record.url,cnpj,active:true,mei_status:false,manufacturing:true,primary_cnae:r.cnae_fiscal,secondary_cnaes:(r.cnaes_secundarios||[]).map(a=>a.codigo),uf,municipio:r.municipio||null,legal_name:r.razao_social,trade_name:r.nome_fantasia||null,source_updated_at:r.updated_at||null},identity_verified:true,identity_method:cnpjPage?'cnpj_publicado':'nome_e_telefone_cadastral',identity_evidence:{company_name_match:companyNameMatch,phone_registry_match:phoneRegistryMatch,cnpj_published:Boolean(cnpjPage),registry_url:record.url},website:{url:phonePage?.url||cnpjPage?.url||origin+'/',cnpj_url:cnpjPage?.url||null,cnpj_match:Boolean(cnpjPage),phone_match:Boolean(sitePhone),phone_source:phoneSource},discovery_url:root};
}
