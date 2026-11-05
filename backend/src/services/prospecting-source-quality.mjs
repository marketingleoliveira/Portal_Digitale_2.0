import {plain} from './prospecting-verification.mjs';

const blockedHosts = [
  'contabilivre.com.br','tudoaquitaubate.com.br','mylinq.com.br',
  'prudenteempresas.com.br','elementor.com','fiepr.org.br','radardocnpj.com.br',
  'cnpjonline.com','consultacnpj.com','consultacnpj.org','consultacnpjfacil.com.br',
  'cnpjob.com.br','procuracnpj.com.br','brasilcnpjs.com.br','brasilcnpj.net',
  'achacnpj.com','cnpj.info','cnpja.com','cnpj.biz','hagah.com.br',
  'apontador.com.br','telelistas.net','telelistas.com','cylex.com.br',
  'listamais.com.br','maiscnpj.com.br','efirma.com.br','applocal.com.br',
  'guiatelefone.com','modafeminina.com.br','brasillocais.com',
  'guiadasroupas.com','americanamoda.com.br','americana.net.br',
  'encontraamericana.com.br','tuum.com.br','audaces.com','lysa.tech'
];
export function blockedProspectingSource(value) {
  let url;
  try {url=new URL(String(value).includes('://')?value:'https://'+value);} catch{return true;}
  const host=url.hostname.toLowerCase().replace(/^www\./,'');
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return true;
  return blockedHosts.some(d=>host===d||host.endsWith('.'+d)) ||
    /\/(?:blog|artigos?|noticias|guias?|consulta[-_]?cnpj|consulta[-_]?empresa)(?:\/|$)/i.test(url.pathname);
}
const apparel=/moda|fitness|vestu[aá]rio|roupas?|lingerie|uniformes?|biqu[ií]nis?|mai[oô]s|malharia|tric[oô]|jeans|camisetas?/i;
const production=/confec[cç][aãõo]|fabricantes?\s+(?:de|em)|f[aá]brica\s+(?:de|da)|fabrica[cç][aã]o\s+(?:pr[oó]pria|de\s+roupas)|produ[cç][aã]o\s+pr[oó]pria|fabricamos\s+(?:todas|nossas|roupas)|produzimos\s+(?:nossas|roupas|uniformes)|private\s+label|ind[uú]stria\s+(?:de|do)/i;
const directory=/consulta\s+(?:de\s+)?cnpj|consultar\s+cnpj|guia\s+(?:comercial|de empresas)|lista(?:gem)?\s+de\s+(?:empresas|fabricantes)|empresas\s+cadastradas|\d+\s+(?:f[aá]bricas|fornecedores|op[cç][oõ]es)/i;
export function apparelSearchHint(title,content) {
  const text=plain(title+' '+content);
  // O resumo só indica uma página a visitar. A produção de vestuário continua
  // sendo comprovada no site e no cadastro; títulos de marcas podem ser curtos.
  return (apparel.test(text)||/confec[cç][aãõo]|alfaiataria|private\s+label/i.test(text))&&!directory.test(text);
}
export function manufacturerEvidence(title,content) {
  const text=plain(title+' '+content);
  return apparel.test(text)&&production.test(text)&&!directory.test(text);
}
export function officialManufacturerPage(page) {
  if(blockedProspectingSource(page.url))return false;
  const body=String(page.body||'');
  const title=plain(body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'');
  if(/contabilidade|ag[eê]ncia\s+(?:digital|de marketing)|software|consulta\s+cnpj|guia\s+comercial/i.test(title))return false;
  return manufacturerEvidence(title,plain(body).slice(0,120000));
}
