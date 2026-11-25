// DIGITALE_DISCOVERY_SERVICE_V1 — pesquisa independente da validacao e entrega.
// Sem envios de e-mail, sem abordagem de clientes e sem aprovacao automatica.
import {db} from '/var/www/Portal-Digitale-2.0/backend/src/database.js';
import {getSettings} from '/var/www/Portal-Digitale-2.0/backend/src/services/digitale-ai-settings.mjs';
import {discoverCandidates} from '/var/www/Portal-Digitale-2.0/backend/src/services/prospecting-discovery.mjs';
import crypto from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
let stopping=false;
process.on('SIGTERM',()=>stopping=true);
process.on('SIGINT',()=>stopping=true);
const reason=e=>String(e?.message||e||'erro').replace(/[^a-z0-9_]/gi,'_').slice(0,130);
let connection;
try{
  connection=await db.getConnection();
  const [[lease]]=await connection.query("SELECT GET_LOCK('digitale:prospecting-discovery',0) acquired");
  if(Number(lease.acquired)!==1)throw Error('discovery_worker_already_running');
  console.log(JSON.stringify({event:'discovery_worker_started',version:'1',parallelToValidation:true}));
  while(!stopping){
    try{
      const settings=await getSettings(db);
      if(!settings.enabled){await delay(15000);continue;}
      const [[runtime]]=await db.execute('SELECT query_cursor,provider_retry_at FROM prospecting_auto_runtime WHERE id=1');
      if(!runtime){await delay(30000);continue;}
      // A espera do worker antigo nao deve paralisar esta fila independente.
      // O proprio worker aqui aplica pausa em falhas consecutivas.

      const [[queue]]=await db.execute("SELECT SUM(status='discovered') AS new_candidates FROM prospecting_auto_candidates");
      // Backpressure: descobrir continuamente, sem soterrar a verificacao.
      if(Number(queue?.new_candidates||0)>=120){await delay(15000);continue;}
      const cursor=Number(runtime.query_cursor||0);
      const id=crypto.randomUUID();
      await db.execute('INSERT INTO prospecting_auto_runs(id) VALUES(?)',[id]);
      try{
        const result=await discoverCandidates(db,cursor,{settings});
        await db.execute("UPDATE prospecting_auto_runtime SET query_cursor=?,provider_failures=0,provider_retry_at=NULL WHERE id=1",[cursor+1]);
        await db.execute("UPDATE prospecting_auto_runs SET finished_at=UTC_TIMESTAMP(6),status='completed',found=?,error=? WHERE id=?",[result.found,(result.degraded.length?'search_degraded_'+result.degraded.join('_'):null),id]);
        console.log(JSON.stringify({event:'discovery_cycle',cursor,found:result.found,recovered:result.recovered,received:result.received,checked:result.checked,rejected:result.rejected,engine:result.plan.engines,degraded:result.degraded}));
      }catch(e){
        const [[current]]=await db.execute('SELECT provider_failures FROM prospecting_auto_runtime WHERE id=1');
        const failures=Number(current?.provider_failures||0)+1;
        const seconds=Math.min(300,15*2**Math.min(failures,5));
        await db.execute('UPDATE prospecting_auto_runtime SET query_cursor=?,provider_failures=?,provider_retry_at=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND) WHERE id=1',[cursor+1,failures,seconds]);
        await db.execute("UPDATE prospecting_auto_runs SET finished_at=UTC_TIMESTAMP(6),status='error',error=? WHERE id=?",[reason(e),id]);
        console.error(JSON.stringify({event:'discovery_cycle_error',cursor,reason:reason(e),backoffSeconds:seconds}));
        if(!stopping)await delay(Math.min(seconds,30000));
      }
    }catch(e){
      console.error(JSON.stringify({event:'discovery_control_error',reason:reason(e)}));
    }
    // DIGITALE_SEARCH_UNBLOCK_2511 — intervalo controlado entre consultas.
    if(!stopping)await delay(10000);
  }
}catch(e){console.error(JSON.stringify({event:'discovery_worker_fatal',reason:reason(e)}));process.exitCode=1}
finally{
  try{if(connection){await connection.query("SELECT RELEASE_LOCK('digitale:prospecting-discovery')");connection.release()}}catch{}
  await db.end();
}
