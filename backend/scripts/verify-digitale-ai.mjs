// Exercises the real routes and SQL inside one transaction, rolled back at the end.
// No fixture customers, settings changes or import records are committed.
import assert from 'node:assert/strict';
import express from 'express';
import {db} from '../src/database.js';
import router from '../src/routes/digitale-ai.js';
import {signUser} from '../src/lib/auth.js';
import {DEFAULT_SETTINGS} from '../src/services/digitale-ai-settings.mjs';
import {duplicate} from '../src/services/prospecting-auto-delivery.mjs';
const connection=await db.getConnection(),originalExecute=db.execute.bind(db),originalGet=db.getConnection.bind(db);
let server;
try {
  await connection.beginTransaction();
  db.execute=(...args)=>connection.execute(...args);
  db.getConnection=async()=>({execute:(...args)=>connection.execute(...args),query:(...args)=>connection.query(...args),beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{}});
  const [[manager]]=await connection.execute("SELECT u.id,u.email,u.token_version FROM system_users u JOIN user_roles r ON r.user_id=u.id JOIN profiles p ON p.id=u.id WHERE LOWER(u.email)='marketing@digitaletextil.com.br' AND u.disabled=0 AND p.is_active=1 LIMIT 1");
  assert.ok(manager,'Active manager account required for authorization test');
  const app=express();app.use(express.json());app.use('/api/digitale-ai',router);app.use((error,req,res,next)=>res.status(500).json({error:error.message}));
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base=`http://127.0.0.1:${server.address().port}/api/digitale-ai`,token=signUser(manager);
  async function call(path='',method='GET',body,authorized=true){const response=await fetch(base+path,{method,headers:{...(authorized?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};}
  assert.equal((await call('','GET',undefined,false)).status,401);
  assert.equal((await call('')).status,200);
  assert.equal((await call('','PUT',{...DEFAULT_SETTINGS,states:[]})).status,422);
  const changed=await call('','PUT',{...DEFAULT_SETTINGS,hourly_target:4,daily_target:40,inactivity_months:6,states:['SC'],enabled:false});assert.equal(changed.status,200);assert.equal((await call('')).data.settings.inactivity_months,6);assert.equal((await call('/clients')).data.inactivity_months,6);assert.equal((await call('')).data.settings.enabled,false);assert.deepEqual((await call('')).data.settings.states,['SC']);
  const cnpj='19131243000197';const rows=[{cnpj,name:'Cliente temporário de validação',last_order_date:'2020-01-01',average_ticket:'1.535,14'}];
  const preview=await call('/clients/preview','POST',{rows});assert.equal(preview.status,200);assert.equal(preview.data.error_count,0);assert.equal(preview.data.statuses.inactive,1);
  assert.equal((await call('/clients/import','POST',{filename:'teste.csv',rows:[{...rows[0],cnpj:'19131243000198'}]})).status,422);
  const [[before]]=await connection.execute('SELECT COUNT(*) total FROM digitale_ai_client_imports');
  assert.equal((await call('/clients/import','POST',{filename:'teste-transacional.csv',rows})).status,200);
  assert.equal(await duplicate(connection,{cnpj}),'customer_base');
  const inactive=await call('/clients?q='+cnpj+'&status=inactive');assert.equal(inactive.status,200);assert.equal(inactive.data.clients[0].status,'inactive');assert.equal(Number(inactive.data.clients[0].average_ticket),1535.14);
  assert.equal((await call('/clients?q='+encodeURIComponent('19.131.243/0001-97'))).data.clients[0].cnpj,cnpj);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  assert.equal((await call('/clients/import','POST',{filename:'teste-transacional.csv',rows:[{...rows[0],last_order_date:today}]})).status,200);
  assert.equal((await call('/clients?q='+cnpj+'&status=active')).data.clients[0].status,'active');
  await call('/clients/import','POST',{filename:'teste-transacional.csv',rows});
  assert.equal((await call('/clients?q='+cnpj)).data.clients[0].last_order_date,today);
  await call('/clients/import','POST',{filename:'teste-transacional.csv',rows:[{...rows[0],last_order_date:null}]});
  assert.equal((await call('/clients?q='+cnpj)).data.clients[0].last_order_date,today);
  assert.equal((await call('/clients?page=2')).status,200);
  const [[after]]=await connection.execute('SELECT COUNT(*) total FROM digitale_ai_client_imports');assert.equal(after.total-before.total,4);
  console.log(JSON.stringify({authorization:true,settings_save_read:true,invalid_import_rejected:true,preview:true,import:true,customer_block:true,inactive_classification:true,new_order_reactivates:true,older_or_blank_order_preserves_latest:true,pagination:true,fixture_writes:'rolled_back'}));
}finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  db.execute=originalExecute;db.getConnection=originalGet;
  await connection.rollback();connection.release();await db.end();
}
