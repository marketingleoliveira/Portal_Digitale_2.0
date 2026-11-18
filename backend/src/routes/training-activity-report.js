import express from 'express';
import { db } from '../database.js';
import { requireAuth } from '../lib/auth.js';

const router = express.Router();

router.use(requireAuth);

router.use((req, res, next) => {
  if (req.user?.role !== 'dev') {
    return res.sendStatus(403);
  }
  next();
});

router.get('/users/:userId/activities', async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!/^[a-f0-9-]{36}$/i.test(userId)) {
      return res.sendStatus(400);
    }

    const [users] = await db.execute(`
      SELECT
        u.id,
        u.email,
        COALESCE(p.full_name,u.email) AS name
      FROM system_users u
      LEFT JOIN profiles p
        ON BINARY p.id=BINARY u.id
      WHERE u.id=?
      LIMIT 1
    `, [userId]);

    if (!users.length) return res.sendStatus(404);

    const [attempts] = await db.execute(`
      SELECT
        t.id,
        t.assessment_id,
        t.score,
        t.passed,
        t.created_at,
        a.title AS activity_title,
        l.title AS lesson_title,
        c.title AS course_title
      FROM training_activity_attempts_test_v2 t
      LEFT JOIN training_assessments_v2 a
        ON BINARY a.id=BINARY t.assessment_id
      LEFT JOIN training_lessons_v2 l
        ON BINARY l.id=BINARY a.lesson_id
      LEFT JOIN training_courses_v2 c
        ON BINARY c.id=BINARY a.course_id
      WHERE t.user_id=?
      ORDER BY t.created_at DESC
    `, [userId]);

    const [sessions] = await db.execute(`
      SELECT
        s.id,
        s.lesson_id,
        s.assessment_id,
        s.status,
        s.question_index,
        s.answers_json,
        s.score,
        s.reason,
        s.created_at,
        s.deadline_at,
        l.title AS lesson_title,
        a.title AS activity_title,
        c.title AS course_title
      FROM training_activity_sessions_test_v2 s
      LEFT JOIN training_lessons_v2 l
        ON BINARY l.id=BINARY s.lesson_id
      LEFT JOIN training_assessments_v2 a
        ON BINARY a.id=BINARY s.assessment_id
      LEFT JOIN training_courses_v2 c
        ON BINARY c.id=BINARY a.course_id
      WHERE s.user_id=?
      ORDER BY s.created_at DESC
      LIMIT 300
    `, [userId]);

    const [events] = await db.execute(`
      SELECT
        e.id,
        e.session_id,
        e.lesson_id,
        e.event_type,
        e.details,
        e.created_at,
        l.title AS lesson_title
      FROM training_security_events_v2 e
      LEFT JOIN training_lessons_v2 l
        ON BINARY l.id=BINARY e.lesson_id
      WHERE e.user_id=?
      ORDER BY e.created_at DESC
      LIMIT 300
    `, [userId]);

    const enriched = [];

    for (const s of sessions) {
      let answers = {};

      try {
        answers = JSON.parse(s.answers_json || '{}');
      } catch {
        answers = {};
      }

      const [questions] = await db.execute(`
        SELECT id, question_text, sort_order
        FROM training_questions_v2
        WHERE assessment_id=?
        ORDER BY sort_order,id
      `, [s.assessment_id]);

      const steps = [];

      for (const q of questions) {
        const [options] = await db.execute(`
          SELECT id,option_text,is_correct
          FROM training_question_options_v2
          WHERE question_id=?
        `, [q.id]);

        const selectedId = answers[q.id] ?? null;

        const selected = options.find(
          o => o.id === selectedId
        );

        steps.push({
          question: q.question_text,
          answered: Object.prototype.hasOwnProperty.call(
            answers, q.id
          ),
          answer: selected?.option_text || null,
          correct: selected
            ? Number(selected.is_correct) === 1
            : null
        });
      }

      enriched.push({
        ...s,
        answers_json: undefined,
        steps,
        answered_questions: Object.keys(answers).length
      });
    }

    // Current commercial course stores immutable question snapshots and answers in v3.
    const [commercial] = await db.execute(`
      SELECT s.id,s.kind,s.status,s.score,s.passed,s.payload_json,s.created_at,s.finished_at,
             l.title AS lesson_title,c.title AS course_title
      FROM training_commercial_sessions_v3 s
      JOIN training_courses_v2 c ON BINARY c.id=BINARY s.course_id
      LEFT JOIN training_lessons_v2 l ON BINARY l.id=BINARY s.lesson_id
      WHERE s.user_id=? AND s.kind IN ('activity','exam')
        AND c.status='published'
      ORDER BY s.created_at DESC
    `,[userId]);
    for(const row of commercial){
      const p=typeof row.payload_json==='string'?JSON.parse(row.payload_json):row.payload_json;
      const answers=p.answers||{};
      const steps=(p.questions||[]).map(q=>{
        const answered=Object.prototype.hasOwnProperty.call(answers,q.id);
        const selected=(q.options||[]).find(o=>o.id===answers[q.id]);
        return {question:q.text,answered,answer:selected?.text??null,correct:selected?Number(selected.is_correct)===1:null};
      });
      const base={id:row.id,course_title:row.course_title,lesson_title:row.lesson_title||(row.kind==='exam'?'Prova final':null),activity_title:p.title||(row.kind==='exam'?'Prova final':'Atividade'),score:row.score==null?null:Number(row.score),created_at:row.created_at};
      enriched.push({...base,status:row.status,reason:p.interruptionReason||null,question_index:Number(p.index||0),answered_questions:steps.filter(q=>q.answered).length,steps});
      if(row.status==='completed'&&row.score!=null)attempts.push({...base,passed:Number(row.passed),created_at:row.finished_at||row.created_at});
      if(row.status==='interrupted')events.push({id:'commercial-'+row.id,session_id:row.id,event_type:'AVALIACAO_INTERROMPIDA',details:p.interruptionReason||null,created_at:row.finished_at||row.created_at,lesson_title:base.lesson_title});
    }
    function newest(a,b){return new Date(b.created_at)-new Date(a.created_at);}
    attempts.sort(newest);enriched.sort(newest);events.sort(newest);
    res.setHeader('Cache-Control','no-store');
    res.json({
      data: {
        user: users[0],
        attempts,
        sessions: enriched,
        events,
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('TRAINING ACTIVITY REPORT:', error);
    res.status(500).json({
      error: {
        message: 'Erro ao consultar atividades.'
      }
    });
  }
});

export default router;
