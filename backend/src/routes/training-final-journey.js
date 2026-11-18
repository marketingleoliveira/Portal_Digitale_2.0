import express from 'express';
import crypto from 'node:crypto';
import { db } from '../database.js';
import { requireAuth } from '../lib/auth.js';
import {
  getSecurityPolicy,
  securityEvent
} from './training-security-test.js';

const router = express.Router();
const COURSE = '297fc0fd-694a-4de4-831d-517b447b34cb';
const TOTAL = 20;
const PASS = 80;
const TIME = 30;

router.use(requireAuth);

router.use((req,res,next)=>{
  if(req.user?.role!=='dev') return res.sendStatus(403);
  next();
});

let ready;

function setup(){
  if(!ready){
    ready=(async()=>{
      await db.execute(`
        CREATE TABLE IF NOT EXISTS training_final_locks_v2 (
          user_id VARCHAR(64) PRIMARY KEY,
          reason VARCHAR(120) NOT NULL,
          locked_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS training_final_journey_v2 (
          id CHAR(36) PRIMARY KEY,
          user_id VARCHAR(64) NOT NULL,
          course_id CHAR(36) NOT NULL,
          active_slot VARCHAR(140) NULL,
          status VARCHAR(20) NOT NULL,
          questions_json LONGTEXT NOT NULL,
          answers_json LONGTEXT NOT NULL,
          question_index INT NOT NULL DEFAULT 0,
          started_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
          deadline_at DATETIME(3) NOT NULL,
          finished_at DATETIME(3) NULL,
          score INT NULL,
          passed TINYINT(1) NULL,
          UNIQUE KEY unique_final_active(active_slot),
          INDEX idx_final_user(user_id,course_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS training_final_certificates_journey_v2 (
          id CHAR(36) PRIMARY KEY,
          user_id VARCHAR(64) NOT NULL,
          course_id CHAR(36) NOT NULL,
          session_id CHAR(36) NOT NULL,
          recipient_name VARCHAR(255) NOT NULL,
          recipient_email VARCHAR(255) NOT NULL,
          course_title VARCHAR(255) NOT NULL,
          score INT NOT NULL,
          issued_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
          UNIQUE KEY unique_certificate_user_course(user_id,course_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      const [cols]=await db.execute(
        'SHOW COLUMNS FROM training_final_journey_v2'
      );
      const fields=new Set(cols.map(c=>c.Field));

      if(!fields.has('question_deadline_at')){
        await db.execute(`
          ALTER TABLE training_final_journey_v2
          ADD COLUMN question_deadline_at DATETIME(3) NULL
        `);
      }

      if(!fields.has('heartbeat_at')){
        await db.execute(`
          ALTER TABLE training_final_journey_v2
          ADD COLUMN heartbeat_at DATETIME(3) NULL
        `);
      }

      if(!fields.has('policy_json')){
        await db.execute(`
          ALTER TABLE training_final_journey_v2
          ADD COLUMN policy_json LONGTEXT NULL
        `);
      }
    })().catch(e=>{
      ready=null;
      throw e;
    });
  }
  return ready;
}

function err(res,message,code=400){
  return res.status(code).json({error:{message}});
}

async function requirements(userId){
  const [lessons]=await db.execute(`
    SELECT id,title FROM training_lessons_v2
    WHERE course_id=? ORDER BY sort_order,id
  `,[COURSE]);

  const [videos]=await db.execute(`
    SELECT DISTINCT lesson_id
    FROM training_lesson_progress_v2
    WHERE user_id=?
  `,[userId]);

  const [activities]=await db.execute(`
    SELECT DISTINCT a.lesson_id
    FROM training_activity_attempts_test_v2 t
    JOIN training_assessments_v2 a
      ON BINARY a.id=BINARY t.assessment_id
    WHERE t.user_id=? AND t.passed=1
      AND a.course_id=? AND a.type='activity'
  `,[userId,COURSE]);

  const v=new Set(videos.map(x=>String(x.lesson_id)));
  const a=new Set(activities.map(x=>String(x.lesson_id)));

  const steps=lessons.map(x=>({
    title:x.title,
    video:v.has(String(x.id)),
    activity:a.has(String(x.id))
  }));

  return {
    steps,
    ready:steps.length>0 &&
      steps.every(x=>x.video && x.activity)
  };
}

async function questions(){
  const [rows]=await db.execute(`
    SELECT DISTINCT q.id
    FROM training_questions_v2 q
    JOIN training_assessments_v2 a
      ON BINARY a.id=BINARY q.assessment_id
    WHERE a.course_id=? AND a.type='activity'
  `,[COURSE]);

  return rows.map(x=>String(x.id));
}

async function certificate(userId){
  const [rows]=await db.execute(`
    SELECT * FROM training_final_certificates_journey_v2
    WHERE user_id=? AND course_id=? LIMIT 1
  `,[userId,COURSE]);
  return rows[0]||null;
}

async function expire(userId){
  await db.execute(`
    UPDATE training_final_journey_v2
    SET status='expired',active_slot=NULL,
        finished_at=NOW(3)
    WHERE user_id=? AND course_id=?
      AND status='active' AND deadline_at<=NOW(3)
  `,[userId,COURSE]);
}

async function active(userId){
  await expire(userId);

  const [rows]=await db.execute(`
    SELECT *,
      GREATEST(0,TIMESTAMPDIFF(SECOND,NOW(3),deadline_at))
      AS remaining
    FROM training_final_journey_v2
    WHERE user_id=? AND course_id=? AND status='active'
    ORDER BY started_at DESC LIMIT 1
  `,[userId,COURSE]);

  return rows[0]||null;
}

async function publicQuestion(id,sessionId){
  const [q]=await db.execute(`
    SELECT id,question_text FROM training_questions_v2
    WHERE id=? LIMIT 1
  `,[id]);

  if(!q.length) throw Error('Questao indisponivel');

  const [options]=await db.execute(`
    SELECT id,option_text
    FROM training_question_options_v2
    WHERE question_id=?
  `,[id]);

  const rank=value=>crypto
    .createHash('sha256')
    .update(sessionId+':'+String(value))
    .digest('hex');

  options.sort((x,y)=>
    rank(x.id).localeCompare(rank(y.id))
  );

  return {
    id:q[0].id,
    text:q[0].question_text,
    options:options.map(x=>({
      id:x.id,
      text:x.option_text
    }))
  };
}

async function publicSession(s){
  const ids=JSON.parse(s.questions_json);

  return {
    id:s.id,
    index:s.question_index,
    total:TOTAL,
    remaining:Number(s.remaining),
    question:await publicQuestion(
      ids[s.question_index],s.id
    )
  };
}


async function finalLock(userId){
  const [rows]=await db.execute(`
    SELECT reason,locked_at
    FROM training_final_locks_v2
    WHERE user_id=? LIMIT 1
  `,[userId]);
  return rows[0]||null;
}

async function blockFinal(userId,reason,sessionId=null){
  await db.execute(`
    INSERT INTO training_final_locks_v2
    (user_id,reason)
    VALUES (?,?)
    ON DUPLICATE KEY UPDATE
      reason=VALUES(reason),
      locked_at=NOW(3)
  `,[userId,reason]);

  await db.execute(`
    UPDATE training_final_journey_v2
    SET status='blocked',active_slot=NULL,
        finished_at=NOW(3)
    WHERE user_id=? AND status='active'
  `,[userId]);

  await securityEvent(
    userId,null,sessionId,
    'PROVA_FINAL_'+reason
  );
}

router.get('/admin/blocked',async(req,res)=>{
  try{
    await setup();
    const [rows]=await db.execute(`
      SELECT l.user_id,l.reason,l.locked_at,
             u.email,
             COALESCE(p.full_name,u.email) AS name
      FROM training_final_locks_v2 l
      LEFT JOIN system_users u
        ON BINARY u.id=BINARY l.user_id
      LEFT JOIN profiles p
        ON BINARY p.id=BINARY l.user_id
      ORDER BY l.locked_at DESC
    `);
    res.json({data:rows});
  }catch(e){
    console.error('FINAL BLOCKED LIST:',e);
    err(res,'Falha ao consultar bloqueios.',500);
  }
});

router.post('/admin/unlock/:userId',async(req,res)=>{
  try{
    await setup();
    const userId=req.params.userId;

    await db.execute(`
      DELETE FROM training_final_locks_v2
      WHERE user_id=?
    `,[userId]);

    await db.execute(`
      UPDATE training_final_journey_v2
      SET status='released',active_slot=NULL,
          finished_at=COALESCE(finished_at,NOW(3))
      WHERE user_id=? AND status='blocked'
    `,[userId]);

    await securityEvent(
      userId,null,null,
      'PROVA_FINAL_LIBERADA_POR_DEV',
      String(req.user.id)
    );

    res.json({data:{unlocked:true}});
  }catch(e){
    console.error('FINAL UNLOCK:',e);
    err(res,'Falha ao liberar prova.',500);
  }
});

router.post('/violation',async(req,res)=>{
  try{
    await setup();

    const reason=String(req.body?.reason||'');
    const reasons=new Set([
      'SAIDA_TELA_CHEIA',
      'TROCA_DE_ABA',
      'NAVEGACAO',
      'SESSAO_INTERROMPIDA'
    ]);

    if(!reasons.has(reason)){
      return err(res,'Ocorrencia invalida.',400);
    }

    const id=String(req.body?.id||'');

    const [rows]=await db.execute(`
      SELECT id,policy_json FROM training_final_journey_v2
      WHERE id=? AND user_id=? AND course_id=?
        AND status='active'
      LIMIT 1
    `,[id,req.user.id,COURSE]);

    if(!rows.length){
      return err(res,'Sessao inativa.',409);
    }

    const policy=rows[0].policy_json ? JSON.parse(rows[0].policy_json) : await getSecurityPolicy(COURSE);

    if(
      (reason==='SAIDA_TELA_CHEIA'&&!policy.require_fullscreen) ||
      (reason==='TROCA_DE_ABA'&&!policy.detect_tab_change) ||
      (reason==='NAVEGACAO'&&!policy.detect_navigation)
    ){
      return err(res,'Monitoramento desativado.',409);
    }

    await blockFinal(req.user.id,reason,id);
    res.json({data:{blocked:true}});
  }catch(e){
    console.error('FINAL VIOLATION:',e);
    err(res,'Falha ao registrar violacao.',500);
  }
});

router.post('/heartbeat',async(req,res)=>{
  try{
    await setup();

    const id=String(req.body?.id||'');

    const [rows]=await db.execute(`
      SELECT status,deadline_at,
        question_deadline_at,heartbeat_at
      FROM training_final_journey_v2
      WHERE id=? AND user_id=? AND course_id=?
      LIMIT 1
    `,[id,req.user.id,COURSE]);

    const s=rows[0];

    if(!s || s.status!=='active'){
      return err(res,'Sessao inativa.',409);
    }

    if(await finalLock(req.user.id)){
      return err(res,'Prova bloqueada.',423);
    }

    const [clock]=await db.execute(`
      SELECT
        NOW(3)>? AS total_expired,
        NOW(3)>? AS question_expired,
        TIMESTAMPDIFF(SECOND,?,NOW(3)) AS silence
    `,[
      s.deadline_at,
      s.question_deadline_at||s.deadline_at,
      s.heartbeat_at||s.deadline_at
    ]);

    if(
      clock[0].total_expired ||
      clock[0].question_expired ||
      (
        s.heartbeat_at &&
        Number(clock[0].silence)>45
      )
    ){
      await blockFinal(
        req.user.id,'TEMPO_OU_SESSAO_EXPIRADA',id
      );
      return err(res,'Prova bloqueada por interrupcao.',423);
    }

    await db.execute(`
      UPDATE training_final_journey_v2
      SET heartbeat_at=NOW(3)
      WHERE id=? AND user_id=? AND status='active'
    `,[id,req.user.id]);

    res.json({data:{ok:true}});
  }catch(e){
    console.error('FINAL HEARTBEAT:',e);
    err(res,'Erro ao validar sessao.',500);
  }
});

router.get('/status',async(req,res)=>{
  try{
    await setup();

    const steps=await requirements(req.user.id);
    const available=(await questions()).length;
    const cert=await certificate(req.user.id);
    const lock=await finalLock(req.user.id);
    const policy=await getSecurityPolicy(COURSE);
    const session=await active(req.user.id);

    res.json({data:{
      prerequisites:steps,
      available,
      total:TOTAL,
      passing:PASS,
      minutes:TIME,
      certificate:cert,
      locked:lock,
      settings:policy,
      active:Boolean(session)
    }});
  }catch(e){
    console.error('FINAL JOURNEY STATUS:',e);
    err(res,'Erro ao consultar prova final.',500);
  }
});

router.get('/current',async(req,res)=>{
  try{
    await setup();
    if(await finalLock(req.user.id)){
      return err(res,'Prova bloqueada. Solicite liberacao ao DEV.',423);
    }
    const s=await active(req.user.id);
    if(!s) return err(res,'Nenhuma prova ativa.',404);
    res.json({data:await publicSession(s)});
  }catch(e){
    console.error('FINAL JOURNEY CURRENT:',e);
    err(res,'Erro ao recuperar prova.',500);
  }
});

router.post('/start',async(req,res)=>{
  try{
    await setup();
    if(await finalLock(req.user.id)){
      return err(res,'Prova bloqueada. Solicite liberacao ao DEV.',423);
    }

    if(await certificate(req.user.id)){
      return err(res,'Certificado já emitido.',409);
    }

    const prereq=await requirements(req.user.id);

    if(!prereq.ready){
      return err(res,'Conclua todas as aulas e atividades.',403);
    }

    const pool=await questions();

    if(pool.length<TOTAL){
      return err(
        res,
        `O curso possui ${pool.length} questões. São necessárias ${TOTAL}.`,
        409
      );
    }

    if(await active(req.user.id)){
      return err(res,'Já existe uma prova em andamento.',409);
    }

    const ids=pool
      .map(id=>({id,order:crypto.randomBytes(16).toString('hex')}))
      .sort((x,y)=>x.order.localeCompare(y.order))
      .slice(0,TOTAL)
      .map(x=>x.id);

    const id=crypto.randomUUID();
    const policy=await getSecurityPolicy(COURSE);

    try{
      await db.execute(`
        INSERT INTO training_final_journey_v2
        (id,user_id,course_id,active_slot,status,
         questions_json,answers_json,deadline_at)
        VALUES (?,?,?,?,'active',?,'{}',
                DATE_ADD(NOW(3),INTERVAL ? MINUTE))
      `,[
        id,req.user.id,COURSE,
        `${req.user.id}:${COURSE}`,
        JSON.stringify(ids),TIME
      ]);
    }catch(e){
      if(e.code==='ER_DUP_ENTRY'){
        return err(res,'Já existe uma prova ativa.',409);
      }
      throw e;
    }

    await db.execute(`
      UPDATE training_final_journey_v2
      SET question_deadline_at=
            DATE_ADD(NOW(3),INTERVAL ? SECOND),
          heartbeat_at=NOW(3),
          policy_json=?
      WHERE id=?
    `,[
      policy.seconds_per_question,
      JSON.stringify(policy),id
    ]);

    const s=await active(req.user.id);
    res.json({data:await publicSession(s)});
  }catch(e){
    console.error('FINAL JOURNEY START:',e);
    err(res,'Não foi possível iniciar a prova.',500);
  }
});

router.post('/answer',async(req,res)=>{
  let conn;
  let inTransaction=false;

  try{
    await setup();

    if(await finalLock(req.user.id)){
      return err(
        res,'Prova bloqueada. Solicite liberacao ao DEV.',423
      );
    }

    conn=await db.getConnection();

    const id=String(req.body?.id||'');
    const index=Number(req.body?.index);
    const option=String(req.body?.option||'');

    await conn.beginTransaction();
    inTransaction=true;

    const [rows]=await conn.execute(`
      SELECT *,
        TIMESTAMPDIFF(
          MICROSECOND,NOW(3),deadline_at
        ) AS remaining_us
      FROM training_final_journey_v2
      WHERE id=? AND user_id=? AND course_id=?
      FOR UPDATE
    `,[id,req.user.id,COURSE]);

    const s=rows[0];

    if(!s || s.status!=='active'){
      await conn.rollback();
      inTransaction=false;
      return err(res,'Prova não está ativa.',409);
    }

    if(Number(s.remaining_us)<=0){
      await conn.execute(`
        UPDATE training_final_journey_v2
        SET status='expired',active_slot=NULL,
            finished_at=NOW(3)
        WHERE id=?
      `,[id]);

      await conn.commit();
      inTransaction=false;
      return err(res,'O tempo da prova terminou.',409);
    }

    if(
      s.question_deadline_at &&
      new Date(s.question_deadline_at).getTime()<=Date.now()
    ){
      await conn.rollback();
      inTransaction=false;
      await blockFinal(
        req.user.id,'TEMPO_POR_QUESTAO_EXPIRADO',id
      );
      return err(
        res,'Tempo da questao encerrado. Prova bloqueada.',423
      );
    }

    const ids=JSON.parse(s.questions_json);
    const answers=JSON.parse(s.answers_json||'{}');

    if(index!==s.question_index || !ids[index]){
      await conn.rollback();
      inTransaction=false;
      return err(res,'Sequência inválida.',409);
    }

    const qid=ids[index];

    const [valid]=await conn.execute(`
      SELECT id FROM training_question_options_v2
      WHERE id=? AND question_id=? LIMIT 1
    `,[option,qid]);

    if(!valid.length){
      await conn.rollback();
      inTransaction=false;
      return err(res,'Alternativa inválida.',400);
    }

    answers[qid]=option;

    if(index+1<TOTAL){
      await conn.execute(`
        UPDATE training_final_journey_v2
        SET answers_json=?,question_index=?,
            question_deadline_at=
              DATE_ADD(NOW(3),INTERVAL ? SECOND),
            heartbeat_at=NOW(3)
        WHERE id=?
      `,[
        JSON.stringify(answers),index+1,
        JSON.parse(s.policy_json||'{}').seconds_per_question||60,
        id
      ]);

      await conn.commit();
      inTransaction=false;

      const next=await active(req.user.id);
      if(!next) return err(res,'Tempo encerrado.',409);

      return res.json({data:{
        finished:false,
        ...(await publicSession(next))
      }});
    }

    let correct=0;

    for(const questionId of ids){
      const [right]=await conn.execute(`
        SELECT id FROM training_question_options_v2
        WHERE question_id=? AND is_correct=1
      `,[questionId]);

      if(right.some(x=>String(x.id)===String(answers[questionId]))){
        correct++;
      }
    }

    const score=Math.round(correct/TOTAL*100);
    const passed=score>=PASS;

    await conn.execute(`
      UPDATE training_final_journey_v2
      SET status='completed',
          active_slot=NULL,
          answers_json=?,
          question_index=?,
          score=?,passed=?,
          finished_at=NOW(3)
      WHERE id=?
    `,[
      JSON.stringify(answers),
      TOTAL,score,passed?1:0,id
    ]);

    if(passed){
      const [users]=await conn.execute(`
        SELECT u.email,
          COALESCE(p.full_name,u.email) AS name
        FROM system_users u
        LEFT JOIN profiles p
          ON BINARY p.id=BINARY u.id
        WHERE u.id=? LIMIT 1
      `,[req.user.id]);

      const [courses]=await conn.execute(`
        SELECT title FROM training_courses_v2
        WHERE id=? LIMIT 1
      `,[COURSE]);

      if(!users.length || !courses.length){
        throw Error('Dados do certificado indisponíveis');
      }

      await conn.execute(`
        INSERT INTO training_final_certificates_journey_v2
        (id,user_id,course_id,session_id,
         recipient_name,recipient_email,
         course_title,score)
        VALUES (?,?,?,?,?,?,?,?)
      `,[
        crypto.randomUUID(),req.user.id,COURSE,id,
        users[0].name,users[0].email,
        courses[0].title,score
      ]);
    }

    await conn.commit();
    inTransaction=false;

    res.json({data:{
      finished:true,correct,score,passed
    }});
  }catch(e){
    if(inTransaction && conn){
      await conn.rollback().catch(()=>{});
    }
    console.error('FINAL JOURNEY ANSWER:',e);
    err(res,'Erro ao registrar resposta.',500);
  }finally{
    if(conn) conn.release();
  }
});

export default router;
