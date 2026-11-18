import express from 'express';
import fs from 'node:fs';
import {timingSafeEqual} from 'node:crypto';
import {db} from '../database.js';
import {requireAuth} from '../lib/auth.js';

const router=express.Router();
const secretFile='/etc/portal-digitale/rafael-ingest.key';
const STATES=new Set(['agendado','em_contato','recusado','recuperar','sem_resposta','retorno_autorizado','fora_perfil']);
const MAX_TEXT=1200;
const normalizeStatus=v=>v==='nao_contatar'?'recusado':v==='agendamento_simulado'?'recuperar':STATES.has(v)?v:'em_contato';
const safe=(value,size=MAX_TEXT)=>String(value||'').slice(0,size);
const isDev=(req,res,next)=>req.user?.role==='dev'?next():res.status(403).json({error:'Acesso exclusivo do Desenvolvedor'});
const cleanPhone=value=>{const x=safe(value,40);return /^[+0-9() .-]{7,40}$/.test(x)?x:'';};
const allowedArticle=new Set(['Milano','Lyon','Veneza','Oceanic','Caribe','Aerodry']);
function ingestAuthorized(req){try{const expected=Buffer.from(fs.readFileSync(secretFile,'utf8').trim());const provided=Buffer.from(String(req.headers['x-rafael-ingest-key']||''));return expected.length===provided.length&&timingSafeEqual(expected,provided);}catch{return false;}}

// Rota dedicada a gravação de eventos de ligação; somente origem confiável com chave interna.
router.post('/ingest',async(req,res)=>{
 if(!ingestAuthorized(req))return res.status(403).json({error:'forbidden'});
 const b=req.body||{};
 const id=safe(b.id,90);const event=safe(b.event,30);
 if(!/^[a-zA-Z0-9_-]{12,90}$/.test(id)||!['start','turn','end'].includes(event))return res.status(400).json({error:'invalid_event'});
 try{
  if(event==='start'){
   await db.execute(`INSERT INTO rafael_attendance_calls (id,channel,status,started_at,updated_at) VALUES (?,'laboratorio','em_contato',NOW(),NOW()) ON DUPLICATE KEY UPDATE updated_at=NOW()`,[id]);
  }else if(event==='turn'){
   const turn=Math.max(1,Math.min(100,Number(b.turn)||1));
   const user=safe(b.transcript);const reply=safe(b.reply);
   if(user)await db.execute('INSERT INTO rafael_attendance_turns (call_id,turn_number,speaker,text) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE text=VALUES(text)',[id,turn,'cliente',user]);
   if(reply)await db.execute('INSERT INTO rafael_attendance_turns (call_id,turn_number,speaker,text) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE text=VALUES(text)',[id,turn,'rafael',reply]);
   const allowed=normalizeStatus(b.status);
   // Só registrar interesse explícito; artigo sugerido e interesse confirmado não são equivalentes.
   const article=allowedArticle.has(b.articlePresented)?b.articlePresented:'';
   const interest=Boolean(b.articleInterest)&&Boolean(article)&&Boolean(String(b.interestEvidence||'').trim());
   await db.execute(`UPDATE rafael_attendance_calls SET
     status=IF(do_not_contact=1,'recusado',?),do_not_contact=GREATEST(do_not_contact,?),
     contact_name=COALESCE(NULLIF(?,''),contact_name),company_name=COALESCE(NULLIF(?,''),company_name),
     dialed_phone=COALESCE(NULLIF(?,''),dialed_phone),contact_role=COALESCE(NULLIF(?,''),contact_role),
     segment=COALESCE(NULLIF(?,''),segment),customer_need=COALESCE(NULLIF(?,''),customer_need),
     article_presented=COALESCE(NULLIF(?,''),article_presented),
     article_interest=GREATEST(article_interest,?),
     interest_evidence=IF(?,NULLIF(?,''),interest_evidence),
     next_action=COALESCE(NULLIF(?,''),next_action),last_stage=?,updated_at=NOW()
     WHERE id=?`,[allowed,b.doNotContact||b.status==='nao_contatar'?1:0,
       safe(b.contactName,120),safe(b.companyName,180),cleanPhone(b.dialedPhone),safe(b.contactRole,120),
       safe(b.segment,90),safe(b.customerNeed,1200),article,interest?1:0,interest?1:0,
       interest?safe(b.interestEvidence,1200):'',safe(b.nextAction,160),safe(b.stage,80),id]);
  }else {
   const state=normalizeStatus(b.status||'recuperar');
   await db.execute('UPDATE rafael_attendance_calls SET status=IF(do_not_contact=1,\'recusado\',?),do_not_contact=GREATEST(do_not_contact,?),ended_at=NOW(),updated_at=NOW() WHERE id=?',[state,b.doNotContact||b.status==='nao_contatar'?1:0,id]);
  }
  return res.json({ok:true});
 }catch(error){console.error('RAFAEL_ATTENDANCE_INGEST',error);return res.status(500).json({error:'storage_error'});}
});

router.get('/',requireAuth,isDev,async(req,res)=>{
 try{
  const search=safe(req.query.q,100).trim(),status=safe(req.query.status,40);
  let sql='SELECT id,channel,status,do_not_contact,contact_name,company_name,dialed_phone,contact_role,segment,customer_need,article_presented,article_interest,interest_evidence,next_action,last_stage,started_at,ended_at,updated_at FROM rafael_attendance_calls WHERE 1=1';const args=[];
  if(status&&status!=='todos'&&STATES.has(status)){sql+=' AND status=?';args.push(status);}
  if(search){sql+=' AND (id LIKE ? OR contact_name LIKE ? OR segment LIKE ? OR company_name LIKE ? OR dialed_phone LIKE ? OR article_presented LIKE ? OR customer_need LIKE ?)';args.push(...Array(7).fill('%'+search+'%'));}
  sql+=' ORDER BY started_at DESC LIMIT 200';
  const [calls]=await db.execute(sql,args);
  const [[totals]]=await db.execute('SELECT COUNT(*) total, SUM(status=\'agendado\') agendado, SUM(status=\'em_contato\') em_contato, SUM(status IN (\'recusado\',\'nao_contatar\')) recusado, SUM(status=\'recuperar\') recuperar, SUM(status=\'sem_resposta\') sem_resposta, SUM(status=\'retorno_autorizado\') retorno_autorizado, SUM(status=\'fora_perfil\') fora_perfil FROM rafael_attendance_calls');
  res.json({calls,totals});
 }catch(e){console.error('RAFAEL_ATTENDANCE_LIST',e);res.status(500).json({error:'Falha ao consultar atendimentos'});}
});
router.get('/:id',requireAuth,isDev,async(req,res)=>{
 const id=safe(req.params.id,90);if(!/^[a-zA-Z0-9_-]{12,90}$/.test(id))return res.status(400).json({error:'id_invalido'});
 try{const [[call]]=await db.execute('SELECT * FROM rafael_attendance_calls WHERE id=?',[id]);if(!call)return res.status(404).json({error:'nao_encontrado'});
 const [turns]=await db.execute('SELECT turn_number,speaker,text,created_at FROM rafael_attendance_turns WHERE call_id=? ORDER BY turn_number,CASE speaker WHEN \'cliente\' THEN 0 ELSE 1 END',[id]);res.json({call,turns});}
 catch(e){console.error('RAFAEL_ATTENDANCE_DETAIL',e);res.status(500).json({error:'Falha ao consultar histórico'});}
});
export default router;
