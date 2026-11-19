import express from "express";
import { db } from "../database.js";
import { requireAuth } from "../lib/auth.js";

const router = express.Router();

router.use(requireAuth);
router.use((req, res, next) => {
  if (req.user?.role !== "dev") {
    return res.status(403).json({
      error: { message: "Acesso exclusivo DEV" }
    });
  }
  next();
});

let schemaPromise;

export function ensureProgressSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS training_lesson_progress_v2 (
          user_id CHAR(36) NOT NULL,
          lesson_id CHAR(36) NOT NULL,
          completed_at DATETIME(3) NOT NULL
            DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (user_id, lesson_id),
          INDEX idx_progress_lesson (lesson_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS training_assessment_results_v2 (
          id CHAR(36) NOT NULL PRIMARY KEY,
          user_id CHAR(36) NOT NULL,
          course_id CHAR(36) NOT NULL,
          score DECIMAL(5,2) NOT NULL,
          created_at DATETIME(3) NOT NULL
            DEFAULT CURRENT_TIMESTAMP(3),
          INDEX idx_result_user_course (user_id, course_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    })().catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

router.use(async (_req, res, next) => {
  try {
    await ensureProgressSchema();
    next();
  } catch (error) {
    console.error("TRAINING PROGRESS SCHEMA:", error);
    res.status(500).json({
      error: { message: "Estrutura de progresso indisponível" }
    });
  }
});

const COMMERCIAL='a7c54ef2-b9a3-4a28-9d11-261116000001';
async function sellersList(){
 const [rows]=await db.query(`SELECT DISTINCT p.id,COALESCE(NULLIF(TRIM(p.full_name),''),u.email,'Vendedor') AS name,u.email,
 EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=p.id AND r.role='vendedor') AS is_seller
 FROM profiles p JOIN system_users u ON u.id=p.id
 WHERE p.is_active=1 AND COALESCE(u.disabled,0)=0 AND
 (EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=p.id AND r.role='vendedor') OR LOWER(u.email)='digitaletextilmkt@gmail.com') ORDER BY name`);
 return rows;
}
const percent=(a,b)=>b?Math.round(a/b*100):null;
const mean=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length*100)/100:null;
async function getDetails(sellers){
 const [courses]=await db.query("SELECT c.id,c.title,c.description,COUNT(l.id) AS total_lessons FROM training_courses_v2 c LEFT JOIN training_lessons_v2 l ON l.course_id=c.id WHERE c.status='published' AND (c.id='a7c54ef2-b9a3-4a28-9d11-261116000001' OR LOWER(TRIM(c.title)) NOT REGEXP '(^|[[:space:]])teste([[:space:]]|$)') GROUP BY c.id,c.title,c.description,c.created_at ORDER BY c.created_at DESC");
 if(!sellers.length)return [];
 const ids=sellers.map(s=>s.id), marks=ids.map(()=>'?').join(',');
 const [progress]=await db.query(`SELECT p.user_id,l.course_id,p.lesson_id FROM training_lesson_progress_v2 p JOIN training_lessons_v2 l ON l.id=p.lesson_id JOIN training_courses_v2 c ON c.id=l.course_id WHERE c.status='published' AND p.user_id IN (${marks})`,ids);
 const [watched]=await db.query(`SELECT v.user_id,l.course_id,v.lesson_id FROM training_commercial_video_progress_v3 v JOIN training_lessons_v2 l ON l.id=v.lesson_id WHERE v.user_id IN (${marks})`,ids);
 // Somente tentativas realmente concluidas. Ordenar pelo termino garante
 // que a nota da prova exibida sera da ULTIMA tentativa, nao a maior nota.
 const [comm]=await db.query(`SELECT user_id,course_id,lesson_id,kind,score,passed,finished_at,created_at
   FROM training_commercial_sessions_v3
   WHERE kind IN ('activity','exam') AND status='completed' AND user_id IN (${marks})
   ORDER BY COALESCE(finished_at,created_at),id`,ids);
 const [legacy]=await db.query(`SELECT user_id,course_id,MAX(score) AS score FROM training_assessment_results_v2 WHERE user_id IN (${marks}) GROUP BY user_id,course_id`,ids);
 return sellers.map(seller=>{
  const allScores=[];
  const data=courses.map(c=>{
   const done=new Set(progress.filter(p=>p.user_id===seller.id&&p.course_id===c.id).map(p=>p.lesson_id));
   const activity=new Map();
   const records=comm.filter(a=>a.user_id===seller.id&&a.course_id===c.id);
   for(const a of records){
    if(a.kind==='activity'&&!activity.has(a.lesson_id)){
     activity.set(a.lesson_id,a);
     done.add(a.lesson_id);
    }
   }
   const exams=records.filter(a=>a.kind==='exam');
   const latestExam=exams.length?exams[exams.length-1]:null;
   const hasPassedExam=exams.some(a=>Number(a.passed)===1);
   // A media das atividades nao inclui a prova final: sao dois indicadores distintos.
   const scores=c.id===COMMERCIAL?[...activity.values()].filter(a=>a.score!=null).map(a=>Number(a.score)):legacy.filter(a=>a.user_id===seller.id&&a.course_id===c.id&&a.score!=null).map(a=>Number(a.score));
   allScores.push(...scores);
   const total=Number(c.total_lessons),completed=Math.min(total,done.size),started=completed>0||watched.some(v=>v.user_id===seller.id&&v.course_id===c.id)||records.length>0;
   // Uma aprovacao anterior continua valida para conclusao do treinamento.
   const finished=total>0&&completed===total&&(c.id!==COMMERCIAL||hasPassedExam);
   return {...c,total_lessons:total,completed_lessons:completed,progress:percent(completed,total),status:!total?'without_lessons':finished?'completed':started?'in_progress':'not_started',
    best_score:mean(scores),average_score:mean(scores),activity_average_score:c.id===COMMERCIAL?mean(scores):null,
    exam_score:latestExam?.score==null?null:Number(latestExam.score),
    exam_passed:latestExam?Number(latestExam.passed)===1:null,
    exam_finished_at:latestExam?.finished_at||latestExam?.created_at||null,
    exam_attempts:exams.length,score_count:scores.length};
  });
  const total=data.reduce((n,c)=>n+c.total_lessons,0), completed=data.reduce((n,c)=>n+c.completed_lessons,0);
  return {seller,summary:{total_courses:data.length,completed_courses:data.filter(c=>c.status==='completed').length,total_lessons:total,completed_lessons:completed,progress:mean(data.filter(c=>c.total_lessons>0).map(c=>c.progress??0)),average_score:mean(allScores),score_count:allScores.length},courses:data};
 });
}
router.get('/vendedores',async(_req,res)=>{try{res.json({data:await sellersList()});}catch(e){console.error('PROGRESS SELLERS',e);res.status(500).json({error:{message:'Erro ao consultar vendedores'}});}});
router.get('/overview',async(_req,res)=>{try{
 const sellers=(await sellersList()).filter(s=>Number(s.is_seller)===1);
 const details=await getDetails(sellers);
 const sum=k=>details.reduce((n,d)=>n+d.summary[k],0);
 const total=sum('total_lessons'),completed=sum('completed_lessons'),n=sum('score_count');
 const courseMap=new Map();
 for(const d of details)for(const c of d.courses){let row=courseMap.get(c.id);if(!row){row={id:c.id,title:c.title,total:0,completed:0,in_progress:0,not_started:0,without_lessons:0,total_lessons:0,completed_lessons:0};courseMap.set(c.id,row);}row.total++;row[c.status]++;row.total_lessons+=c.total_lessons;row.completed_lessons+=c.completed_lessons;}
 res.setHeader('Cache-Control','no-store');
 res.json({data:{summary:{total_courses:sum('total_courses'),completed_courses:sum('completed_courses'),total_lessons:total,completed_lessons:completed,progress:mean(details.filter(d=>d.summary.progress!==null).map(d=>d.summary.progress)),average_score:n?Math.round(details.reduce((a,d)=>a+(d.summary.average_score||0)*d.summary.score_count,0)/n*100)/100:null,score_count:n},seller_count:sellers.length,started_count:details.filter(d=>d.courses.some(c=>c.status==='in_progress'||c.status==='completed')).length,finished_count:details.filter(d=>d.summary.total_courses>0&&d.summary.completed_courses===d.summary.total_courses).length,courses:[...courseMap.values()].map(c=>({...c,progress:percent(c.completed_lessons,c.total_lessons)}))}});
}catch(e){console.error('PROGRESS OVERVIEW',e);res.status(500).json({error:{message:'Erro ao consultar visão geral'}});}});
router.get('/vendedores/:id',async(req,res)=>{try{
 const seller=(await sellersList()).find(s=>s.id===req.params.id);if(!seller)return res.status(404).json({error:{message:'Vendedor não encontrado'}});
 const [detail]=await getDetails([seller]);res.setHeader('Cache-Control','no-store');res.json({data:detail});
}catch(e){console.error('PROGRESS DETAIL',e);res.status(500).json({error:{message:'Erro ao consultar progresso'}});}});
// Reset is restricted by the real DEV role middleware above.
router.post('/vendedores/:id/courses/:courseId/reset',async(req,res)=>{
 const userId=req.params.id,courseId=req.params.courseId;
 if(req.body?.confirm!==true)return res.status(400).json({error:{message:'Confirme o reset.'}});
 let c;
 try{
  const seller=(await sellersList()).find(s=>s.id===userId);
  if(!seller)return res.status(404).json({error:{message:'Vendedor não encontrado'}});
  const [courses]=await db.execute("SELECT id FROM training_courses_v2 WHERE id=? AND status='published'",[courseId]);
  if(!courses.length)return res.status(404).json({error:{message:'Treinamento não encontrado'}});
  // Retain an administrative audit snapshot, separate from live progress.
  await db.query(`CREATE TABLE IF NOT EXISTS training_progress_reset_audit_v1 (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,actor_id VARCHAR(64) NOT NULL,user_id VARCHAR(64) NOT NULL,course_id VARCHAR(64) NOT NULL,snapshot_json LONGTEXT NOT NULL,created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  c=await db.getConnection();await c.beginTransaction();
  const scope=[
   ['training_commercial_sessions_v3','user_id=? AND course_id=?'],
   ['training_commercial_video_progress_v3','user_id=? AND lesson_id IN (SELECT id FROM training_lessons_v2 WHERE course_id=?)'],
   ['training_lesson_progress_v2','user_id=? AND lesson_id IN (SELECT id FROM training_lessons_v2 WHERE course_id=?)'],
   ['training_assessment_results_v2','user_id=? AND course_id=?'],
   ['training_final_certificates_journey_v2','user_id=? AND course_id=?'],
   ['training_final_journey_v2','user_id=? AND course_id=?'],
   ['training_activity_attempts_test_v2','user_id=? AND BINARY assessment_id IN (SELECT BINARY id FROM training_assessments_v2 WHERE course_id=?)'],
   ['training_activity_sessions_test_v2','user_id=? AND BINARY assessment_id IN (SELECT BINARY id FROM training_assessments_v2 WHERE course_id=?)'],
   ['training_activity_locks_test_v2','user_id=? AND course_id=?']
  ];
  const snapshot={};
  for(const [table,where] of scope){const [rows]=await c.execute('SELECT * FROM '+table+' WHERE '+where+' FOR UPDATE',[userId,courseId]);snapshot[table]=rows;}
  await c.execute('INSERT INTO training_progress_reset_audit_v1(actor_id,user_id,course_id,snapshot_json) VALUES (?,?,?,?)',[req.user.id,userId,courseId,JSON.stringify(snapshot)]);
  for(const [table,where] of scope)await c.execute('DELETE FROM '+table+' WHERE '+where,[userId,courseId]);
  await c.commit();res.json({data:{reset:true}});
 }catch(e){if(c)await c.rollback();console.error('TRAINING RESET',e.code||e.message);res.status(500).json({error:{message:'Não foi possível resetar o progresso'}});}
 finally{if(c)c.release();}
});
export default router;
