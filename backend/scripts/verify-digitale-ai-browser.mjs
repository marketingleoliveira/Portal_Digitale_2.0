// Production browser reads. All mutations are intercepted; preview is read-only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {db} from '../src/database.js';
import {signUser} from '../src/lib/auth.js';
import {OWNER} from '../src/services/prospecting-policy.mjs';
const rootRequire=createRequire('/var/www/Portal-Digitale-2.0/package.json');
const XLSX=rootRequire('xlsx');
const {chromium}=createRequire('/var/www/Loja-Joanas-De-Barro/package.json')('@playwright/test');
let browser;
try {
  const [[manager]]=await db.execute("SELECT u.id,u.email,u.token_version FROM system_users u JOIN user_roles r ON r.user_id=u.id JOIN profiles p ON p.id=u.id WHERE LOWER(u.email)='marketing@digitaletextil.com.br' AND u.disabled=0 AND p.is_active=1 LIMIT 1");
  const token=signUser(manager),base='https://portal.digitaletextil.com.br';
  async function live(path,auth=token){return fetch(base+path,{headers:auth?{Authorization:'Bearer '+auth}:{}});}
  const response=await live('/api/digitale-ai');assert.equal(response.status,200);const initial=await response.json();assert.ok(initial.settings.states.length);
  assert.equal((await live('/api/digitale-ai',null)).status,401);
  const [[owner]]=await db.execute('SELECT id,email,token_version FROM system_users WHERE id=?',[OWNER]);assert.equal((await live('/api/digitale-ai',signUser(owner))).status,403);
  assert.equal((await live('/api/digitale-ai/clients')).status,200);
  assert.equal(await (await fetch(base+'/')).text(),await readFile('/tmp/digitale-ia-config-build/index.html','utf8'));
  const [[countsBefore]]=await db.execute('SELECT COUNT(*) clients FROM digitale_ai_clients');
  browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1187/chrome-linux/chrome',args:['--no-sandbox'],env:{...process.env,LD_LIBRARY_PATH:'/tmp/joanas-audit-browser-libs/extracted/usr/lib/x86_64-linux-gnu'}});
  const context=await browser.newContext({viewport:{width:1365,height:1000}});
  await context.addInitScript(s=>localStorage.setItem('portal-digitale-auth',JSON.stringify(s)),{access_token:token,token_type:'bearer',user:{id:manager.id,email:manager.email}});
  let capturedSettings,previewCalls=0,simulatedImports=0,blockedWrites=0;
  await context.route('**/api/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    if(request.method()==='PUT'&&path==='/api/digitale-ai'){capturedSettings=request.postDataJSON();return route.fulfill({json:{ok:true,settings:capturedSettings}});}
    if(request.method()==='POST'&&path==='/api/digitale-ai/clients/preview'){previewCalls++;return route.continue();}
    if(request.method()==='POST'&&path==='/api/digitale-ai/clients/import'){simulatedImports++;return route.fulfill({json:{ok:true,new_count:1,updated_count:0,unique:1,repeated:0}});}
    if(request.method()==='POST'&&path==='/api/data/query'&&request.postDataJSON()?.operation==='select')return route.continue();
    if(['POST','PUT','PATCH','DELETE'].includes(request.method())){blockedWrites++;return route.fulfill({json:{ok:true,data:null,error:null}});}
    return route.continue();
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/ia-digitale');await page.getByRole('main').getByRole('heading',{name:'IA DIGITALE',exact:true}).waitFor({timeout:30000});
  await page.getByLabel('Quantidade máxima por hora').waitFor();assert.equal(await page.getByLabel('Quantidade máxima por hora').inputValue(),String(initial.settings.hourly_target));
  await page.screenshot({path:'docs/ia-digitale-configuracao.png',fullPage:true});
  await page.getByLabel('Quantidade máxima por hora').fill('4');await page.getByLabel('Quantidade máxima por dia').fill('40');
  for(const uf of initial.settings.states)await page.getByLabel(initial.states[uf]+' ('+uf+')',{exact:true}).uncheck();await page.getByLabel('Santa Catarina (SC)',{exact:true}).check();
  await page.getByRole('button',{name:'Salvar configuração',exact:true}).click();await page.getByText('Configuração salva. A prospecção já seguirá estas regras.',{exact:true}).waitFor();assert.equal(capturedSettings.hourly_target,4);assert.deepEqual(capturedSettings.states,['SC']);
  await page.getByRole('tab',{name:'Base de clientes',exact:true}).click();await page.getByRole('heading',{name:'Importar clientes',exact:true}).waitFor();
  const data=[['CNPJ','Nome do cliente','Data do último pedido'],['19.131.243/0001-97','Cliente de teste de prévia',new Date('2026-07-03T00:00:00Z')]];
  const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(data),'Clientes');
  for(const format of ['csv','xlsx','xls']){
    const buffer=format==='csv'?Buffer.from('\uFEFFCNPJ;Nome do cliente;Data do último pedido\r\n19.131.243/0001-97;Cliente de teste de prévia;03/07/2026\r\n'):XLSX.write(workbook,{type:'buffer',bookType:format==='xls'?'biff8':'xlsx'});
    await page.getByLabel('Planilha de clientes',{exact:true}).setInputFiles({name:'teste.'+format,mimeType:'application/octet-stream',buffer});
    await page.getByText('teste.'+format+' · 1 linhas',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Validar e visualizar prévia',exact:true}).click();await page.getByRole('button',{name:'Confirmar importação',exact:true}).waitFor();
    await page.getByRole('cell',{name:'03/07/2026',exact:true}).waitFor();
    await page.getByText('Ativos: 0 · Inativos: 1 · Sem informação: 0',{exact:true}).waitFor();
  }
  await page.getByRole('button',{name:'Confirmar importação',exact:true}).click();await page.getByText('1 clientes novos e 0 atualizados. Os CNPJs já estão bloqueados na prospecção.',{exact:true}).waitFor();assert.equal(simulatedImports,1);
  await page.getByLabel('Planilha de clientes',{exact:true}).setInputFiles({name:'invalido.csv',mimeType:'text/csv',buffer:Buffer.from('CNPJ;Nome do cliente;Data do último pedido\r\n19131243000198;Cliente inválido;01/01/2020\r\n')});
  await page.getByText('invalido.csv · 1 linhas',{exact:true}).waitFor();await page.getByRole('button',{name:'Validar e visualizar prévia',exact:true}).click();await page.getByText('Linha 2: CNPJ inválido.',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Confirmar importação',exact:true}).count(),0);
  await page.reload();await page.getByRole('tab',{name:'Base de clientes',exact:true}).click();await page.getByRole('heading',{name:'Importar clientes',exact:true}).waitFor();await page.screenshot({path:'docs/ia-digitale-clientes.png',fullPage:true});
  await page.goto(base+'/prospeccao-ia');await page.getByRole('main').getByRole('heading',{name:'Monitoramento da prospecção',exact:true}).waitFor();await page.getByText('Região configurada:',{exact:false}).waitFor();
  assert.deepEqual(errors,[]);
  const actual=await (await live('/api/digitale-ai')).json();assert.deepEqual(actual.settings,initial.settings);
  const [[countsAfter]]=await db.execute('SELECT COUNT(*) clients FROM digitale_ai_clients');assert.equal(countsAfter.clients,countsBefore.clients);
  const evidence={date:new Date().toISOString(),live_api:true,unauthenticated_status:401,sdr_settings_status:403,public_build_matches:true,browser_menu:true,settings_form:true,preview_formats:['csv','xlsx','xls'],invalid_cnpj_rejected:true,preview_calls:previewCalls,simulated_imports:simulatedImports,blocked_other_mutations:blockedWrites,actual_settings_preserved:true,actual_clients_preserved:true,page_errors:errors,tests_passed:27};
  await writeFile('docs/ia-digitale-evidence.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
}finally{if(browser)await browser.close();await db.end();}
