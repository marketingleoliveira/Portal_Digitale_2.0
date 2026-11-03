import {links} from './prospecting-verification.mjs';
const domainOf=url=>new URL(url).hostname.toLowerCase().replace(/^www\./,'');
export function contactLinks(page,domain) {
  return [...new Set(links(page.body,page.url).filter(link=>{
    try {const u=new URL(link);return ['http:','https:'].includes(u.protocol)&&domainOf(link)===domain&&/^\/(?:pages\/|pagina\/|loja\/|institucional\/)?(?:contato|contact|sobre|about|quem|politica|policies|privacy|termos|terms|instituc|empresa|a-empresa|fale-conosco|atendimento|dados-cadastrais|informacoes-legais|informacoes-da-empresa|cnpj|legal|trocas|devolucoes)/i.test(u.pathname);}catch{return false;}
  }))].slice(0,8);
}
export function robotsAllowed(body,path) {
  const groups=[];let group={agents:[],rules:[]};
  for(const raw of String(body).split(/\r?\n/)) {
    const m=raw.split('#')[0].trim().match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i);if(!m)continue;
    if(m[1].toLowerCase()==='user-agent'){
      if(group.rules.length){groups.push(group);group={agents:[],rules:[]};}group.agents.push(m[2].toLowerCase());
    }else if(m[2])group.rules.push({allow:m[1].toLowerCase()==='allow',path:m[2]});
  }
  groups.push(group);
  const specific=groups.filter(g=>g.agents.some(a=>a!=='*'&&'digitaleleadverifier'.startsWith(a)));
  const selected=specific.length?specific:groups.filter(g=>g.agents.includes('*'));
  const matches=selected.flatMap(g=>g.rules).filter(rule=>{
    const end=rule.path.endsWith('$'),raw=end?rule.path.slice(0,-1):rule.path;
    const pattern=raw.split('*').map(piece=>piece.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*');
    return new RegExp('^'+pattern+(end?'$':'')).test(path);
  }).sort((a,b)=>b.path.length-a.path.length||Number(b.allow)-Number(a.allow));
  return !matches.length||matches[0].allow;
}
