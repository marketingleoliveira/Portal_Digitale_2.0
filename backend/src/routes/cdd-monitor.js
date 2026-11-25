import express from 'express';
import {db} from '../database.js';
import {requireAuth} from '../lib/auth.js';
import {canReadAI} from '../lib/digitale-ai-access.mjs';
const router=express.Router();
const hasTable=async name=>{const [rows]=await db.execute('SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?',[name]);return Number(rows[0]?.n||0)>0};
router.get('/',requireAuth,async(req,res)=>{
 try{
  if(!canReadAI(req.user))return res.status(403).json({error:'Acesso não autorizado'});
  const imported=await hasTable('digitale_casa_prospects'),usageTable=await hasTable('digitale_casa_usage');
  let totals={total:0,today:0,week:0,validated:0,pending:0},recent=[],usage=null,queue={pending:0,verifying:0,validated:0,rejected:0};
  if(imported){
   const [r]=await db.execute("SELECT COUNT(*) total,SUM(DATE(CONVERT_TZ(discovered_at,'+00:00','-03:00'))=DATE(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','-03:00'))) today,SUM(discovered_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 7 DAY)) week,SUM(status='VALIDADO') validated,SUM(status<>'VALIDADO') pending FROM digitale_casa_prospects");
   totals=r[0]||totals;
   const [list]=await db.execute("SELECT cnpj,company,phone,email,cnae,uf,status,discovered_at FROM digitale_casa_prospects ORDER BY discovered_at DESC LIMIT 30");recent=list;
  }
  if(usageTable){const [rows]=await db.execute('SELECT requests,requests_date,weekly_imports,last_page,last_run_at,last_status FROM digitale_casa_usage WHERE id=1');usage=rows[0]||null}
  if(await hasTable('ia_sdr_validation_queue')){
   const [rows]=await db.execute("SELECT status,COUNT(*) n FROM ia_sdr_validation_queue WHERE lead_key IN (SELECT CONCAT('CNPJ:',cnpj) FROM digitale_casa_prospects) GROUP BY status").catch(()=>[[]]);
   for(const x of rows)if(Object.hasOwn(queue,x.status))queue[x.status]=Number(x.n);
  }
  res.json({integration:imported?'data_source_created':'awaiting_importer',meta:{daily:100,weekly:500},usage,totals,recent,queue,refreshedAt:new Date().toISOString()});
 }catch(e){console.error('CDD_MONITOR_ERROR',e.code||e.message);res.status(503).json({error:'Falha ao consultar monitor CDD'})}
});
export default router;
