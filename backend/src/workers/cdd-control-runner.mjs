import {spawnSync} from 'node:child_process';
import {db} from '/var/www/Portal-Digitale-2.0/backend/src/database.js';
try{
 const [rows]=await db.execute('SELECT enabled FROM digitale_casa_control WHERE id=1');
 if(!rows[0]?.enabled){console.log('CDD_RUNNER_PAUSED');process.exitCode=0;}
 else{
  const [u]=await db.execute('SELECT requests,requests_date,balance_total,last_status FROM digitale_casa_usage WHERE id=1');
  const [d]=await db.execute("SELECT DATE(UTC_TIMESTAMP()-INTERVAL 3 HOUR) AS today,DAYOFWEEK(UTC_TIMESTAMP()-INTERVAL 3 HOUR) AS dow");
  const [count]=await db.execute("SELECT COUNT(*) AS n FROM digitale_casa_prospects WHERE DATE(discovered_at - INTERVAL 3 HOUR)=DATE(UTC_TIMESTAMP()-INTERVAL 3 HOUR)");
  const [week]=await db.execute("SELECT COUNT(*) AS n FROM digitale_casa_prospects WHERE DATE(discovered_at - INTERVAL 3 HOUR)>=DATE(UTC_TIMESTAMP()-INTERVAL 3 HOUR)-INTERVAL WEEKDAY(UTC_TIMESTAMP()-INTERVAL 3 HOUR) DAY");
  const day=String(d[0].today).slice(0,10);
  const used=u.length&&u[0].requests_date&&new Date(u[0].requests_date).toISOString().slice(0,10)===day&&Number(u[0].requests)>=1;
  await db.execute('UPDATE digitale_casa_control SET last_tick_at=UTC_TIMESTAMP(6) WHERE id=1');
  if(used)console.log('CDD_RUNNER_DAILY_LIMIT');
  else if([1,7].includes(Number(d[0].dow)))console.log('CDD_RUNNER_WEEKEND');
  else if(Number(count[0].n)>=100||Number(week[0].n)>=500)console.log('CDD_RUNNER_TARGET_REACHED');
  else if(u[0].balance_total!==null&&Number(u[0].balance_total)<30)console.log('CDD_RUNNER_INSUFFICIENT_BALANCE');
  else {
   console.log('CDD_RUNNER_STARTING_REAL_API_CHECK');
   const r=spawnSync('/usr/bin/node',['/var/www/Portal-Digitale-2.0/backend/src/workers/cdd-leads-worker.mjs'],{
    env:{...process.env,CDD_ALLOW_ONE_SEARCH:'1'},encoding:'utf8',timeout:65000});
   const out=String(r.stdout||'').split('\n').filter(x=>x.startsWith('CDD_')).slice(-12);
   for(const line of out)console.log(line);
   if(r.error)console.log('CDD_RUNNER_EXEC_ERROR '+(r.error.code||'unknown'));
   if(r.status!==0)console.log('CDD_RUNNER_WORKER_EXIT '+r.status);
  }
 }
}catch(e){console.log('CDD_RUNNER_ERROR '+String(e.code||e.name));process.exitCode=1;}
finally{await db.end();}
