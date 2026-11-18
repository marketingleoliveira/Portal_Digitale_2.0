import test from 'node:test';
import assert from 'node:assert/strict';
import {searchPlan,discoverCandidates} from '../src/services/prospecting-discovery.mjs';
import {registry} from '../src/services/prospecting-auto-verification.mjs';
import {DEFAULT_SETTINGS} from '../src/services/digitale-ai-settings.mjs';
const settings={...DEFAULT_SETTINGS,states:['SP'],segments:['moda fitness']};
test('SP varies queries on the supported search page without changing region',()=>{
 const plans=Array.from({length:750},(_,i)=>searchPlan(i,settings));
 assert.deepEqual([...new Set(plans.map(p=>p.pageno))].sort(),[1]);
 assert.ok(new Set(plans.map(p=>p.q)).size>100);
 assert.deepEqual([...new Set(plans.map(p=>p.engines))].sort(),['duckduckgo']);
 assert.ok(plans.every(p=>p.q.includes('São Paulo')));
});
test('empty preferred engine falls back to the second search source',async()=>{
 const engines=[];const db={execute:async()=>[[]]};
 const r=await discoverCandidates(db,0,{settings,fetchSearch:async u=>{
  engines.push(u.searchParams.get('engines'));
  return Response.json({results:engines.length===1?[]:[{url:'https://example.com/',title:'Unrelated result'}]});
 }});
 assert.deepEqual(engines,['duckduckgo','yahoo']);assert.equal(r.received,1);
});
test('missing MEI on a successful primary response requires secondary confirmation',async()=>{
 const urls=[];
 const result=await registry('00000000000000',async url=>{
  urls.push(url);
  return {url,body:JSON.stringify(url.includes('brasilapi')?{cnpj:'00000000000000',opcao_pelo_mei:null}:{simples:{mei:'Não'},razao_social:'Fixture',estabelecimento:{cnpj:'00000000000000',situacao_cadastral:'ATIVA',atividade_principal:{id:'1412601'},estado:{sigla:'SP'}}})};
 });
 assert.equal(urls.length,2);assert.equal(result.data.mei_status,false);
 assert.ok(result.url.includes('publica.cnpj.ws'));
});
