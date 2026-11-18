import test from 'node:test';
import assert from 'node:assert/strict';
import {hasConfeccaoLegalName,evaluateApproval} from '../src/services/prospecting-approval-policy.mjs';
import {verifyCandidate} from '../src/services/prospecting-auto-verification.mjs';
import {approveOnlyIA} from '../src/services/prospecting-ia-approved.mjs';
import {DEFAULT_SETTINGS} from '../src/services/digitale-ai-settings.mjs';
const settings={...DEFAULT_SETTINGS,states:['SP'],cnaes:['1412601']};
const cnpj='19131243000197';
const company={cnpj,phone:'11998765432',razao_social:'ACME CONFECÇÕES LTDA',cnae:'6201501',mei:false,situacao_cadastral:2};
test('recognizes legal-name variants as whole words only',()=>{
 for(const name of ['CONFECÇÃO LTDA','ACME CONFECÇÕES LTDA','Acme Confeccoes Ltda','Acme Confeccao'])assert.equal(hasConfeccaoLegalName(name),true);
 for(const name of ['',null,'Acme Moda','Confeccionado Ltda','Preconfeccao'])assert.equal(hasConfeccaoLegalName(name),false);
});
test('legal name replaces CNAE, while active CNPJ, phone and non-MEI remain required',()=>{
 assert.equal(evaluateApproval(company).approval_basis,'legal_name_confeccao');
 for(const change of [{cnpj:'11111111111111'},{phone:''},{mei:true},{mei:null},{situacao_cadastral:8},{razao_social:'ACME MODA'}])assert.equal(evaluateApproval({...company,...change}).approved,false);
 assert.equal(evaluateApproval({...company,razao_social:'ACME MODA',cnae:'1412601'}).approved,true);
 assert.equal(evaluateApproval({...company,razao_social:'ACME MODA',nome_fantasia:'CONFECÇÕES'}).approved,false);
});
const lookup=async()=>({url:'https://registry.example/'+cnpj,data:{cnpj,razao_social:company.razao_social,situacao_cadastral:2,cnae_fiscal:6201501,mei_status:false,uf:'SP'}});
const fetchPage=async url=>({url,body:url.endsWith('robots.txt')?'User-agent: *\nAllow: /':'<title>ACME</title> CNPJ 19.131.243/0001-97 Telefone (11) 99876-5432'});
test('verified legal name replaces site manufacturing evidence and reaches approved queue',async()=>{
 const proof=await verifyCandidate({website:'https://example.com/'},{settings,fetchPage,lookup});
 assert.equal(proof.approval_basis,'legal_name_confeccao');
 assert.equal(proof.registry.manufacturing,false);
 assert.equal(proof.registry.situacao_cadastral,2);
 const writes=[];
 const db={execute:async(sql,args)=>{
  if(sql.includes('SELECT settings'))return [[{settings}]];
  if(sql.startsWith('SELECT'))return [[]];
  writes.push({sql,args});return [{affectedRows:1}];
 }};
 const result=await approveOnlyIA(db,proof,'fixture-id');
 assert.equal(result.approved,true);assert.equal(writes.length,1);
 assert.ok(writes[0].sql.includes('ia_digitale_approved_v2'));
 assert.equal(result.sent_to_crm,false);assert.equal(result.sent_to_nicolle,false);
 const out=await approveOnlyIA(db,{...proof,registry:{...proof.registry,uf:'MG'}},'fixture-id');
 assert.equal(out.reason,'outside_target_state');assert.equal(writes.length,1);
 await assert.rejects(verifyCandidate({website:'https://example.com/'},{settings,fetchPage,lookup:async()=>{const r=await lookup();r.data.uf='MG';return r;}}),/outside_target_state/);
});
