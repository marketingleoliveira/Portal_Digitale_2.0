import {listExternalReviews} from '../services/prospecting-external-review-list.mjs';
import express from 'express';
import {requireAIAccess} from '../lib/digitale-ai-access.mjs';
import crypto from 'node:crypto';
import {db} from '../database.js';
import {normCnpj} from '../services/prospecting-verification.mjs';
import {requireAuth} from '../lib/auth.js';
import {getSettings,validateSettings,STATES} from '../services/digitale-ai-settings.mjs';
import {validateClientRows,inactivityCutoff,clientStatus,refreshClientStatuses} from '../services/digitale-ai-clients.mjs';
const router=express.Router();
router.use(requireAuth,requireAIAccess);
async function lockedTransaction(fn) {
  const connection=await db.getConnection();let locked=false;
  try {
    const [[lock]]=await connection.query("SELECT GET_LOCK('digitale:crm-import',10) acquired");
    if(Number(lock.acquired)!==1)throw Error('Outra importação está em andamento. Tente novamente.');locked=true;
    await connection.beginTransaction();const result=await fn(connection);await connection.commit();return result;
  }catch(e){await connection.rollback();throw e;}finally{if(locked)await connection.query("SELECT RELEASE_LOCK('digitale:crm-import')");connection.release();}
}
router.get('/',async(req,res,next)=>{try{res.json({settings:await getSettings(db),states:STATES,timezone:'America/Sao_Paulo',start_hour:8,end_hour:18});}catch(e){next(e);}});
router.put('/',async(req,res,next)=>{
  let settings;try{settings=validateSettings({...req.body,inactivity_months:req.body?.inactivity_months===undefined?(await getSettings(db)).inactivity_months:req.body.inactivity_months});}catch(e){return res.status(422).json({error:e.message});}
  try{
    await lockedTransaction(async connection=>{
      const before=await getSettings(connection);
      await connection.execute('UPDATE digitale_ai_settings SET settings=?,updated_by=? WHERE id=1',[JSON.stringify(settings),req.user.id]);
      await connection.execute('INSERT INTO digitale_ai_settings_audit(id,before_settings,after_settings,changed_by) VALUES(?,?,?,?)',[crypto.randomUUID(),JSON.stringify(before),JSON.stringify(settings),req.user.id]);
      if(JSON.stringify(before.states)!==JSON.stringify(settings.states))await connection.execute("UPDATE prospecting_auto_candidates SET status='review',reason='region_configuration_changed',next_attempt_at=UTC_TIMESTAMP(6) WHERE status='rejected' AND reason='outside_target_state'");
      if(JSON.stringify(before.states)!==JSON.stringify(settings.states)||JSON.stringify(before.segments)!==JSON.stringify(settings.segments))await connection.execute('UPDATE prospecting_auto_runtime SET query_cursor=0,provider_retry_at=NULL,provider_failures=0 WHERE id=1');
      await refreshClientStatuses(connection);
    });res.json({ok:true,settings});
  }catch(e){next(e);}
});
async function planImport(body) {
  const plan=validateClientRows(body?.rows);
  if(plan.errors.length)return {...plan,rows:undefined,sample:[],error_count:plan.errors.length,errors:plan.errors.slice(0,100)};
  const [existing]=await db.execute(`SELECT cnpj,DATE_FORMAT(last_order_date,'%Y-%m-%d') last_order_date,average_ticket FROM digitale_ai_clients WHERE cnpj IN (${plan.rows.map(()=>'?').join(',')})`,plan.rows.map(r=>r.cnpj));
  const {inactivity_months}=await getSettings(db);
  const known=new Map(existing.map(r=>[r.cnpj,r]));
  const merged=plan.rows.map(r=>{const old=known.get(r.cnpj);const preserve=old?.last_order_date&&(!r.last_order_date||old.last_order_date>r.last_order_date);return {...r,last_order_date:preserve?old.last_order_date:r.last_order_date,average_ticket:preserve||r.average_ticket===null?(old?.average_ticket===null||old?.average_ticket===undefined?null:Number(old.average_ticket)):r.average_ticket};});
  return {total:plan.total,unique:plan.rows.length,repeated:plan.repeated,new_count:plan.rows.length-existing.length,updated_count:existing.length,error_count:0,errors:[],sample:merged.slice(0,20).map(r=>({...r,status:clientStatus(r.last_order_date,new Date(),inactivity_months)})),statuses:merged.reduce((a,r)=>{a[clientStatus(r.last_order_date,new Date(),inactivity_months)]++;return a;},{active:0,inactive:0,unknown:0})};
}
router.post('/clients/preview',async(req,res,next)=>{
  try{res.json(await planImport(req.body));}catch(e){if(e.message.startsWith('Importe'))return res.status(422).json({error:e.message});next(e);}
});
router.post('/clients/import',async(req,res,next)=>{
  let plan;try{plan=validateClientRows(req.body?.rows);}catch(e){return res.status(422).json({error:e.message});}
  if(plan.errors.length)return res.status(422).json({error:'Corrija as linhas inválidas antes de importar. Nenhum cliente foi alterado.',errors:plan.errors.slice(0,100),error_count:plan.errors.length});
  try{
    const result=await lockedTransaction(async connection=>{
      const {inactivity_months}=await getSettings(connection);
      const id=crypto.randomUUID();let created=0,updated=0;
      for(const row of plan.rows){
        const [found]=await connection.execute('SELECT cnpj FROM digitale_ai_clients WHERE cnpj=?',[row.cnpj]);found.length?updated++:created++;
        await connection.execute("INSERT INTO digitale_ai_clients(cnpj,name,last_order_date,status,import_id,average_ticket) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),last_order_date=CASE WHEN last_order_date IS NULL THEN VALUES(last_order_date) WHEN VALUES(last_order_date) IS NULL THEN last_order_date ELSE GREATEST(last_order_date,VALUES(last_order_date)) END,average_ticket=CASE WHEN VALUES(average_ticket) IS NULL THEN average_ticket WHEN VALUES(last_order_date) IS NULL AND last_order_date IS NOT NULL THEN average_ticket WHEN VALUES(last_order_date)<last_order_date THEN average_ticket ELSE VALUES(average_ticket) END,import_id=VALUES(import_id)",[row.cnpj,row.name,row.last_order_date,clientStatus(row.last_order_date,new Date(),inactivity_months),id,row.average_ticket]);
      }
      await refreshClientStatuses(connection);
      await connection.execute('INSERT INTO digitale_ai_client_imports(id,filename,row_count,new_count,updated_count,imported_by) VALUES(?,?,?,?,?,?)',[id,String(req.body.filename||'planilha').replace(/[\x00-\x1f]/g,'').slice(0,255),plan.rows.length,created,updated,req.user.id]);
      return {ok:true,id,new_count:created,updated_count:updated,unique:plan.rows.length,repeated:plan.repeated};
    });res.json(result);
  }catch(e){next(e);}
});
router.get('/clients',async(req,res,next)=>{
  try{
    const page=Math.max(1,Math.min(100000,Number.parseInt(req.query.page,10)||1)),query=String(req.query.q||'').slice(0,200),status=String(req.query.status||'');
    const {inactivity_months}=await getSettings(db);
    const cutoff=inactivityCutoff(new Date(),inactivity_months);
    const statusSql="CASE WHEN last_order_date IS NULL THEN 'unknown' WHEN last_order_date<? THEN 'inactive' ELSE 'active' END";
    const where=`(name LIKE ? OR cnpj LIKE ?)${['active','inactive','unknown'].includes(status)?` AND ${statusSql}=?`:''}`;
    const args=['%'+query+'%','%'+normCnpj(query)+'%',...(['active','inactive','unknown'].includes(status)?[cutoff,status]:[])];
    const [[totals]]=await db.execute(`SELECT COUNT(*) total,SUM(last_order_date>=?) active,SUM(last_order_date<?) inactive,SUM(last_order_date IS NULL) unknown FROM digitale_ai_clients`,[cutoff,cutoff]);
    const [[count]]=await db.execute(`SELECT COUNT(*) total FROM digitale_ai_clients WHERE ${where}`,args);
    const [clients]=await db.execute(`SELECT cnpj,name,DATE_FORMAT(last_order_date,'%Y-%m-%d') last_order_date,average_ticket,${statusSql} status,updated_at FROM digitale_ai_clients WHERE ${where} ORDER BY name,cnpj LIMIT 50 OFFSET ${(page-1)*50}`,[cutoff,...args]);
    const [imports]=await db.execute('SELECT id,filename,row_count,new_count,updated_count,created_at FROM digitale_ai_client_imports ORDER BY created_at DESC LIMIT 10');
    res.json({clients,totals,total:count.total,page,page_size:50,cutoff,inactivity_months,imports});
  }catch(e){next(e);}
});

// DIGITALE_EXTERNAL_CNPJ_REVIEW_ROUTE_V1
router.get('/external-cnpj-reviews', async (req, res, next) => {
  try {
    const rawLimit = String(req.query.limit ?? '50');
    const limit = Number(rawLimit);
    const status = req.query.status === undefined
      ? null
      : String(req.query.status);

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({error:'invalid_limit'});
    }

    if (status !== null &&
        !['pending','inconclusive','review_required'].includes(status)) {
      return res.status(400).json({error:'invalid_status'});
    }

    const result = await listExternalReviews(db,{limit,status});

    return res.json({
      ok:true,
      read_only:true,
      ...result
    });
  } catch (error) {
    next(error);
  }
});

export default router;
