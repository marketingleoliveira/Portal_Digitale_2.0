import {requireCourseAccess} from './training-access.js';
import {getSecurityPolicy, securityEvent} from './training-security-test.js';
import express from 'express';
import crypto from 'node:crypto';
import {db} from '../database.js';
import {COURSE,PASS,MAX_QUESTIONS,SESSION_GAP_MS,VIDEO_SECONDS,canAccess,examReady,advancePlayback,gradeAssessment} from './commercial-rules.js';
const router=express.Router();
let schema;
export function ensureCommercialJourneySchema(){
 if(!schema)schema=(async()=>{
  await db.query(`CREATE TABLE IF NOT EXISTS training_commercial_video_progress_v3 (
   user_id CHAR(36) NOT NULL,lesson_id CHAR(36) NOT NULL,completed_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
   PRIMARY KEY(user_id,lesson_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await db.query(`CREATE TABLE IF NOT EXISTS training_commercial_sessions_v3 (
   id CHAR(36) PRIMARY KEY,user_id CHAR(36) NOT NULL,course_id CHAR(36) NOT NULL,lesson_id CHAR(36) NULL,
   kind VARCHAR(16) NOT NULL,status VARCHAR(20) NOT NULL DEFAULT 'active',active_slot VARCHAR(100) NULL,
   payload_json LONGTEXT NOT NULL,score DECIMAL(5,2) NULL,passed TINYINT(1) NULL,
   created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),last_seen DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),finished_at DATETIME(3) NULL,
   UNIQUE KEY unique_commercial_active(active_slot),INDEX idx_commercial_user(user_id,course_id,kind,status)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
 })().catch(e=>{schema=null;throw e;});return schema;
}
router.use(async(req,res,next)=>{try{if(await requireCourseAccess(req.user,COURSE))return next();return res.sendStatus(403);}catch(e){console.error('COMMERCIAL ACCESS',e.code);return res.sendStatus(500);}});
router.use(async(_req,res,next)=>{try{await ensureCommercialJourneySchema();next();}catch(e){console.error('COMMERCIAL SCHEMA',e.code);res.status(500).json({error:{message:'Não foi possível preparar o treinamento.'}});}});
const error=(status,message)=>Object.assign(Error(message),{status});
const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){if(!e.status)console.error('COMMERCIAL JOURNEY',e.code||e.message);res.status(e.status||500).json({error:{message:e.status?e.message:'Não foi possível concluir a operação.'}});}};
const parse=value=>typeof value==='string'?JSON.parse(value):value;
async function lessonsFor(userId,connection=db){
 const [rows]=await connection.execute(`SELECT l.id,l.title,l.description,l.sort_order,
 (EXISTS(SELECT 1 FROM training_lesson_progress_v2 p WHERE p.user_id=? AND p.lesson_id=l.id) OR EXISTS(SELECT 1 FROM training_commercial_sessions_v3 a WHERE a.user_id=? AND a.lesson_id=l.id AND a.course_id=l.course_id AND a.kind='activity' AND a.status='completed')) AS completed,
 (SELECT a.score FROM training_commercial_sessions_v3 a WHERE a.user_id=? AND a.lesson_id=l.id AND a.course_id=l.course_id AND a.kind='activity' AND a.status='completed' ORDER BY a.finished_at,a.id LIMIT 1) AS activity_score,
 EXISTS(SELECT 1 FROM training_commercial_video_progress_v3 v WHERE v.user_id=? AND v.lesson_id=l.id) AS watched
 FROM training_lessons_v2 l JOIN training_courses_v2 c ON c.id=l.course_id
 WHERE c.id=? AND c.status='published' ORDER BY l.sort_order,l.id`,[userId,userId,userId,userId,COURSE]);
 return rows.map(l=>({...l,completed:Number(l.completed),video_completed:!!Number(l.watched)||!!Number(l.completed)}));
}
async function assessmentQuestions(assessmentId,connection=db){
 const [questions]=await connection.execute('SELECT id,question_text AS text,explanation FROM training_questions_v2 WHERE assessment_id=? ORDER BY sort_order,id',[assessmentId]);
 for(const q of questions){const [options]=await connection.execute('SELECT id,option_text AS text,is_correct FROM training_question_options_v2 WHERE question_id=? ORDER BY sort_order,id',[q.id]);q.options=options;}
 if(!questions.length||questions.length>MAX_QUESTIONS||questions.some(q=>q.options.filter(o=>Number(o.is_correct)===1).length!==1))throw error(409,'A avaliação precisa ser revisada pelo responsável.');
 return questions;
}
function publicAttempt(id,payload){const q=payload.questions[payload.index];return {id,kind:payload.kind,title:payload.title,index:payload.index,total:payload.questions.length,settings:payload.policy,remaining_ms:payload.deadlineMs?Math.max(0,payload.deadlineMs-Date.now()):null,question:{id:q.id,text:q.text,options:q.options.map(o=>({id:o.id,text:o.text}))}};}
async function transaction(fn){const c=await db.getConnection();try{await c.beginTransaction();const result=await fn(c);await c.commit();return result;}catch(e){await c.rollback();throw e;}finally{c.release();}}
async function createSession(userId,lessonId,kind,payload){
 return transaction(async c=>{
  if(kind!=='video' && payload.policy?.prevent_multiple_sessions){
   const [active]=await c.execute("SELECT id FROM training_commercial_sessions_v3 WHERE user_id=? AND course_id=? AND status='active' AND kind IN ('activity','exam') AND last_seen>=DATE_SUB(NOW(3),INTERVAL 25 SECOND) FOR UPDATE",[userId,COURSE]);
   if(active.length)throw error(409,'Já existe uma avaliação ativa. Encerre a sessão anterior.');
  }
  await c.execute("UPDATE training_commercial_sessions_v3 SET status='interrupted',active_slot=NULL,finished_at=NOW(3) WHERE user_id=? AND course_id=? AND status='active'",[userId,COURSE]);
  if(kind==='activity'){
   const [submitted]=await c.execute("SELECT id FROM training_commercial_sessions_v3 WHERE user_id=? AND course_id=? AND lesson_id=? AND kind='activity' AND status='completed' LIMIT 1 FOR UPDATE",[userId,COURSE,lessonId]);
   const [legacy]=await c.execute('SELECT lesson_id FROM training_lesson_progress_v2 WHERE user_id=? AND lesson_id=? LIMIT 1 FOR UPDATE',[userId,lessonId]);
   if(submitted.length||legacy.length)throw error(409,'Esta atividade já foi entregue e não pode ser refeita.');
  }
  const id=crypto.randomUUID();
  await c.execute('INSERT INTO training_commercial_sessions_v3(id,user_id,course_id,lesson_id,kind,active_slot,payload_json) VALUES (?,?,?,?,?,?,?)',[id,userId,COURSE,lessonId,kind,userId+':'+COURSE,JSON.stringify(payload)]);
  return id;
 });
}
async function lockSession(c,id,userId){
 const [rows]=await c.execute('SELECT * FROM training_commercial_sessions_v3 WHERE id=? AND user_id=? AND course_id=? FOR UPDATE',[id,userId,COURSE]);
 const s=rows[0];if(!s||s.status!=='active')throw error(409,'Esta tentativa foi encerrada. Inicie novamente.');
 s.payload=parse(s.payload_json);
 if(Date.now()-s.payload.lastMs>SESSION_GAP_MS)throw error(409,'A tentativa foi interrompida. Inicie novamente.');
 return s;
}
router.get('/state',wrap(async(req,res)=>{
 const lessons=await lessonsFor(req.user.id);if(lessons.length!==10)throw error(404,'Treinamento indisponível.');
 const [passed]=await db.execute("SELECT MAX(score) AS score FROM training_commercial_sessions_v3 WHERE user_id=? AND course_id=? AND kind='exam' AND status='completed' AND passed=1",[req.user.id,COURSE]);
 res.setHeader('Cache-Control','no-store');
 const policy=await getSecurityPolicy(COURSE);
 const [exams]=await db.execute("SELECT a.passing_score,(SELECT COUNT(*) FROM training_questions_v2 q WHERE q.assessment_id=a.id) AS total FROM training_assessments_v2 a WHERE a.course_id=? AND a.type='exam' AND a.lesson_id IS NULL ORDER BY a.sort_order,a.id LIMIT 1",[COURSE]);
 const examTotal=Number(exams[0]?.total||0),examPassing=Number(exams[0]?.passing_score??PASS);
 res.json({data:{settings:policy,lessons:lessons.map(l=>({...l,unlocked:canAccess(lessons,l.id)})),exam:{available:examReady(lessons)&&examTotal>0&&examTotal<=MAX_QUESTIONS,total:examTotal,passing:examPassing,passed:passed[0].score!==null,score:passed[0].score===null?null:Number(passed[0].score)}}});
}));
router.get('/journey',wrap(async(req,res)=>{res.json({data:await lessonsFor(req.user.id)});}));
router.post('/lessons/:id/video/start',wrap(async(req,res)=>{
 const lessons=await lessonsFor(req.user.id);const lesson=lessons.find(l=>l.id===req.params.id);
 if(!lesson||!canAccess(lessons,lesson.id))throw error(403,'Conclua a atividade anterior para iniciar esta aula.');
 const [materials]=await db.execute("SELECT id FROM training_materials_v2 WHERE lesson_id=? AND mime_type='video/mp4' LIMIT 1",[lesson.id]);
 if(!materials.length)throw error(409,'Vídeo indisponível.');
 const now=Date.now(),duration=VIDEO_SECONDS[lesson.sort_order-1];if(!duration)throw error(409,'Duração da aula indisponível.');
 const id=await createSession(req.user.id,lesson.id,'video',{duration,startedMs:now,lastMs:now,position:0,watched:0,allowSeek:req.user.role==='dev'&&req.body?.allowSeek===true});
 res.json({data:{id,duration}});
}));
router.post('/sessions/:id/pulse',wrap(async(req,res)=>{
 const data=await transaction(async c=>{
  const s=await lockSession(c,req.params.id,req.user.id);let p=s.payload;let complete=false;
  if(s.kind==='video'){
   try{if(p.allowSeek===true&&req.user.role==='dev'){const position=Number(req.body?.position);if(!Number.isFinite(position)||position<0||position>p.duration+1)throw Error('INVALID_POSITION');p={...p,position,lastMs:Date.now()};complete=req.body?.ended===true&&position>=p.duration-.8;}else{const next=advancePlayback(p,Number(req.body?.position),req.body?.ended,Date.now());p=next.payload;complete=next.complete;}}catch{throw error(409,'A reprodução foi interrompida ou avançada. Assista novamente desde o início.');}
   if(complete)await c.execute('INSERT INTO training_commercial_video_progress_v3(user_id,lesson_id) VALUES (?,?) ON DUPLICATE KEY UPDATE completed_at=completed_at',[req.user.id,s.lesson_id]);
  }else p.lastMs=Date.now();
  await c.execute('UPDATE training_commercial_sessions_v3 SET payload_json=?,last_seen=NOW(3),status=?,active_slot=?,finished_at=IF(?,NOW(3),finished_at) WHERE id=?',[JSON.stringify(p),complete?'completed':'active',complete?null:req.user.id+':'+COURSE,complete?1:0,s.id]);
  return {completed:complete};
 });res.json({data});
}));
router.post('/sessions/:id/interrupt',wrap(async(req,res)=>{
 const reason=String(req.body?.reason||'').slice(0,120)||null;
 await db.execute("UPDATE training_commercial_sessions_v3 SET status='interrupted',active_slot=NULL,finished_at=NOW(3),payload_json=JSON_SET(payload_json,'$.interruptionReason',?) WHERE id=? AND user_id=? AND course_id=? AND status='active'",[reason,req.params.id,req.user.id,COURSE]);res.json({data:{interrupted:true}});
}));
async function startAssessment(req,res,isExam){
 const policy=await getSecurityPolicy(COURSE);
 if(policy.require_fullscreen&&req.body?.fullscreen!==true)throw error(400,'Inicie a avaliação em tela cheia.');
 const lessons=await lessonsFor(req.user.id);let lesson=null;
 if(isExam){if(!examReady(lessons))throw error(403,'Conclua as dez aulas e atividades antes da prova final.');}
 else{lesson=lessons.find(l=>l.id===req.params.id);if(!lesson||!canAccess(lessons,lesson.id)||!lesson.video_completed)throw error(403,'Assista ao vídeo desta aula até o fim para liberar a atividade.');}
 const {a,bank}=await transaction(async c=>{
 const [assessments]=isExam?await c.execute("SELECT id,title,passing_score FROM training_assessments_v2 WHERE course_id=? AND type='exam' AND lesson_id IS NULL ORDER BY sort_order,id LIMIT 1 FOR UPDATE",[COURSE]):await c.execute("SELECT id,title,passing_score FROM training_assessments_v2 WHERE course_id=? AND lesson_id=? AND type='activity' LIMIT 1 FOR UPDATE",[COURSE,lesson.id]);
 if(!isExam&&lesson.completed)throw error(409,'Esta atividade já foi entregue e não pode ser refeita.');
 const a=assessments[0];if(!a)throw error(409,'Avaliação indisponível.');
 return {a,bank:await assessmentQuestions(a.id,c)};});
 let questions=bank;
 const randomize=items=>{const result=[...items];for(let i=result.length-1;i>0;i--){const j=crypto.randomInt(i+1);[result[i],result[j]]=[result[j],result[i]];}return result;};
 if(policy.shuffle_questions)questions=randomize(questions);
 if(policy.shuffle_options)questions=questions.map(q=>({...q,options:randomize(q.options)}));
 const now=Date.now();
 const payload={kind:isExam?'exam':'activity',title:a.title,passing:Number(a.passing_score),questions,index:0,answers:{},lastMs:now,policy,questionStartedMs:now,deadlineMs:policy.seconds_per_question?now+policy.seconds_per_question*1000:null};
 const id=await createSession(req.user.id,lesson?.id||null,payload.kind,payload);
 res.json({data:publicAttempt(id,payload)});
}
router.post('/lessons/:id/activity/start',wrap((req,res)=>startAssessment(req,res,false)));
router.post('/exam/start',wrap((req,res)=>startAssessment(req,res,true)));
router.post('/sessions/:id/answer',wrap(async(req,res)=>{
 const data=await transaction(async c=>{
  const s=await lockSession(c,req.params.id,req.user.id);if(s.kind==='video')throw error(400,'Tentativa inválida.');
  const p=s.payload,q=p.questions[p.index];
  if(p.deadlineMs&&Date.now()>p.deadlineMs)throw error(409,'Tempo da questão esgotado. Inicie uma nova tentativa.');
  if(p.policy?.detect_fast_answers&&p.questionStartedMs&&Date.now()-p.questionStartedMs<1500) await securityEvent(req.user.id,s.lesson_id,s.id,'RESPOSTA_MUITO_RAPIDA','Resposta em menos de 1500ms');
  if(req.body?.question_id!==q.id||!q.options.some(o=>o.id===req.body?.option_id))throw error(400,'Selecione uma alternativa válida para a questão atual.');
  p.answers[q.id]=req.body.option_id;p.index++;p.lastMs=Date.now();p.questionStartedMs=p.lastMs;p.deadlineMs=p.policy?.seconds_per_question?p.lastMs+p.policy.seconds_per_question*1000:null;
  if(p.index<p.questions.length){await c.execute('UPDATE training_commercial_sessions_v3 SET payload_json=?,last_seen=NOW(3) WHERE id=?',[JSON.stringify(p),s.id]);return publicAttempt(s.id,p);}
  const passing=p.passing??PASS;const result=gradeAssessment(p.questions,p.answers,passing);
  if(s.kind==='activity')await c.execute('INSERT INTO training_lesson_progress_v2(user_id,lesson_id) VALUES (?,?) ON DUPLICATE KEY UPDATE completed_at=completed_at',[req.user.id,s.lesson_id]);
  await c.execute("UPDATE training_commercial_sessions_v3 SET payload_json=?,status='completed',active_slot=NULL,score=?,passed=?,finished_at=NOW(3),last_seen=NOW(3) WHERE id=?",[JSON.stringify(p),result.score,result.passed?1:0,s.id]);
  return {...result,passing,completed:true,kind:s.kind,feedback:p.questions.map(item=>({question:item.text,correct:item.options.some(o=>o.id===p.answers[item.id]&&Number(o.is_correct)===1),correct_answer:item.options.find(o=>Number(o.is_correct)===1)?.text,explanation:item.explanation||''}))};
 });res.json({data});
}));
// Remove the former direct-answer path: activities now require a protected session.
router.all('/lessons/:id/activity',(_req,res)=>res.status(409).json({error:{message:'Atualize a página e inicie a atividade na nova jornada.'}}));
export default router;
