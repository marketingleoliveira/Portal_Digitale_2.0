import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {db} from '../src/database.js';
import {signUser} from '../src/lib/auth.js';
const {chromium}=createRequire('/var/www/Loja-Joanas-De-Barro/package.json')('@playwright/test');
let browser;
try{
 const [[user]]=await db.execute("SELECT id,email,token_version FROM system_users WHERE LOWER(email)='marketing@digitaletextil.com.br'");
 const [[before]]=await db.execute('SELECT COUNT(*) total FROM digitale_ai_clients');
 browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1187/chrome-linux/chrome',args:['--no-sandbox'],env:{...process.env,LD_LIBRARY_PATH:'/tmp/joanas-audit-browser-libs/extracted/usr/lib/x86_64-linux-gnu'}});
 const context=await browser.newContext({viewport:{width:1365,height:1000}});
 await context.addInitScript(s=>localStorage.setItem('portal-digitale-auth',JSON.stringify(s)),{access_token:signUser(user),token_type:'bearer',user:{id:user.id,email:user.email}});
 let invalid,valid,previewCount=0;
 await context.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(req.method()==='POST'&&path==='/api/digitale-ai/clients/preview'){
   const response=await route.fetch(),result=await response.json();previewCount++;
   if(result.error_count)invalid=result;else valid=result;
   return route.fulfill({response,json:result});
  }
  if(req.method()==='POST'&&path==='/api/data/query'&&req.postDataJSON()?.operation==='select')return route.continue();
  if(['POST','PUT','PATCH','DELETE'].includes(req.method()))return route.fulfill({json:{ok:true,data:null,error:null}});
  return route.continue();
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://portal.digitaletextil.com.br/ia-digitale');await page.getByRole('tab',{name:'Base de clientes',exact:true}).click();
 await page.getByLabel('Planilha de clientes',{exact:true}).setInputFiles('/var/www/Loja-Joanas-De-Barro/auditoria/2026-10-13/relatorio_empresa.xls');
 await page.getByText('relatorio_empresa.xls · 3425 linhas',{exact:true}).waitFor({timeout:30000});
 assert.equal(await page.locator('#map-cnpj').inputValue(),'1');assert.equal(await page.locator('#map-name').inputValue(),'0');assert.equal(await page.locator('#map-date').inputValue(),'11');
 await page.getByRole('button',{name:'Validar e visualizar prévia',exact:true}).click();
 await page.getByRole('button',{name:'Excluir linhas inválidas e revisar prévia',exact:true}).waitFor({timeout:30000});
 assert.equal(invalid.error_count,1);assert.equal(invalid.repeated,3);
 await page.getByText('Excluídos da seleção: 769 clientes com CPF e 31 linhas sem documento.',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Excluir linhas inválidas e revisar prévia',exact:true}).click();
 await page.getByRole('button',{name:'Confirmar importação',exact:true}).waitFor({timeout:30000});assert.equal(valid.unique,2621);assert.equal(valid.error_count,0);
 assert.ok(valid.sample.every(r=>!/[\ufffd]|&[a-zA-Z]+;/.test(r.name)));
 assert.deepEqual(errors,[]);const [[after]]=await db.execute('SELECT COUNT(*) total FROM digitale_ai_clients');assert.equal(after.total,before.total);
 const evidence={date:new Date().toISOString(),filename:'relatorio_empresa.xls',format:'HTML Windows-1252 with XLS extension',automatic_mapping:{name:'Nome Fantasia',cnpj:'CNPJ/CPF',last_order_date:'Última Compra'},source_rows:3425,cpf_excluded:769,empty_documents:31,invalid_cnpj:1,repeated_rows:3,ready_unique_cnpjs:valid.unique,statuses:valid.statuses,previews:previewCount,client_database_unchanged:true,page_errors:errors};
 await writeFile('docs/client-report-format-evidence.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
}finally{if(browser)await browser.close();await db.end();}
