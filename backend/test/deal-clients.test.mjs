import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAverageTicket,validateClientRows} from '../src/services/digitale-ai-clients.mjs';
import {dealCnpj,enrichDealClients} from '../src/services/deal-clients.mjs';
const cnpj='19131243000197';
test('Brazilian ticket values, Excel numbers, zeros and missing values',()=>{
 assert.equal(parseAverageTicket('1.535,14'),1535.14);assert.equal(parseAverageTicket('R$ 1.535,14'),1535.14);assert.equal(parseAverageTicket(1535.145),1535.15);assert.equal(parseAverageTicket('0,00'),0);assert.equal(parseAverageTicket(''),null);assert.throws(()=>parseAverageTicket('-10'));assert.throws(()=>parseAverageTicket('abc'));
 const plan=validateClientRows([{cnpj,name:'Fixture',last_order_date:'2020-01-01',average_ticket:'1.535,14'}]);assert.equal(plan.rows[0].average_ticket,1535.14);
});
test('existing deals match customers by normalized CNPJ without changing source',async()=>{
 const deals=[{id:'a',source:'IA PROSPECÇÃO',organization:{cnpj:'19.131.243/0001-97'}},{id:'b',source:'SITE',description:'CNPJ: 19131243000197'},{id:'c',source:'IA',organization:{cnpj:'00000000000000'}}];
 const connection={execute:async sql=>[sql.includes('digitale_ai_settings')?[]:sql.includes('FROM digitale_ai_clients')?[{cnpj,name:'Cliente',last_order_date:'2020-01-01',average_ticket:'1535.14'}]:[]]};
 const result=await enrichDealClients(connection,deals);assert.equal(result[0].customer.average_ticket,1535.14);assert.equal(result[1].customer.last_order_date,'2020-01-01');assert.equal(result[2].customer,null);assert.equal(result[0].source,'IA PROSPECÇÃO');assert.equal(result[1].source,'SITE');assert.equal(dealCnpj(deals[1]),cnpj);
});
test('linked lead CNPJ is resolved when organization and description have no document',async()=>{
 const connection={execute:async sql=>[sql.includes('digitale_ai_settings')?[]:sql.includes('FROM crm_deals')?[{id:'a',lead_cnpj:cnpj}]:[{cnpj,name:'Cliente',last_order_date:null,average_ticket:null}]]};
 const result=await enrichDealClients(connection,[{id:'a',source:'IA'}]);assert.equal(result[0].customer.cnpj,cnpj);assert.equal(result[0].customer.average_ticket,null);
});

test('CRM customer status uses the configured period',async()=>{
 const {DEFAULT_SETTINGS}=await import('../src/services/digitale-ai-settings.mjs');
 const {inactivityCutoff}=await import('../src/services/digitale-ai-clients.mjs');
 const last_order_date=inactivityCutoff(new Date(),4);
 const connection={execute:async sql=>[sql.includes('digitale_ai_settings')?[{settings:{...DEFAULT_SETTINGS,inactivity_months:6}}]:[{cnpj,name:'Cliente',last_order_date,average_ticket:100}]]};
 const result=await enrichDealClients(connection,[{id:'a',organization:{cnpj}}]);assert.equal(result[0].customer.status,'active');
});
