export const VERIFICATION_STAGES=['site','identity','registry','profile','contact','delivery'];
const fields=['cnpj','company','uf','phone','url','pages_checked','owner_id'];
export function verificationReporter(db,{candidateId,runId,attempt}){
  let current='site',last=null;
  async function write(status,reason=null,details={}){
    const safe=Object.fromEntries(fields.filter(key=>details[key]!==undefined&&details[key]!==null).map(key=>[key,String(details[key]).slice(0,key==='url'?1000:200)]));
    const key=JSON.stringify([current,status,reason,safe]);if(key===last)return;
    try{
      await db.execute('INSERT INTO ia_digitale_verification_events(candidate_id,run_id,attempt,stage,status,reason,details) VALUES(?,?,?,?,?,?,?)',[candidateId,runId,attempt,current,status,reason?String(reason).slice(0,191):null,JSON.stringify(safe)]);
      last=key;
      await db.execute('UPDATE prospecting_auto_runtime SET heartbeat_at=UTC_TIMESTAMP(6) WHERE id=1');
    }catch{console.warn(JSON.stringify({event:'verification_monitor_unavailable'}));}
  }
  return {
    async progress(stage,details={}){if(!VERIFICATION_STAGES.includes(stage))return;current=stage;await write('started',null,details);},
    async result(status,reason=null,details={}){await write(status,reason,details);}
  };
}
