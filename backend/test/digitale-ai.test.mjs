import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,validateSettings,matchesRegion} from '../src/services/digitale-ai-settings.mjs';
import {clientStatus,inactivityCutoff,parseOrderDate,validateClientRows} from '../src/services/digitale-ai-clients.mjs';
import {searchPlan} from '../src/services/prospecting-discovery.mjs';
import {deliveryQuota,deliverVerified,duplicate} from '../src/services/prospecting-auto-delivery.mjs';
import {verifyCandidate} from '../src/services/prospecting-auto-verification.mjs';
const now=new Date('2026-10-13T15:00:00Z'),cnpj='19131243000197';
test('configuration validates caps, regions, segments and pause',()=>{
  const settings=validateSettings({...DEFAULT_SETTINGS,states:['SC','SP','SP'],hourly_target:5,daily_target:20});
  assert.deepEqual(settings.states,['SC','SP']);
  for(const change of [{enabled:'false'},{hourly_target:101},{hourly_target:0},{daily_target:1001},{daily_target:1},{states:[]},{states:['XX']},{segments:[]},{segments:['x\ninvalid']}])assert.throws(()=>validateSettings({...DEFAULT_SETTINGS,...change}));
  assert.equal(matchesRegion({uf:'SC'},settings),true);assert.equal(matchesRegion({uf:'MG'},settings),false);
  assert.equal(deliveryQuota({hour:4,day:19,totalDay:19},now,false,settings),1);
  assert.equal(deliveryQuota({hour:5,day:19,totalDay:19},now,false,settings),0);
  assert.equal(deliveryQuota({hour:5,day:19,totalDay:19},now,true,settings),1);
  assert.equal(deliveryQuota({hour:0,day:0,totalDay:0},now,false,{...settings,enabled:false}),0);
  assert.equal(deliveryQuota({hour:0,day:0,totalDay:20},now,true,settings),0);
});
test('configured region and segment change both discovery and registry acceptance',async()=>{
  const settings={...DEFAULT_SETTINGS,states:['SC'],segments:['uniformes profissionais']};
  for(let cursor=0;cursor<100;cursor++){assert.match(searchPlan(cursor,settings).q,/Santa Catarina.*SC/);assert.match(searchPlan(cursor,settings).q,/uniformes profissionais/);}
  const fetchPage=async()=>({url:'https://example.com/',body:'CNPJ 19.131.243/0001-97 telefone (11) 99876-5432 Somos uma confecção de uniformes de produção própria.'});
  const lookup=async()=>({url:'https://registry.example/',data:{cnpj,razao_social:'Teste',situacao_cadastral:2,cnae_fiscal:1412601,mei_status:false,uf:'SC'}});
  assert.equal((await verifyCandidate({website:'https://example.com/'},{fetchPage,lookup,settings})).registry.uf,'SC');
  await assert.rejects(verifyCandidate({website:'https://example.com/'},{fetchPage,lookup,settings:{...DEFAULT_SETTINGS,states:['SP']}}),/outside_target_state/);
});
test('three calendar months handles exact boundary, short months and leap years',()=>{
  assert.equal(inactivityCutoff(now),'2026-07-13');
  assert.equal(clientStatus('2026-07-12',now),'inactive');assert.equal(clientStatus('2026-07-13',now),'active');
  assert.equal(clientStatus(null,now),'unknown');assert.equal(inactivityCutoff(new Date('2026-05-31T15:00Z')),'2026-02-28');
  assert.equal(inactivityCutoff(new Date('2024-05-31T15:00Z')),'2024-02-29');
  assert.equal(inactivityCutoff(new Date('2026-01-01T01:00Z')),'2025-09-30');
});
test('spreadsheet rows reject invalid CNPJ, impossible/future dates and keep latest duplicate order',()=>{
  assert.equal(parseOrderDate('12/07/2026',now),'2026-07-12');assert.equal(parseOrderDate('',now),null);
  for(const date of ['31/02/2026','2026-10-14','07/13/2026','not a date'])assert.throws(()=>parseOrderDate(date,now));
  const plan=validateClientRows([{cnpj:'19.131.243/0001-97',name:'Cliente',last_order_date:'2026-06-01'},{cnpj,name:'Cliente novo',last_order_date:'13/10/2026'},{cnpj:'19131243000198',name:'Inválido'}],now);
  assert.equal(plan.rows.length,1);assert.equal(plan.rows[0].last_order_date,'2026-10-13');assert.equal(plan.repeated,1);assert.equal(plan.errors.length,1);assert.equal(plan.errors[0].row,4);
});
test('imported customers block duplicate checks regardless of activity status',async()=>{
  const queries=[];const connection={execute:async sql=>{queries.push(sql);return [sql.includes('FROM digitale_ai_clients')?[{cnpj}]:[]];}};
  assert.equal(await duplicate(connection,{cnpj}),'customer_base');assert.equal(queries.length,2);
});
test('delivery rechecks current configuration inside transaction before CRM writes',async()=>{
  const proof={version:2,owner_id:'fba75bd9-8f92-4e2b-83f9-3bc48d7fa4bd',cnpj,phone:'11998765432',phone_call_tested:false,domain:'example.com',buyer_segment:'confeccao',email_search_completed:true,registry:{uf:'SP',active:true,mei_status:false,manufacturing:true},website:{url:'https://example.com/',cnpj_match:true,phone_match:true}};
  for(const settings of [{...DEFAULT_SETTINGS,states:['SC']},{...DEFAULT_SETTINGS,enabled:false}]){
    const writes=[];const connection={query:async()=>[[{acquired:1}]],execute:async(sql)=>{if(sql.includes('digitale_ai_settings'))return [[{settings:JSON.stringify(settings)}]];writes.push(sql);return [[]];},beginTransaction:async()=>{},rollback:async()=>{},release:()=>{}};
    if(settings.enabled)await assert.rejects(deliverVerified({getConnection:async()=>connection},proof),/outside_target_state/);
    else assert.equal((await deliverVerified({getConnection:async()=>connection},proof)).reason,'prospecting_paused');
    assert.deepEqual(writes,[]);
  }
});

test('configured inactivity months change the boundary and reject invalid periods',()=>{
 assert.equal(validateSettings({...DEFAULT_SETTINGS,inactivity_months:6}).inactivity_months,6);
 for(const inactivity_months of [0,61,1.5,'3',null])assert.throws(()=>validateSettings({...DEFAULT_SETTINGS,inactivity_months}));
 assert.equal(inactivityCutoff(now,6),'2026-04-13');
 assert.equal(clientStatus('2026-05-01',now,3),'inactive');assert.equal(clientStatus('2026-05-01',now,6),'active');
 assert.equal(clientStatus('2026-04-13',now,6),'active');assert.equal(clientStatus('2026-04-12',now,6),'inactive');
 assert.equal(clientStatus(null,now,6),'unknown');assert.equal(inactivityCutoff(new Date('2026-03-31T15:00Z'),1),'2026-02-28');
});
