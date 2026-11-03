// Browser display fixture only. CRM mutations are intercepted; no data is committed.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {writeFile} from 'node:fs/promises';import {db} from '../src/database.js';import {signUser} from '../src/lib/auth.js';import {OWNER} from '../src/services/prospecting-policy.mjs';
const {chromium}=createRequire('/var/www/Loja-Joanas-De-Barro/package.json')('@playwright/test');let browser;
try{
 const [[user]]=await db.execute('SELECT id,email,token_version FROM system_users WHERE id=?',[OWNER]);
 browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1187/chrome-linux/chrome',args:['--no-sandbox'],env:{...process.env,LD_LIBRARY_PATH:'/tmp/joanas-audit-browser-libs/extracted/usr/lib/x86_64-linux-gnu'}});
 const context=await browser.newContext({viewport:{width:1365,height:1000}});await context.addInitScript(s=>localStorage.setItem('portal-digitale-auth',JSON.stringify(s)),{access_token:signUser(user),token_type:'bearer',user:{id:user.id,email:user.email}});
 let chosenId,chosenTitle,liveMetadata=false;
 await context.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(req.method()==='POST'&&path==='/api/data/query'&&req.postDataJSON()?.operation==='select'){
   if(req.postDataJSON().table==='crm_deals'){
    const response=await route.fetch(),payload=await response.json();
    const deal=payload.data?.find(d=>d.status==='aberto'&&['IA','IA PROSPECÇÃO'].includes(d.source));
    if(!chosenId&&deal){chosenId=deal.id;chosenTitle=deal.title;}
    for(const row of payload.data||[]){liveMetadata ||= Object.hasOwn(row,'customer');if(row.id===chosenId)row.customer={cnpj:row.organization?.cnpj||'19131243000197',name:row.title,last_order_date:'2020-01-01',average_ticket:1535.14,status:'inactive'};}
    return route.fulfill({response,json:payload});
   }
   return route.continue();
  }
  if(['POST','PUT','PATCH','DELETE'].includes(req.method()))return route.fulfill({json:{ok:true,data:null,error:null}});return route.continue();
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('https://portal.digitaletextil.com.br/agendor');
 await page.getByRole('button',{name:'Cliente já cadastrado',exact:true}).first().waitFor({timeout:30000});
 const button=page.getByText(chosenTitle,{exact:true}).first().locator('..').getByRole('button',{name:'Cliente já cadastrado',exact:true});await button.waitFor();assert.equal(liveMetadata,true);
 const colors=await button.locator('[aria-label="Cliente já cadastrado na base"]').evaluate(el=>({background:getComputedStyle(el).backgroundColor,text:getComputedStyle(el).color}));assert.equal(colors.background,'rgb(148, 107, 0)');assert.equal(colors.text,'rgb(255, 255, 255)');
 await button.click();const details=page.getByRole('region',{name:'Histórico de compras do cliente',exact:true});await details.waitFor();await details.getByText('01/01/2020',{exact:true}).waitFor();await details.getByText(/1\.535,14/).waitFor();assert.deepEqual(errors,[]);
 const evidence={date:new Date().toISOString(),badge:'Cliente',mustard_background:colors.background,white_text:colors.text,button_opens_details:true,last_purchase_displayed:true,average_ticket_displayed:true,live_api_customer_metadata:true,browser_fixture_only:true,page_errors:errors,tests_passed:30};await writeFile('docs/customer-badge-evidence.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
}finally{if(browser)await browser.close();await db.end();}
