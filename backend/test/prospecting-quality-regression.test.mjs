import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DEFAULT_SETTINGS,STATES,getSettings,validateSettings,settingsRevision,assertSettingsRevision} from '../src/services/digitale-ai-settings.mjs';
import {selectCompanyCnpj,verifyCandidate} from '../src/services/prospecting-auto-verification.mjs';
import {blockedProspectingSource,officialManufacturerPage} from '../src/services/prospecting-source-quality.mjs';
import {discoverCandidates} from '../src/services/prospecting-discovery.mjs';
import {reopenGeographicCandidates} from '../src/services/prospecting-region-retry.mjs';
import {deliverVerified} from '../src/services/prospecting-auto-delivery.mjs';

const owner='09079254000111',agency='49657693000189';
const company='CNPJ: 09.079.254/0001-11 Somos uma confecção de uniformes de produção própria. Telefone (31) 99876-5432.';
const partner='Desenvolvido por agência digital Mavi CNPJ: 49.657.693/0001-89';
const page=(body,path='/contato')=>({url:'https://fixture.example'+path,body});
const record={url:'https://registry.example/'+owner,data:{cnpj:owner,razao_social:'CONFECCOES IRMAOS CABRAL LTDA',situacao_cadastral:2,mei_status:false,cnae_fiscal:1422300,uf:'MG'}};

test('defaults and isolated fallback use 20/160 and all 27 UFs',async()=>{
 assert.equal(DEFAULT_SETTINGS.hourly_target,20);assert.equal(DEFAULT_SETTINGS.daily_target,160);assert.equal(DEFAULT_SETTINGS.states.length,27);
 const one=await getSettings({execute:async()=>[[]]});one.states.pop();
 assert.equal((await getSettings({execute:async()=>[[]]})).states.length,27);
 assert.throws(()=>assertSettingsRevision(DEFAULT_SETTINGS,undefined),e=>e.status===409);
 assert.throws(()=>assertSettingsRevision(DEFAULT_SETTINGS,settingsRevision({...DEFAULT_SETTINGS,states:['SP'],hourly_target:10,daily_target:80})),e=>e.status===409);
 assert.doesNotThrow(()=>assertSettingsRevision(DEFAULT_SETTINGS,settingsRevision(DEFAULT_SETTINGS)));
});

test('owner CNPJ is preferred on contact paths and partners never establish ownership',()=>{
 for(const path of ['/contato','/contato/','/fale-conosco','/pages/contato']){
  const result=selectCompanyCnpj([page(company+' '+partner,path)]);
  assert.equal(result.cnpj,owner);assert.equal(result.partner_count,1);assert.equal(result.published,true);
 }
 assert.throws(()=>selectCompanyCnpj([page(partner)]),/inconclusive/);
 assert.throws(()=>selectCompanyCnpj([page(company+' '+partner)],agency),/inconclusive/);
 assert.throws(()=>selectCompanyCnpj([page(company+' CNPJ: 19.131.243/0001-97')]),/inconclusive/);
});

test('structured agency identity is excluded while same-host company identity is accepted',()=>{
 const html='<script type="application/ld+json">'+JSON.stringify({'@type':'Organization',url:'https://fixture.example/',taxID:owner,creator:{url:'https://agency.example/',taxID:agency}})+'</script>';
 const result=selectCompanyCnpj([page(html,'/')]);assert.equal(result.cnpj,owner);assert.equal(result.partner_count,1);
});

test('full verification preserves strict registry, geography and manufacturing checks',async()=>{
 const options={fetchPage:async url=>page(url.endsWith('robots.txt')?'':company+' '+partner),lookup:async()=>record};
 const proof=await verifyCandidate({website:'https://fixture.example/'},options);
 assert.equal(proof.cnpj,owner);assert.equal(proof.registry.mei_status,false);assert.equal(proof.registry.primary_cnae,1422300);assert.equal(proof.registry.manufacturing,true);
 for(const [change,reason] of [[{mei_status:true},/mei_excluded/],[{mei_status:null},/mei_status_unconfirmed/],[{situacao_cadastral:8},/inactive/],[{cnae_fiscal:6201501},/not_apparel/],[{cnpj:agency},/mismatch/],[{uf:'XX'},/registry_state_inconclusive/]]){
  await assert.rejects(verifyCandidate({website:'https://fixture.example/'},{...options,lookup:async()=>({...record,data:{...record.data,...change}})}),reason);
 }
 await assert.rejects(verifyCandidate({website:'https://fixture.example/'},{...options,settings:{...DEFAULT_SETTINGS,states:['SP']}}),/outside_target_state/);
});

test('known sources and generic snippets cannot become manufacturer candidates',async()=>{
 for(const domain of ['contabilivre.com.br','tudoaquitaubate.com.br','mylinq.com.br','prudenteempresas.com.br','elementor.com','fiepr.org.br','radardocnpj.com.br']){
  assert.equal(blockedProspectingSource('https://www.'+domain+'/'),true);
  await assert.rejects(verifyCandidate({website:'https://'+domain+'/'}),/excluded_or_own_domain/);
 }
 assert.equal(officialManufacturerPage(page('<title>Software para confecção</title>Fabricante de roupas e moda fitness são nossos clientes.','/')),false);
 const writes=[];
 const db={execute:async(sql,args)=>{if(sql.startsWith('SELECT'))return [[]];writes.push({sql,args});return [{affectedRows:1}];}};
 const result=await discoverCandidates(db,0,{fetchSearch:async()=>Response.json({results:[
  {url:'https://software.example/',title:'Fabricante de roupas',content:'Produção própria de uniformes'},
  {url:'https://real.example/',title:'Confecção de uniformes',content:'Produção própria de uniformes'},
  {url:'https://generic.example/',title:'Moda fitness',content:'Confira nossas opções'}
 ]}),fetchSite:async url=>({url,body:url.includes('software')?'<title>Software para confecção</title>Produção própria de roupas.':url.includes('generic')?'Loja revendedora de moda fitness multimarcas':company})});
 assert.equal(result.found,1);assert.equal(result.rejected,2);assert.equal(writes.length,1);assert.equal(writes[0].args[2],'real.example');
 assert.equal(JSON.parse(writes[0].args[3]).discovery.manufacturer_evidence,true);
 await assert.rejects(deliverVerified({}, {domain:'contabilivre.com.br',website:{url:'https://contabilivre.com.br/'}}),/not_eligible/);
});

function settingsRoute(initial=DEFAULT_SETTINGS){
 let saved=validateSettings(initial),snapshot,writes=0,reopens=0;
 const c={query:async()=>[[{acquired:1}]],beginTransaction:async()=>{snapshot=structuredClone(saved);},commit:async()=>{},rollback:async()=>{saved=snapshot;},release(){},execute:async(sql,args)=>{
  if(sql.startsWith('SELECT settings'))return [[{settings:JSON.stringify(saved)}]];
  writes++;if(sql.startsWith('INSERT INTO digitale_ai_settings('))saved=JSON.parse(args[0]);
  return [{affectedRows:1}];
 }};
 const handlers={};const router={use(){},get(path,fn){handlers['GET '+path]=fn;},put(path,fn){handlers['PUT '+path]=fn;},post(){}};
 const source=readFileSync(new URL('../src/routes/digitale-ai.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export default router;','');
 vm.runInNewContext(source,{express:{Router:()=>router},crypto,db:{...c,getConnection:async()=>c},requireAuth(){},requireAIAccess(){},getSettings,validateSettings,settingsRevision,assertSettingsRevision,STATES,reopenGeographicCandidates:async()=>{reopens++;},refreshClientStatuses:async()=>{}});
 return {get saved(){return saved;},get writes(){return writes;},get reopens(){return reopens;},async call(method,body){let code=200,data;await handlers[method+' /']({body,user:{id:'fixture'}},{status(n){code=n;return this;},json(d){data=d;}},e=>{throw e;});return {code,data};}};
}

test('administrative endpoint rejects stale and versionless saves before any write',async()=>{
 const route=settingsRoute();const stale=await route.call('GET');
 const updated=await route.call('PUT',{...stale.data.settings,hourly_target:21,revision:stale.data.revision});
 assert.equal(updated.code,200);assert.notEqual(updated.data.revision,stale.data.revision);
 const writes=route.writes;
 for(const revision of [undefined,stale.data.revision]){
  assert.equal((await route.call('PUT',{...DEFAULT_SETTINGS,states:['SP'],hourly_target:10,daily_target:80,revision})).code,409);
 }
 assert.equal(route.writes,writes);assert.equal(route.saved.states.length,27);assert.equal(route.saved.hourly_target,21);
});

test('unavailable search engines trigger backoff instead of reporting a successful empty discovery',async()=>{
 await assert.rejects(discoverCandidates({execute:async()=>{throw Error('unexpected write');}},0,{fetchSearch:async()=>Response.json({results:[],unresponsive_engines:[['yahoo','CAPTCHA']]})}),/discovery_provider_unavailable/);
});

test('region contraction does not reopen geographic rejections, expansion does',async()=>{
 const route=settingsRoute();let current=(await route.call('GET')).data;
 assert.equal((await route.call('PUT',{...current.settings,states:['SP'],revision:current.revision})).code,200);assert.equal(route.reopens,0);
 current=(await route.call('GET')).data;
 assert.equal((await route.call('PUT',{...current.settings,states:['SP','MG'],revision:current.revision})).code,200);assert.equal(route.reopens,1);
});

test('legacy settings clients cannot erase the saved exact CNAE filter',async()=>{
 const route=settingsRoute({...DEFAULT_SETTINGS,cnaes:['1412601']});
 const fresh=(await route.call('GET')).data;
 const {cnaes,...legacy}=fresh.settings;
 const saved=await route.call('PUT',{...legacy,revision:fresh.revision});
 assert.equal(saved.code,200);assert.deepEqual(route.saved.cnaes,['1412601']);
});
