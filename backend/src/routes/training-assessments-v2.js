import {securityEvent} from './training-security-test.js';
import express from "express";
import crypto from "node:crypto";
import { db } from "../database.js";
import { requireAuth } from "../lib/auth.js";

const router = express.Router();
const uuid = () => crypto.randomUUID();

router.use(requireAuth);

router.use((req, res, next) => {
  if (req.user?.role !== "dev") {
    return res.status(403).json({
      error: { message: "Acesso exclusivo ao Desenvolvedor" }
    });
  }
  next();
});

let schemaPromise;

function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS training_assessments_v2 (
          id CHAR(36) PRIMARY KEY,
          course_id CHAR(36) NOT NULL,
          lesson_id CHAR(36) NULL,
          title VARCHAR(255) NOT NULL,
          type VARCHAR(20) NOT NULL DEFAULT 'activity',
          passing_score DECIMAL(5,2) NOT NULL DEFAULT 70,
          sort_order INT NOT NULL DEFAULT 0,
          created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
          INDEX idx_assessment_course (course_id),
          CONSTRAINT fk_assessment_course
            FOREIGN KEY (course_id)
            REFERENCES training_courses_v2(id)
            ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS training_questions_v2 (
          id CHAR(36) PRIMARY KEY,
          assessment_id CHAR(36) NOT NULL,
          question_text TEXT NOT NULL,
          sort_order INT NOT NULL DEFAULT 0,
          created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
          INDEX idx_question_assessment (assessment_id),
          CONSTRAINT fk_question_assessment
            FOREIGN KEY (assessment_id)
            REFERENCES training_assessments_v2(id)
            ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS training_question_options_v2 (
          id CHAR(36) PRIMARY KEY,
          question_id CHAR(36) NOT NULL,
          option_text TEXT NOT NULL,
          is_correct TINYINT(1) NOT NULL DEFAULT 0,
          sort_order INT NOT NULL DEFAULT 0,
          INDEX idx_option_question (question_id),
          CONSTRAINT fk_option_question
            FOREIGN KEY (question_id)
            REFERENCES training_questions_v2(id)
            ON DELETE CASCADE
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
    await ensureSchema();
    next();
  } catch (error) {
    console.error("TRAINING ASSESSMENT SCHEMA:", error);
    res.status(500).json({
      error: { message: "Erro na estrutura de avaliações" }
    });
  }
});

const validId = value =>
  /^[a-f0-9-]{36}$/i.test(String(value || ""));

const handleError = (res, error) => {
  console.error("TRAINING ASSESSMENTS:", error);
  res.status(500).json({
    error: { message: "Erro ao processar avaliação" }
  });
};

// Listar avaliações de um treinamento
router.get("/courses/:courseId/assessments", async (req, res) => {
  try {
    if (!validId(req.params.courseId)) {
      return res.sendStatus(400);
    }

    const [rows] = await db.execute(`
      SELECT a.*,
        (SELECT COUNT(*)
         FROM training_questions_v2 q
         WHERE q.assessment_id = a.id) AS question_count
      FROM training_assessments_v2 a
      JOIN training_courses_v2 c ON c.id = a.course_id
      WHERE a.course_id = ? AND c.status <> 'archived'
      ORDER BY a.sort_order, a.created_at
    `, [req.params.courseId]);

    res.json({ data: rows });
  } catch (error) {
    handleError(res, error);
  }
});

// Criar atividade ou prova
router.post("/courses/:courseId/assessments", async (req, res) => {
  try {
    const courseId = req.params.courseId;
    const title = String(req.body?.title || "").trim();
    const type = String(req.body?.type || "activity");
    const score = Number(req.body?.passing_score ?? 70);

    if (
      !validId(courseId) ||
      !title ||
      title.length > 255 ||
      !["activity", "exam"].includes(type) ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > 100
    ) {
      return res.status(400).json({
        error: { message: "Dados da avaliação inválidos" }
      });
    }

    const [courses] = await db.execute(`
      SELECT id FROM training_courses_v2
      WHERE id = ? AND status <> 'archived'
      LIMIT 1
    `, [courseId]);

    if (!courses.length) return res.sendStatus(404);

    const lessonId=type==='activity'?String(req.body?.lesson_id||''):null;
    if(type==='activity'&&!validId(lessonId))return res.status(400).json({error:{message:'Selecione a aula vinculada à atividade.'}});
    const conn=await db.getConnection();
    try{
    await conn.beginTransaction();
    const [locked]=await conn.execute("SELECT id FROM training_courses_v2 WHERE id=? AND status<>'archived' FOR UPDATE",[courseId]);
    if(!locked.length){await conn.rollback();return res.sendStatus(404);}
    if(type==='activity'){
      const [lessons]=await conn.execute('SELECT id FROM training_lessons_v2 WHERE id=? AND course_id=?',[lessonId,courseId]);
      if(!lessons.length){await conn.rollback();return res.status(400).json({error:{message:'A aula não pertence ao treinamento.'}});}
      const [existing]=await conn.execute("SELECT id FROM training_assessments_v2 WHERE course_id=? AND lesson_id=? AND type='activity' LIMIT 1",[courseId,lessonId]);
      if(existing.length){await conn.rollback();return res.status(409).json({error:{message:'Esta aula já possui uma atividade.'}});}
    }
    const id = uuid();

    await conn.execute(`
      INSERT INTO training_assessments_v2
      (id, course_id, lesson_id, title, type, passing_score)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, courseId, lessonId, title, type, score]);
    await conn.commit();

    res.status(201).json({
      data: { id, course_id: courseId, lesson_id:lessonId, title, type, passing_score: score }
    });
    }catch(e){await conn.rollback();throw e;}finally{conn.release();}
  } catch (error) {
    handleError(res, error);
  }
});

// Consultar questões e alternativas
router.get("/assessments/:id/questions", async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.sendStatus(400);

    const [questions] = await db.execute(`
      SELECT q.id, q.question_text, q.sort_order, q.explanation
      FROM training_questions_v2 q
      JOIN training_assessments_v2 a ON a.id = q.assessment_id
      JOIN training_courses_v2 c ON c.id = a.course_id
      WHERE q.assessment_id = ? AND c.status <> 'archived'
      ORDER BY q.sort_order, q.created_at, q.id
    `, [req.params.id]);

    for (const question of questions) {
      const [options] = await db.execute(`
        SELECT id, option_text, is_correct, sort_order
        FROM training_question_options_v2
        WHERE question_id = ?
        ORDER BY sort_order,id
      `, [question.id]);

      question.options = options;
    }

    res.json({ data: questions });
  } catch (error) {
    handleError(res, error);
  }
});

// Criar questão com alternativas
router.post("/assessments/:id/questions", async (req, res) => {
  let connection;

  try {
    if (!validId(req.params.id)) return res.sendStatus(400);

    const text = String(req.body?.question_text || "").trim();
    const options = req.body?.options;
    const correctIndex = Number(req.body?.correct_index);

    if (
      !text ||
      !Array.isArray(options) ||
      options.length < 2 ||
      options.length > 6 ||
      !Number.isInteger(correctIndex) ||
      correctIndex < 0 ||
      correctIndex >= options.length ||
      options.some(o => typeof o !== "string" || !o.trim())
    ) {
      return res.status(400).json({
        error: { message: "Informe a pergunta e de 2 a 6 alternativas válidas" }
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const [assessments] = await connection.execute(`
      SELECT a.id FROM training_assessments_v2 a
      JOIN training_courses_v2 c ON c.id = a.course_id
      WHERE a.id = ? AND c.status <> 'archived'
      LIMIT 1 FOR UPDATE
    `, [req.params.id]);

    if (!assessments.length) {
      await connection.rollback();
      return res.sendStatus(404);
    }

    const id = uuid();

    const [existing] = await connection.execute(`
      SELECT COUNT(*) AS total, COALESCE(MAX(sort_order), -1) + 1 AS next_order
      FROM training_questions_v2
      WHERE assessment_id = ?
    `, [req.params.id]);

    if(Number(existing[0].total)>=20){await connection.rollback();return res.status(400).json({error:{message:"Limite de 20 perguntas por avaliação."}});}
    await connection.execute(`
      INSERT INTO training_questions_v2
      (id, assessment_id, question_text, sort_order, explanation)
      VALUES (?, ?, ?, ?, ?)
    `, [id, req.params.id, text, existing[0].next_order, String(req.body?.explanation||"").trim()||null]);

    for (let i = 0; i < options.length; i++) {
      await connection.execute(`
        INSERT INTO training_question_options_v2
        (id, question_id, option_text, is_correct, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `, [
        uuid(), id, options[i].trim(),
        i === correctIndex ? 1 : 0, i
      ]);
    }

    await connection.commit();

    res.status(201).json({
      data: { id, message: "Questão cadastrada" }
    });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    handleError(res, error);
  } finally {
    if (connection) connection.release();
  }
});


const bad=(status,message)=>Object.assign(Error(message),{status});
async function mutate(req,res,action,fn){
 const c=await db.getConnection();
 try{
  await c.beginTransaction();
  const [rows]=await c.execute("SELECT a.* FROM training_assessments_v2 a JOIN training_courses_v2 t ON t.id=a.course_id WHERE a.id=? AND t.status<>'archived' FOR UPDATE",[req.params.id]);
  const a=rows[0];if(!a)throw bad(404,'Avaliação não encontrada.');
  // Legacy answers refer to live question IDs; do not rewrite their historical source.
  const [legacy]=await c.execute("SELECT (EXISTS(SELECT 1 FROM training_activity_sessions_test_v2 WHERE assessment_id=?) OR EXISTS(SELECT 1 FROM training_activity_attempts_test_v2 WHERE assessment_id=?) OR EXISTS(SELECT 1 FROM training_final_journey_v2 WHERE course_id=?)) AS used",[a.id,a.id,a.course_id]);
  if(Number(legacy[0].used))throw bad(409,'Esta avaliação possui histórico legado que depende das questões originais. Edição bloqueada para preservar os resultados.');
  await fn(c,a);
  await c.commit();
  await securityEvent(req.user.id,a.lesson_id,null,'CONFIGURACOES_ALTERADAS',action+': '+a.title);
  res.json({data:{ok:true}});
 }catch(e){await c.rollback();if(e.status)res.status(e.status).json({error:{message:e.message}});else handleError(res,e);}
 finally{c.release();}
}
router.patch('/assessments/:id', (req,res)=>mutate(req,res,'Avaliação editada',async(c,a)=>{
 const title=String(req.body?.title||'').trim(), score=Number(req.body?.passing_score);
 if(!title||title.length>255||!Number.isFinite(score)||score<0||score>100)throw bad(400,'Nome ou nota mínima inválidos.');
 await c.execute('UPDATE training_assessments_v2 SET title=?,passing_score=? WHERE id=?',[title,score,a.id]);
}));
router.patch('/assessments/:id/questions/:questionId',(req,res)=>mutate(req,res,'Pergunta editada',async(c,a)=>{
 const text=String(req.body?.question_text||'').trim(), opts=req.body?.options, correct=Number(req.body?.correct_index);
 if(!text||!Array.isArray(opts)||opts.length<2||opts.length>6||opts.some(o=>typeof o!=='string'||!o.trim())||!Number.isInteger(correct)||correct<0||correct>=opts.length)throw bad(400,'Informe a pergunta e de 2 a 6 alternativas.');
 const [rows]=await c.execute('SELECT id FROM training_questions_v2 WHERE id=? AND assessment_id=? FOR UPDATE',[req.params.questionId,a.id]);if(!rows.length)throw bad(404,'Pergunta não encontrada.');
 await c.execute('UPDATE training_questions_v2 SET question_text=?,explanation=? WHERE id=?',[text,String(req.body?.explanation||'').trim()||null,req.params.questionId]);
 await c.execute('DELETE FROM training_question_options_v2 WHERE question_id=?',[req.params.questionId]);
 for(let i=0;i<opts.length;i++)await c.execute('INSERT INTO training_question_options_v2(id,question_id,option_text,is_correct,sort_order) VALUES (?,?,?,?,?)',[uuid(),req.params.questionId,opts[i].trim(),i===correct?1:0,i]);
}));
router.delete('/assessments/:id/questions/:questionId',(req,res)=>mutate(req,res,'Pergunta excluída',async(c,a)=>{
 const [rows]=await c.execute('SELECT id FROM training_questions_v2 WHERE assessment_id=? ORDER BY sort_order,id FOR UPDATE',[a.id]);
 if(!rows.some(q=>q.id===req.params.questionId))throw bad(404,'Pergunta não encontrada.');
 if(rows.length<=1)throw bad(409,'Mantenha pelo menos uma pergunta na avaliação.');
 await c.execute('DELETE FROM training_question_options_v2 WHERE question_id=?',[req.params.questionId]);
 await c.execute('DELETE FROM training_questions_v2 WHERE id=? AND assessment_id=?',[req.params.questionId,a.id]);
 let i=0;for(const q of rows.filter(q=>q.id!==req.params.questionId))await c.execute('UPDATE training_questions_v2 SET sort_order=? WHERE id=?',[i++,q.id]);
}));
router.put('/assessments/:id/question-order',(req,res)=>mutate(req,res,'Ordem de perguntas alterada',async(c,a)=>{
 const ids=req.body?.ids;const [rows]=await c.execute('SELECT id FROM training_questions_v2 WHERE assessment_id=? FOR UPDATE',[a.id]);
 if(!Array.isArray(ids)||ids.length!==rows.length||new Set(ids).size!==ids.length||ids.some(id=>!rows.some(q=>q.id===id)))throw bad(400,'Ordem de perguntas inválida. Atualize a avaliação.');
 for(let i=0;i<ids.length;i++)await c.execute('UPDATE training_questions_v2 SET sort_order=? WHERE id=? AND assessment_id=?',[i,ids[i],a.id]);
}));

export default router;
