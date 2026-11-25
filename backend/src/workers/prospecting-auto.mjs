import {isOutsideProfileCnpj} from '../services/prospecting-lost-filter.mjs';
import {getSettings} from '../services/digitale-ai-settings.mjs';
import {refreshClientStatuses} from '../services/digitale-ai-clients.mjs';
import crypto from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {db} from '../database.js';
import {windowAt,nextRun,sqlDate,quota} from '../services/prospecting-policy.mjs';
import {verifyCandidate,domainOf,excludedDomain} from '../services/prospecting-auto-verification.mjs';
import {deliverVerified,counts,deliveryQuota} from '../services/prospecting-auto-delivery.mjs';
import {discoverCandidates} from '../services/prospecting-discovery.mjs';
import {approveOnlyIA} from '../services/prospecting-ia-approved.mjs';
import {storeProspectingEmails} from '../services/prospecting-email-contacts.mjs';
import {verificationReporter} from '../services/prospecting-telemetry.mjs';
import {observeCommercialProfile} from '../services/prospecting-commercial-observer-v2.mjs';
let stopping=false;
let monitorCleanupDate='';
process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
const safeReason = e => /^[a-z_0-9]+$/i.test(e.message)?e.message.slice(0,191):'provider_or_database_failure';
async function discover(cursor,runId) {
 const settings=await getSettings(db);
 if(!settings.enabled)return 0;
 const result=await discoverCandidates(db,cursor,{settings});
 if(result.degraded.length)await db.execute('UPDATE prospecting_auto_runs SET error=? WHERE id=?',[('search_degraded_'+result.degraded.join('_')).slice(0,191),runId]);
 console.log(JSON.stringify({event:'discovery_completed',cursor,page:result.plan.pageno,received:result.received,checked:result.checked,rejected_sources:result.rejected,found:result.found,recovered:result.recovered||0,degraded:result.degraded}));
 await db.execute('UPDATE prospecting_auto_runtime SET heartbeat_at=UTC_TIMESTAMP(6),query_cursor=? WHERE id=1',[cursor+1]);
 return result.found;
}
async function cycle() {
  const id=crypto.randomUUID();
  await db.execute('INSERT INTO prospecting_auto_runs(id) VALUES(?)',[id]);
  let found=0,delivered=0,approved=0;
  const [batchRows]=await db.execute("SELECT id,target FROM prospecting_external_batches WHERE status='running' ORDER BY created_at LIMIT 1");
  const externalBatchId=batchRows[0]?.id||null;
  try {
    const [[runtime]]=await db.execute('SELECT * FROM prospecting_auto_runtime WHERE id=1');
    const [[available]]=await db.execute("SELECT COUNT(*) total FROM prospecting_auto_candidates WHERE status='discovered'");
    const [[discoveryService]]=await db.execute("SELECT IS_USED_LOCK('digitale:prospecting-discovery') IS NOT NULL AS running");
    if(!Number(discoveryService?.running||0) && (!externalBatchId||Number(available.total)<30)&&(!runtime.provider_retry_at||new Date(runtime.provider_retry_at)<=new Date())) {
      try {
        for(let searchIndex=0;searchIndex<(externalBatchId?3:1)&&!stopping&&windowAt().open;searchIndex++){found+=await discover(runtime.query_cursor+searchIndex,id);await db.execute('UPDATE prospecting_auto_runs SET found=? WHERE id=?',[found,id]);await sleep(12000);}
        await db.execute('UPDATE prospecting_auto_runtime SET provider_failures=0,provider_retry_at=NULL WHERE id=1');
      }
      catch(e) {
        const failures=runtime.provider_failures+1,backoff=Math.min(300,30*2**Math.min(failures,4));
        await db.execute('UPDATE prospecting_auto_runtime SET query_cursor=query_cursor+1,provider_failures=?,provider_retry_at=? WHERE id=1',[failures,sqlDate(new Date(Date.now()+backoff*1000))]);
        await db.execute('UPDATE prospecting_auto_runs SET error=? WHERE id=?',[safeReason(e),id]);
      }
    }
    const [candidates]=await db.execute("SELECT c.* FROM prospecting_auto_candidates c WHERE c.status IN ('discovered','review','verified') AND c.attempts < 2 AND (c.next_attempt_at IS NULL OR c.next_attempt_at<=UTC_TIMESTAMP(6)) AND NOT EXISTS (SELECT 1 FROM prospecting_approved_leads a WHERE a.candidate_id=c.id OR a.cnpj=c.cnpj) AND NOT EXISTS (SELECT 1 FROM prospecting_auto_deliveries d WHERE d.candidate_id=c.id OR d.cnpj=c.cnpj)  AND NOT EXISTS (SELECT 1 FROM ia_digitale_approved_v2 v WHERE v.candidate_id=c.id OR v.cnpj=c.cnpj) ORDER BY CASE WHEN c.status='verified' THEN 0 WHEN c.status='discovered' THEN 1 ELSE 2 END,c.attempts,c.discovered_at LIMIT 80 /* DIGITALE_PRIORITY_READY_V2_2511 */");
    // DIGITALE_BOUNDED_RECOVERY_V2_2511: nunca confundir falha tecnica com rejeicao comercial.
    // Quando a fila elegivel esvaziar, reprogramar no maximo 12 sites antigos
    // por ciclo, apos 30 min e com no maximo 3 tentativas anteriores.
    if(!candidates.length){
      const [[limits]]=await db.execute("SELECT COUNT(*) available FROM prospecting_auto_candidates WHERE status='discovered'");
      if(Number(limits.available||0)===0){
        await db.execute("UPDATE prospecting_auto_candidates SET next_attempt_at=DATE_ADD(UTC_TIMESTAMP(6), INTERVAL (CRC32(id) % 120) SECOND), updated_at=UTC_TIMESTAMP(6) WHERE status='review' AND reason='website_no_pages' AND attempts = 1 AND updated_at<DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 MINUTE) AND next_attempt_at>DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 15 MINUTE) ORDER BY updated_at ASC LIMIT 12");
      }
    }
    for(let offset=0;offset<candidates.length;offset+=6) {
      const batch=candidates.slice(offset,offset+6);
      const results=await Promise.allSettled(batch.map(async candidate => {
      if(stopping||!windowAt().open)return;
      const settings=await getSettings(db);
      const used=await counts(db);if(!deliveryQuota(used,new Date(),Boolean(externalBatchId),settings))return;
      if(externalBatchId){const [[remaining]]=await db.execute("SELECT status FROM prospecting_external_batches WHERE id=?",[externalBatchId]);if(remaining.status!=='running')return;}
      // MAX_TWO_VERIFICATION_ATTEMPTS_20261125: enforce cap atomically.
      const [claimed]=await db.execute("UPDATE prospecting_auto_candidates SET status='verifying',attempts=attempts+1,updated_at=UTC_TIMESTAMP(6) WHERE id=? AND attempts<2 AND status IN ('discovered','review','verified')",[candidate.id]);
      if(claimed.affectedRows!==1)return;
      const reporter=verificationReporter(db,{candidateId:candidate.id,runId:id,attempt:candidate.attempts+1});
      await reporter.progress('site');
      try {
        // DIGITALE_PIPELINE_V2_2511 — recuperar provas completas recentes sem varrer o site novamente.
        let cachedProof=null;
        if(candidate.status==='verified' && candidate.proof){
          try{
            const saved=typeof candidate.proof==='string'?JSON.parse(candidate.proof):candidate.proof;
            const age=Date.now()-Date.parse(saved.checked_at||'');
            const validAge=Number.isFinite(age)&&age>=0&&age<=7*24*3600000;
            if(validAge&&saved.version===2&&saved.identity_verified===true
              &&saved.registry?.active===true&&saved.registry?.mei_status===false
              &&saved.cnpj&&saved.phone&&saved.approval_basis
              &&saved.registry?.legal_name&&saved.registry?.situacao_cadastral
              &&saved.registry?.url&&saved.website?.url){
              cachedProof=saved;
            }
          }catch{}
        }
        if(cachedProof){
          // Rechecar bloqueios antes de reutilizar prova. Evita aprovar cliente ja existente.
          const savedCnpj=cachedProof.cnpj;
          if(await isOutsideProfileCnpj(db,savedCnpj))throw Error('outside_profile_history');
          const [clientCheck]=await db.execute('SELECT cnpj FROM digitale_ai_clients WHERE cnpj=? LIMIT 1',[savedCnpj]);
          if(clientCheck.length)throw Error('customer_base');
          const norm=col=>`UPPER(REGEXP_REPLACE(COALESCE(${col},''),'[^A-Za-z0-9]',''))`;
          const [crmCheck]=await db.execute(`SELECT id FROM crm_organizations WHERE ${norm('cnpj')}=? UNION ALL SELECT id FROM leads WHERE ${norm('cnpj')}=? UNION ALL SELECT d.id FROM crm_deals d JOIN crm_organizations o ON o.id=d.organization_id WHERE ${norm('o.cnpj')}=? UNION ALL SELECT id FROM crm_external_lead_imports WHERE ${norm("JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(payload),payload,'{}'),'$.cnpj'))")}=? LIMIT 1`,[savedCnpj,savedCnpj,savedCnpj,savedCnpj]);
          if(crmCheck.length)throw Error('already_in_crm');
          console.log(JSON.stringify({event:'verified_proof_reused_for_approval',candidate_id:candidate.id}));
        }
        const proof=cachedProof||await verifyCandidate(candidate,{
          settings,
          // DIGITALE_COMMERCIAL_OBSERVATION_V2
          onCommercialObservation:
            process.env.DIGITALE_COMMERCIAL_OBSERVATION_V2 === 'true'
              ? async data => {
                  const result = observeCommercialProfile(
                    {
                      company: data.company,
                      cnpj: data.cnpj,
                      buyer_segment: data.buyer_segment
                    },
                    data.pages
                  );

                  console.log(JSON.stringify({
                    event: 'commercial_observation_v2',
                    candidate_id: candidate.id,
                    cnpj: data.cnpj,
                    original_segment: data.buyer_segment,
                    commercial_status: result.commercial_status,
                    evidence_count: result.evidence_count,
                    evidence: result.evidence.slice(0, 5),
                    automatic_rejection: false
                  }));
                }
              : null,
          onProgress:reporter.progress,
          onEmailsFound: async data => {
            try {
              await storeProspectingEmails(db, data);
            } catch (error) {
              console.error(JSON.stringify({
                event: 'prospecting_email_capture_failed',
                reason: safeReason(error)
              }));
            }
          },
          beforeRegistry:async cnpj=>{
      // DIGITALE_LOST_PROFILE_BLOCK_V1
      if (await isOutsideProfileCnpj(db, cnpj)) {
        throw Error('outside_profile_history');
      }

          const [clients]=await db.execute('SELECT cnpj FROM digitale_ai_clients WHERE cnpj=?',[cnpj]);
          if(clients.length)throw Error('customer_base');
          const norm=col=>`UPPER(REGEXP_REPLACE(COALESCE(${col},''),'[^A-Za-z0-9]',''))`;
          const [existing]=await db.execute(`SELECT id FROM crm_organizations WHERE ${norm('cnpj')}=? UNION ALL SELECT id FROM leads WHERE ${norm('cnpj')}=? UNION ALL SELECT d.id FROM crm_deals d JOIN crm_organizations o ON o.id=d.organization_id WHERE ${norm('o.cnpj')}=? UNION ALL SELECT id FROM crm_external_lead_imports WHERE ${norm("JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(payload),payload,'{}'),'$.cnpj'))")}=? LIMIT 1`,[cnpj,cnpj,cnpj,cnpj]);
          if(existing.length)throw Error('already_in_crm');
        }});
        await db.execute("UPDATE prospecting_auto_candidates SET status='verified',proof=?,verified_at=UTC_TIMESTAMP(6),updated_at=UTC_TIMESTAMP(6) WHERE id=?",[JSON.stringify(proof),candidate.id]);
        await reporter.progress('delivery',{cnpj:proof.cnpj,company:proof.company,phone:proof.phone,uf:proof.registry.uf});
        const result=await approveOnlyIA(db,proof,candidate.id);
        if(result.created){if(result.approved)approved++;else delivered++;}
        else await db.execute('UPDATE prospecting_auto_candidates SET status=?,reason=?,next_attempt_at=?,updated_at=UTC_TIMESTAMP(6) WHERE id=?',[result.duplicate?'duplicate':'verified',result.reason||null,result.duplicate?null:sqlDate(new Date(Date.now()+6*3600000)),candidate.id]);
        if(result.created)await db.execute("UPDATE prospecting_auto_candidates SET status='approved',cnpj=?,company=?,phone=?,reason=NULL,next_attempt_at=NULL,updated_at=UTC_TIMESTAMP(6) WHERE id=?",[proof.cnpj,proof.company,proof.phone,candidate.id]);
        if(result.created)console.log(JSON.stringify({event:result.approved?'verified_approval':'verified_delivery',cnpj:proof.cnpj,deal_id:result.deal_id,owner_id:result.owner_id}));
        await reporter.result(result.created?(result.approved?'approved':'delivered'):result.duplicate?'duplicate':'waiting',result.reason||null,{company:proof.company,cnpj:proof.cnpj,owner_id:result.owner_id});
      }catch(e) {
        // MAX_TWO_VERIFICATION_ATTEMPTS_20261125: no third attempt.
        const reason=safeReason(e);
        const totalAttempts=Number(candidate.attempts)+1;
        const rejected=totalAttempts>=2||['excluded_or_own_domain','not_apparel_manufacturer','outside_target_cnae','outside_textile_buyer_profile','registry_inactive_or_mismatch','outside_target_state','outside_profile_history','mei_excluded'].includes(reason);
        await db.execute('UPDATE prospecting_auto_candidates SET status=?,reason=?,next_attempt_at=?,updated_at=UTC_TIMESTAMP(6) WHERE id=?',[['already_in_crm','customer_base'].includes(reason)?'duplicate':rejected?'rejected':'review',reason,(rejected||['already_in_crm','customer_base'].includes(reason))?null:sqlDate(new Date(Date.now()+3600000)),candidate.id]);
        await reporter.result(['already_in_crm','customer_base'].includes(reason)?'duplicate':rejected?'rejected':'review',reason);
      }
      await db.execute("UPDATE prospecting_auto_runtime SET heartbeat_at=UTC_TIMESTAMP(6) WHERE id=1");
      await sleep(1000);
      }));
      for(const [resultIndex,result] of results.entries()){
        if(result.status==='rejected'){
          console.error(JSON.stringify({
            event:'candidate_unexpected_failure',
            reason:safeReason(result.reason)
          }));
          // Uma exceção fora do verificador não pode deixar o candidato preso.
          await db.execute("UPDATE prospecting_auto_candidates SET status=IF(attempts>=2,'rejected','review'),reason='worker_transient_failure',next_attempt_at=IF(attempts>=2,NULL,DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 15 MINUTE)),updated_at=UTC_TIMESTAMP(6) WHERE id=? AND status='verifying'",[batch[resultIndex].id]).catch(()=>{});
        }
      }
    }
    const used=await counts(db);
    await db.execute("UPDATE prospecting_auto_runs SET finished_at=UTC_TIMESTAMP(6),found=?,delivered=?,deficit=?,status='completed' WHERE id=?",[found,delivered,Math.max(0,(await getSettings(db)).hourly_target-used.hour),id]);
    console.log(JSON.stringify({event:'cycle_completed',found,approved,delivered,hour_quota_used:used.hour,day_quota_used:used.day,deficit:Math.max(0,(await getSettings(db)).hourly_target-used.hour)}));
  }catch(e){await db.execute("UPDATE prospecting_auto_runs SET finished_at=UTC_TIMESTAMP(6),status='error',error=? WHERE id=?",[safeReason(e),id]);console.error(JSON.stringify({event:'cycle_error',reason:safeReason(e)}));}
}
let lockConnection,heartbeatTimer;
try {
  lockConnection=await db.getConnection();
  const [[lock]]=await lockConnection.query("SELECT GET_LOCK('digitale:prospecting-worker',0) acquired");
  if(Number(lock.acquired)!==1)throw Error('worker_already_running');
  heartbeatTimer=setInterval(()=>{db.execute('UPDATE prospecting_auto_runtime SET heartbeat_at=UTC_TIMESTAMP(6) WHERE id=1').catch(()=>{});},30000);
  heartbeatTimer.unref();
  // Recovery leaves CRM writes and delivery accounting in their original transaction.
  await db.execute("UPDATE prospecting_auto_runs SET status='interrupted',finished_at=UTC_TIMESTAMP(6),error='service_restarted' WHERE status='running'");
  await db.execute("UPDATE prospecting_auto_candidates SET status=IF(attempts>=2,'rejected','review'),next_attempt_at=IF(attempts>=2,NULL,UTC_TIMESTAMP(6)),reason='service_restarted' WHERE status='verifying'");
  do {
    const [[held]]=await lockConnection.query("SELECT IS_USED_LOCK('digitale:prospecting-worker')=CONNECTION_ID() held");
    if(Number(held.held)!==1)throw Error('worker_lock_lost');
    const settings=await getSettings(db);
    const today=windowAt().date;
    if(today!==monitorCleanupDate){
      try{await db.execute('DELETE FROM ia_digitale_verification_events WHERE created_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY)');monitorCleanupDate=today;}catch{}
    }
    await refreshClientStatuses(db);
    await db.execute('UPDATE prospecting_auto_runtime SET heartbeat_at=UTC_TIMESTAMP(6),status=?,next_run_at=? WHERE id=1',[!settings.enabled?'paused':windowAt().open?'running':'outside_window',settings.enabled&&windowAt().open?null:sqlDate(nextRun())]);
    if(settings.enabled&&windowAt().open){
      await db.execute('UPDATE ia_digitale_control SET claimed_at=UTC_TIMESTAMP(6),requested_at=NULL,requested_by=NULL WHERE id=1 AND requested_at IS NOT NULL');
      await cycle();
    }
    if(process.argv.includes('--once'))break;
    const [activeBatches]=await db.execute("SELECT id FROM prospecting_external_batches WHERE status='running' LIMIT 1");
    const waitSeconds=5;
    const scheduled=new Date(Date.now()+waitSeconds*1000);
    await db.execute('UPDATE prospecting_auto_runtime SET heartbeat_at=UTC_TIMESTAMP(6),next_run_at=? WHERE id=1',[sqlDate(windowAt(scheduled).open?scheduled:nextRun(scheduled))]);
    for(let i=0;i<waitSeconds/5&&!stopping;i++){
      await sleep(5000);
      const [[request]]=await db.execute('SELECT requested_at FROM ia_digitale_control WHERE id=1');
      if(request?.requested_at)break;
    }
  }while(!stopping);
} catch(e){console.error(JSON.stringify({event:'worker_error',reason:safeReason(e)}));process.exitCode=1;}
finally {clearInterval(heartbeatTimer);if(lockConnection){await lockConnection.query("SELECT RELEASE_LOCK('digitale:prospecting-worker')");lockConnection.release();}await db.end();}
