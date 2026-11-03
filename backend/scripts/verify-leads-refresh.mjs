// Read-only browser verification. Mutating API requests are intercepted locally.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {db} from '../src/database.js';
import {OWNER} from '../src/services/prospecting-policy.mjs';
import {signUser} from '../src/lib/auth.js';
const require=createRequire('/var/www/Loja-Joanas-De-Barro/package.json');
const {chromium}=require('@playwright/test');
let browser;
try {
  const [[account]]=await db.execute('SELECT id,email,token_version FROM system_users WHERE id=?',[OWNER]);
  const session={access_token:signUser(account),token_type:'bearer',user:{id:account.id,email:account.email}};
  browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1187/chrome-linux/chrome',args:['--no-sandbox'],env:{...process.env,LD_LIBRARY_PATH:'/tmp/joanas-audit-browser-libs/extracted/usr/lib/x86_64-linux-gnu'}});
  const context=await browser.newContext({viewport:{width:1365,height:900}});
  await context.addInitScript(session=>localStorage.setItem('portal-digitale-auth',JSON.stringify(session)),session);
  let reads=0,lastAi=0,blockedWrites=0,failQueries=false;
  await context.route('**/api/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    if(request.method()==='POST'&&path==='/api/data/query') {
      const body=request.postDataJSON();
      if(body.operation==='select') {
        if(body.table==='crm_deals') {
          if(failQueries)return route.fulfill({status:503,json:{error:{message:'Falha simulada de consulta'}}});
          const response=await route.fetch(),payload=await response.json();
          reads++;lastAi=(payload.data||[]).filter(row=>['IA','IA PROSPECCAO'].includes(String(row.source||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase())).length;
          return route.fulfill({response,json:payload});
        }
        return route.continue();
      }
    }
    if(['POST','PATCH','PUT','DELETE'].includes(request.method())){blockedWrites++;return route.fulfill({json:{ok:true,data:null,error:null}});}
    return route.continue();
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://portal.digitaletextil.com.br/agendor');
  await page.getByText('Atualização automática a cada 30 segundos.',{exact:false}).waitFor({timeout:30000});
  await page.getByRole('button',{name:'Atualizar leads',exact:true}).waitFor();
  const initialReads=reads;
  await page.waitForTimeout(32000);
  assert.ok(reads>initialReads,'Automatic refresh must fetch new data without a websocket write');
  const beforeClick=reads;
  await page.getByRole('button',{name:'Atualizar leads',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('button')?.textContent?.includes('Atualizando'));
  await page.getByRole('button',{name:'Atualizar leads',exact:true}).waitFor();
  assert.ok(reads>beforeClick,'Manual refresh must fetch current CRM');
  const aiCard=page.getByText('Leads da IA',{exact:true}).locator('..');
  assert.equal(Number(await aiCard.locator('p').nth(1).innerText()),lastAi);
  assert.ok(lastAi>116,'Actual verified deliveries must be visible to Nicolle');
  await page.screenshot({path:'docs/leads-retomada-agendor.png',fullPage:false});
  await page.goto('https://portal.digitaletextil.com.br/prospeccao-ia');
  await page.getByText('Externos disponíveis no CRM',{exact:true}).waitFor();
  await page.screenshot({path:'docs/leads-retomada-prospeccao.png',fullPage:false});
  assert.deepEqual(errors,[]);
  await writeFile('docs/leads-retomada-browser.json',JSON.stringify({date:new Date().toISOString(),automatic_refresh:true,manual_refresh:true,crm_reads:reads,ai_visible:lastAi,mutating_requests_blocked:blockedWrites,page_errors:errors},null,2)+'\n');
  console.log(JSON.stringify({automatic_refresh:true,manual_refresh:true,ai_visible:lastAi,page_errors:errors}));
}finally{if(browser)await browser.close();await db.end();}
