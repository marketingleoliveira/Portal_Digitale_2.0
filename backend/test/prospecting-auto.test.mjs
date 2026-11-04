import test from 'node:test';
import assert from 'node:assert/strict';
import {windowAt,quota,nextRun,OWNER} from '../src/services/prospecting-policy.mjs';
import {validCnpj,phone} from '../src/services/prospecting-verification.mjs';
import {verifyCandidate,registryValid,pageContacts} from '../src/services/prospecting-auto-verification.mjs';
import {deliverVerified,duplicate} from '../src/services/prospecting-auto-delivery.mjs';
test('Brazilian checksums and DDD reject plausible but invalid values',()=>{
 assert.equal(validCnpj('19.131.243/0001-97'),true);assert.equal(validCnpj('19131243000198'),false);
 assert.equal(validCnpj('00000000000000'),false);assert.equal(phone('+55 (11) 99876-5432'),'11998765432');
 assert.equal(phone('20998765432'),null);assert.equal(phone('1112345678'),null);
});
test('every day, inclusive 08h, exclusive 18h, Brazil timezone',()=>{
 assert.equal(windowAt(new Date('2026-10-18T10:59:59Z')).open,false);
 assert.equal(windowAt(new Date('2026-10-18T11:00:00Z')).open,true);
 assert.equal(windowAt(new Date('2026-10-18T20:59:59Z')).open,true);
 assert.equal(windowAt(new Date('2026-10-18T21:00:00Z')).open,false);
 assert.equal(nextRun(new Date('2026-10-18T21:00:00Z')).toISOString(),'2026-10-19T11:00:00.000Z');
 assert.equal(windowAt(new Date('2018-12-10T10:00:00Z')).hour,8);
 assert.equal(windowAt(new Date('2018-11-04T12:00:00Z')).dayStart.toISOString(),'2018-11-04T03:00:00.000Z');
});
test('hourly and daily limits are enforced independently',()=>{
 const at=new Date('2026-10-13T14:00:00Z');assert.equal(quota(0,0,at),20);assert.equal(quota(20,50,at),0);
 assert.equal(quota(3,159,at),1);assert.equal(quota(0,160,at),0);assert.equal(quota(0,0,new Date('2026-10-13T22:00:00Z')),0);
});
const cnpj='19131243000197',url='https://example.com/';
const page={url,body:'CNPJ 19.131.243/0001-97 Telefone (11) 99876-5432 Somos uma confecção de uniformes de produção própria.'};
const record={url:'https://brasilapi.com.br/api/cnpj/v1/'+cnpj,data:{cnpj,razao_social:'Fixture Manufacturer',situacao_cadastral:2,cnae_fiscal:1412601,mei_status:false,uf:'SP'}};
test('verification requires fetched site identity, published phone and active manufacturer registry',async()=>{
 const proof=await verifyCandidate({website:url},{fetchPage:async()=>page,lookup:async()=>record});
 assert.equal(proof.owner_id,OWNER);assert.equal(proof.phone_call_tested,false);
 await assert.rejects(verifyCandidate({website:url},{fetchPage:async()=>({...page,body:'Telefone (11) 99876-5432 Somos uma confecção de uniformes de produção própria.'}),lookup:async()=>record}),/cnpj_inconclusive/);
 await assert.rejects(verifyCandidate({website:url},{fetchPage:async()=>({...page,body:'CNPJ 19.131.243/0001-97 Somos uma confecção de uniformes de produção própria.'}),lookup:async()=>record}),/phone_missing/);
 await assert.rejects(verifyCandidate({website:url},{fetchPage:async()=>page,lookup:async()=>({...record,data:{...record.data,situacao_cadastral:8}})}),/inactive/);
 await assert.rejects(verifyCandidate({website:url},{fetchPage:async()=>page,lookup:async()=>{throw Error('provider_http_429');}}),/429/);
 await assert.rejects(verifyCandidate({website:'https://digitaletextil.com.br'}),/own_domain/);
});
test('links published by the company count as phone evidence',()=>assert.deepEqual(pageContacts({url,body:'<a href="https://wa.me/5511998765432">WhatsApp</a>'}),['11998765432']));
test('each of the four CRM sources independently blocks a duplicate',async()=>{
 for(const table of ['crm_organizations','leads','crm_deals','crm_external_lead_imports']) {
  const seen=[];
  const connection={execute:async sql=>{seen.push(sql);return [sql.includes('FROM '+table+' ')?[{id:'existing'}]:[]];}};
  assert.equal(await duplicate(connection,{cnpj,company:'Fixture',phone:'11998765432',domain:'example.com'}),table);
  assert.ok(seen.every(sql=>!sql.includes('UPDATE')));
 }
});
test('recovery of committed delivery is idempotent and performs no CRM writes',async()=>{
 const queries=[];
 const connection={query:async sql=>{queries.push(sql);return [[{acquired:1}]];},execute:async sql=>{queries.push(sql);return [sql.includes('digitale_ai_settings')?[]:[{deal_id:'committed-deal'}]];},beginTransaction:async()=>{},rollback:async()=>{},release:()=>{}};
 const proof=await verifyCandidate({website:url},{fetchPage:async()=>page,lookup:async()=>record});
 const result=await deliverVerified({getConnection:async()=>connection},proof);
 assert.equal(result.created,false);assert.equal(result.deal_id,'committed-deal');
 assert.ok(queries.some(q=>q.includes('GET_LOCK')));assert.ok(queries.some(q=>q.includes('RELEASE_LOCK')));assert.ok(!queries.some(q=>/INSERT|UPDATE/.test(q)));
});

test('SITE enrichment preserves origin and participates in the import lock',async()=>{
 const {readFile}=await import('node:fs/promises');
 const ai=await readFile(new URL('../src/routes/ai-leads.js',import.meta.url),'utf8');
 const site=await readFile(new URL('../src/routes/site-leads.js',import.meta.url),'utf8');
 assert.match(ai,/source = 'SITE'/);assert.equal(site.split("'digitale:crm-import'").length-1,2);
});

function transactionalFixture({fail=false,hour=19,day=159,externalDelivered=0}={}) {
 const state={writes:[],commits:0,rollbacks:0};
 const connection={query:async()=>[[{acquired:1}]],beginTransaction:async()=>{},release:()=>{},commit:async()=>{state.commits++;},rollback:async()=>{state.rollbacks++;},execute:async(sql,args)=>{
  if(sql.includes('SUM(approved_at'))return [[{hour_count:0,day_count:0}]];
  if(sql.includes('SUM(delivered_at'))return [[{hour_count:hour,day_count:day}]];
  if(sql.includes('SUM(d.created_at'))return [[{hour_count:0,day_count:0}]];
  if(sql.startsWith('UPDATE')){state.writes.push({sql,args});return [{affectedRows:1}];}
  if(sql.includes('FROM prospecting_external_batches'))return [[{target:30,status:'running'}]];
  if(sql.includes('WHERE external_batch_id=?'))return [[{total:externalDelivered}]];
  if(sql.includes('FROM profiles'))return [[{id:OWNER}]];
  if(sql.includes('FROM crm_pipelines'))return [[{pipeline_id:'pipeline',stage_id:'prospecting'}]];
  if(sql.startsWith('INSERT')){state.writes.push({sql,args});if(fail&&sql.includes('prospecting_approved_leads'))throw Error('database_unavailable');return [{affectedRows:1}];}
  return [[]];
 }};
 return {state,db:{getConnection:async()=>connection}};
}
const clock=()=>new Date('2026-10-13T14:00:00Z');
test('qualified approval and evidence commit together without creating a CRM delivery',async()=>{
 const proof=await verifyCandidate({website:url},{fetchPage:async()=>page,lookup:async()=>record});
 const {state,db}=transactionalFixture();const result=await deliverVerified(db,proof,null,{clock});
 assert.equal(result.created,true);assert.equal(result.approved,true);assert.equal(result.owner_id,null);assert.equal(state.commits,1);
 assert.equal(state.writes.length,1);assert.match(state.writes[0].sql,/INSERT INTO prospecting_approved_leads/);
 assert.equal(JSON.parse(state.writes[0].args[7]).cnpj,cnpj);
 assert.ok(!state.writes.some(w=>/crm_deals|prospecting_auto_deliveries/.test(w.sql)));
});
test('failed approval rolls back and consumes no quota',async()=>{
 const proof=await verifyCandidate({website:url},{fetchPage:async()=>page,lookup:async()=>record});
 const {state,db}=transactionalFixture({fail:true});await assert.rejects(deliverVerified(db,proof,null,{clock}),/database_unavailable/);
 assert.equal(state.commits,0);assert.equal(state.rollbacks,1);assert.ok(!state.writes.some(w=>w.sql.includes('prospecting_auto_deliveries')));
});
test('hour, day and closed window prevent all CRM inserts',async()=>{
 const proof=await verifyCandidate({website:url},{fetchPage:async()=>page,lookup:async()=>record});
 for(const policy of [{hour:20,day:70},{hour:0,day:160},{hour:0,day:0,closed:true}]){
  const {state,db}=transactionalFixture(policy);
  const result=await deliverVerified(db,proof,null,{clock:policy.closed?()=>new Date('2026-10-13T21:00:00Z'):clock});
  assert.equal(result.deferred,true);assert.equal(state.writes.length,0);assert.equal(state.commits,0);
 }
});

test('external batch is independent of hourly target and always obeys global 160/day',async()=>{
 const {deliveryQuota}=await import('../src/services/prospecting-auto-delivery.mjs');
 assert.equal(deliveryQuota({hour:16,day:20,totalDay:20},clock(),true),140);
 assert.equal(deliveryQuota({hour:20,day:20,totalDay:20},clock(),false),0);
 assert.equal(deliveryQuota({hour:0,day:130,totalDay:160},clock(),true),0);
 assert.equal(deliveryQuota({hour:0,day:130,totalDay:160},clock(),false),0);
 assert.equal(deliveryQuota({hour:0,day:129,totalDay:159},clock(),false),1);
});

test('external batch records its identity and refuses a 31st delivery atomically',async()=>{
 const proof=await verifyCandidate({website:url},{fetchPage:async()=>page,lookup:async()=>record});
 const open=transactionalFixture({hour:16,day:20});
 const result=await deliverVerified(open.db,proof,null,{clock,externalBatchId:'fixture-batch'});
 assert.equal(result.created,true);assert.equal(open.state.commits,1);
 const queued=open.state.writes.find(w=>w.sql.includes('INSERT INTO prospecting_approved_leads'));
 assert.equal(queued.args.at(-1),'fixture-batch');assert.equal(result.approved,true);
 const full=transactionalFixture({hour:16,day:20,externalDelivered:30});
 const blocked=await deliverVerified(full.db,proof,null,{clock,externalBatchId:'fixture-batch'});
 assert.equal(blocked.created,false);assert.equal(blocked.reason,'external_batch_complete');assert.equal(full.state.writes.length,0);
});


test('valid registry states do not restrict commercial delivery',async()=>{
  for(const uf of ['SP','SC','MG','RJ']) {
    const proof=await verifyCandidate(
      {website:url},
      {
        fetchPage:async()=>page,
        lookup:async()=>({...record,data:{...record.data,uf}})
      }
    );
    assert.equal(proof.registry.uf,uf);
  }
  for(const uf of [undefined,'']) {
    await assert.rejects(
      verifyCandidate({website:url},{
        fetchPage:async()=>page,
        lookup:async()=>({...record,data:{...record.data,uf}})
      }),
      /registry_state_inconclusive/
    );
  }
});
