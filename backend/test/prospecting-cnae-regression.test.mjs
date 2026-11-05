import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,validateSettings,matchesCnae} from '../src/services/digitale-ai-settings.mjs';
import {verifyCandidate} from '../src/services/prospecting-auto-verification.mjs';
import {deliverVerified} from '../src/services/prospecting-auto-delivery.mjs';
import {searchPlan,discoverCandidates} from '../src/services/prospecting-discovery.mjs';
const settings=validateSettings({...DEFAULT_SETTINGS,states:['SP'],cnaes:['1412-6/01']});
const cnpj='19131243000197';
const page={url:'https://example.com/',body:'CNPJ 19.131.243/0001-97 Telefone (11) 99876-5432 Somos uma confecção de vestuário de produção própria.'};
const data={cnpj,razao_social:'Fixture Manufacturer',situacao_cadastral:2,mei_status:false,cnae_fiscal:1412601,uf:'SP'};
test('exact requested primary CNAE survives normalization and rejects sibling or secondary-only activity',()=>{
 assert.deepEqual(settings.cnaes,['1412601']);
 assert.equal(matchesCnae(data,settings),true);
 for(const cnae_fiscal of [1412602,1412603,1411801,4781400,null])assert.equal(matchesCnae({cnae_fiscal,cnaes_secundarios:[{codigo:1412601}]},settings),false);
 for(const cnaes of [['14126'],['1412601 OR 1=1'],['foo1412601'],'1412601',[1412601]])assert.throws(()=>validateSettings({...DEFAULT_SETTINGS,cnaes}));
});
test('full verification rejects the wrong primary even if the exact CNAE is secondary',async()=>{
 const options={settings,fetchPage:async()=>page,lookup:async()=>({url:'https://registry.example/',data})};
 const proof=await verifyCandidate({website:page.url},options);assert.equal(proof.registry.primary_cnae,1412601);
 await assert.rejects(verifyCandidate({website:page.url},{...options,lookup:async()=>({url:'https://registry.example/',data:{...data,cnae_fiscal:1412602,cnaes_secundarios:[{codigo:1412601}]}})}),/outside_target_cnae/);
});
test('delivery rejects a stale proof against current CNAE settings before writing leads',async()=>{
 const writes=[];
 const connection={query:async()=>[[{acquired:1}]],beginTransaction:async()=>{},rollback:async()=>{},release(){},execute:async sql=>{
  if(sql.startsWith('SELECT settings'))return [[{settings:JSON.stringify(settings)}]];
  writes.push(sql);throw Error('Unexpected write');
 }};
 const proof={version:2,owner_id:'fba75bd9-8f92-4e2b-83f9-3bc48d7fa4bd',cnpj,phone:'11998765432',phone_call_tested:false,domain:'example.com',buyer_segment:'confeccao',email_search_completed:true,registry:{uf:'SP',active:true,mei_status:false,manufacturing:true,primary_cnae:1412602},website:{url:page.url,cnpj_match:true,phone_match:true}};
 await assert.rejects(deliverVerified({getConnection:async()=>connection},proof),/outside_target_cnae/);assert.deepEqual(writes,[]);
});
test('SP discovery rotates interior cities instead of repeating the same 84 statewide searches',()=>{
 const plans=Array.from({length:100},(_,i)=>searchPlan(i,settings));
 assert(plans.some(p=>/Americana/.test(p.q)));assert(plans.some(p=>/Campinas/.test(p.q)));
 assert(plans.every(p=>p.q.includes('São Paulo SP')));
 assert.notEqual(searchPlan(0,settings).q,searchPlan(84,settings).q);
});
test('exhausted provider results are retried excluding known domains; new firms still require fetched production evidence',async()=>{
 const rows=['one.example','two.example','three.example'].map(domain=>({url:'https://'+domain+'/',title:'Confecção de vestuário'}));
 const inserted=[];let calls=0;
 const db={execute:async(sql,args)=>{
  if(sql.startsWith('SELECT'))return [args[0]==='new.example'?[]:[{id:'known'}]];
  inserted.push(args);return [{affectedRows:1}];
 }};
 const result=await discoverCandidates(db,0,{settings,fetchSearch:async url=>{
  calls++;if(calls===1)return Response.json({results:rows});
  assert(url.searchParams.get('q').includes('-site:one.example'));
  return Response.json({results:[{url:'https://new.example/',title:'Confecção de vestuário'}]});
 },fetchSite:async url=>({url,body:page.body})});
 assert.equal(calls,2);assert.equal(result.found,1);assert.equal(inserted[0][2],'new.example');
});

test('a provider failure uses the other engine before putting all discovery in backoff',async()=>{
 const engines=[];
 const result=await discoverCandidates({execute:async sql=>sql.startsWith('SELECT')?[[]]:[{affectedRows:1}]},0,{settings,fetchSearch:async url=>{
  const engine=url.searchParams.get('engines');engines.push(engine);
  return engine==='yahoo'?Response.json({results:[],unresponsive_engines:[['yahoo','CAPTCHA']]}):Response.json({results:[{url:'https://new.example/',title:'Confecção de vestuário'}]});
 },fetchSite:async url=>({url,body:page.body})});
 assert.deepEqual(engines,['yahoo','duckduckgo']);assert.equal(result.found,1);assert.equal(result.plan.engines,'duckduckgo');
});

test('HTTP and network errors do not stop discovery while the other provider is healthy',async()=>{
 for(const failure of ['http','network']){
  const result=await discoverCandidates({execute:async sql=>sql.startsWith('SELECT')?[[]]:[{affectedRows:1}]},0,{settings,fetchSearch:async url=>{
   if(url.searchParams.get('engines')==='yahoo'){
    if(failure==='network')throw Error('fetch failed');
    return new Response('',{status:429});
   }
   return Response.json({results:[{url:'https://new.example/',title:'Confecção de vestuário'}]});
  },fetchSite:async url=>({url,body:page.body})});
  assert.equal(result.found,1);assert.equal(result.plan.engines,'duckduckgo');
 }
});

test('legacy technical CNPJ refusals are reconsidered once; commercial refusals and current-policy failures are preserved',async()=>{
 const {recoverableCandidate,VERIFICATION_POLICY}=await import('../src/services/prospecting-candidate-recovery.mjs');
 assert.equal(recoverableCandidate({status:'rejected',reason:'cnpj_ausente_ou_invalido',proof:null}),true);
 for(const status of ['delivered','verified','duplicate','verifying'])assert.equal(recoverableCandidate({status,reason:'website_cnpj_inconclusive'}),false);
 for(const reason of ['outside_target_cnae','mei_excluded','outside_target_state','customer_base','outside_profile_history'])assert.equal(recoverableCandidate({status:'rejected',reason}),false);
 assert.equal(recoverableCandidate({status:'rejected',reason:'website_cnpj_inconclusive',proof:JSON.stringify({verification_policy:VERIFICATION_POLICY})}),false);
 const queries=[];
 const result=await discoverCandidates({execute:async(sql,args)=>{
  queries.push({sql,args});return sql.startsWith('SELECT')?[[{id:'legacy',status:'rejected',reason:'cnpj_ausente_ou_invalido',proof:null}]]:[{affectedRows:1}];
 }},0,{settings,fetchSearch:async()=>Response.json({results:[{url:'https://legacy.example/',title:'Confecção de vestuário'}]}),fetchSite:async url=>({url,body:page.body})});
 assert.equal(result.recovered,1);assert.equal(result.found,0);
 assert.equal(queries.filter(q=>q.sql.startsWith('UPDATE')).length,1);
 assert(queries.every(q=>!q.sql.startsWith('INSERT')));
});

test('plural and unaccented confecções are recognized without admitting a simple retailer',async()=>{
 const {classifyTextileBuyer}=await import('../src/services/prospecting-textile-profile.mjs');
 for(const company of ['C K CONFECCOES RIO PRETO LTDA','Confecções de moda feminina','Confecção de vestuário'])assert.equal(classifyTextileBuyer(company+' Moda feminina roupas e vestidos.'),'confeccao');
 assert.equal(classifyTextileBuyer('Loja de roupas femininas multimarcas.'),null);
 const {recoverableCandidate}=await import('../src/services/prospecting-candidate-recovery.mjs');
 assert.equal(recoverableCandidate({status:'rejected',reason:'outside_textile_buyer_profile',proof:JSON.stringify({discovery:{manufacturer_evidence:true}})}),true);
 assert.equal(recoverableCandidate({status:'rejected',reason:'outside_textile_buyer_profile',proof:null}),false);
});
