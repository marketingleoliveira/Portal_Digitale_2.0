import express from "express";
import crypto from "node:crypto";
import { db } from "../database.js";
import { requireAuth } from "../lib/auth.js";
import {
  securityRouter,
  ensureSecurity,
  getSecurityPolicy,
  securityEvent,
  shuffled
} from "./training-security-test.js";

const router = express.Router();
const COURSE = "297fc0fd-694a-4de4-831d-517b447b34cb";
const LIMIT = 60;
const HEARTBEAT_LIMIT = 45;

router.use(requireAuth);
router.use("/security", securityRouter);

async function setup() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS training_activity_sessions_test_v2 (
      id CHAR(36) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      lesson_id CHAR(36) NOT NULL,
      assessment_id CHAR(36) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      question_index INT NOT NULL DEFAULT 0,
      deadline_at DATETIME(3) NOT NULL,
      heartbeat_at DATETIME(3) NOT NULL,
      answers_json LONGTEXT NOT NULL,
      score INT NULL,
      reason VARCHAR(255) NULL,
      released_by CHAR(36) NULL,
      created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_user_lesson (user_id, lesson_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS training_activity_locks_test_v2 (
      user_id CHAR(36) PRIMARY KEY,
      course_id CHAR(36) NOT NULL,
      reason VARCHAR(255) NOT NULL,
      locked_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_course (course_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS training_activity_attempts_test_v2 (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      assessment_id VARCHAR(36) NOT NULL,
      score INT NOT NULL,
      passed TINYINT(1) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_training_attempt_user (user_id, assessment_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

const allowed = req =>
  req.user?.role === "dev" && Boolean(req.user?.id);

async function lock(userId, reason) {
  await db.execute(`
    INSERT INTO training_activity_locks_test_v2
      (user_id, course_id, reason)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE
      reason = VALUES(reason),
      locked_at = NOW(3)
  `, [userId, COURSE, reason]);

  await db.execute(`
    UPDATE training_activity_sessions_test_v2
    SET status='blocked', active_slot=NULL, reason=?
    WHERE user_id=? AND status='active'
  `, [reason, userId]);
}

async function locked(userId) {
  const [rows] = await db.execute(`
    SELECT reason, locked_at
    FROM training_activity_locks_test_v2
    WHERE user_id=? AND course_id=?
    LIMIT 1
  `, [userId, COURSE]);

  return rows[0] || null;
}

async function lessonAccess(userId, lessonId) {
  const [lessons] = await db.execute(`
    SELECT id FROM training_lessons_v2
    WHERE course_id=?
    ORDER BY sort_order, created_at, id
  `, [COURSE]);

  const index = lessons.findIndex(l => l.id === lessonId);
  if (index < 0) return false;

  const [videos] = await db.execute(`
    SELECT lesson_id FROM training_lesson_progress_v2
    WHERE user_id=? AND lesson_id=?
  `, [userId, lessonId]);

  if (!videos.length) return false;

  const [passed] = await db.execute(`
    SELECT DISTINCT a.lesson_id
    FROM training_activity_attempts_test_v2 t
    JOIN training_assessments_v2 a
      ON a.id=t.assessment_id
    WHERE t.user_id=? AND t.passed=1
      AND a.course_id=? AND a.type='activity'
  `, [userId, COURSE]);

  const done = new Set(passed.map(x => x.lesson_id));

  return lessons.slice(0, index).every(
    l => done.has(l.id)
  );
}

async function assessment(lessonId) {
  const [rows] = await db.execute(`
    SELECT id, title FROM training_assessments_v2
    WHERE course_id=? AND lesson_id=?
      AND type='activity'
    LIMIT 1
  `, [COURSE, lessonId]);

  return rows[0] || null;
}

async function question(
  assessmentId, index, sessionId = '', policy = {}
) {
  const [rows] = await db.execute(`
    SELECT id, question_text
    FROM training_questions_v2
    WHERE assessment_id=?
    ORDER BY sort_order, id
  `, [assessmentId]);

  const ordered = shuffled(
    rows, sessionId, policy.shuffle_questions
  );
  const q = ordered[index];
  if (!q) return null;

  const [options] = await db.execute(`
    SELECT id, option_text
    FROM training_question_options_v2
    WHERE question_id=?
    ORDER BY sort_order, id
  `, [q.id]);

  return {
    id: q.id,
    text: q.question_text,
    options: shuffled(
      options,
      sessionId + ':' + q.id,
      policy.shuffle_options
    ).map(x => ({
      id: x.id,
      text: x.option_text
    }))
  };
}

async function activeSession(userId) {
  const [rows] = await db.execute(`
    SELECT id FROM training_activity_sessions_test_v2
    WHERE user_id=? AND status='active'
    ORDER BY created_at DESC
    LIMIT 1
  `, [userId]);

  return rows[0] || null;
}

function respondBlocked(res, reason) {
  return res.status(423).json({
    error: {
      code: "TRAINING_BLOCKED",
      message: "Tentativa de Burlar Detectada",
      reason
    }
  });
}

// ADM ou DEV: liberar uma conta bloqueada.
router.post("/admin/unlock/:userId", async (req, res) => {
  try {
    if (!["admin", "dev"].includes(req.user?.role)) {
      return res.sendStatus(403);
    }

    await setup();

    const userId = req.params.userId;

    const [users] = await db.execute(`
      SELECT id FROM system_users WHERE id=? LIMIT 1
    `, [userId]);

    if (!users.length) return res.sendStatus(404);

    const current = await locked(userId);

    if (!current) {
      return res.status(409).json({
        error: { message: "Usuário não está bloqueado." }
      });
    }

    await db.execute(`
      UPDATE training_activity_sessions_test_v2
      SET status='released',
          active_slot=NULL,
          released_by=?
      WHERE user_id=? AND status IN ('active','blocked')
    `, [req.user.id, userId]);

    await db.execute(`
      DELETE FROM training_activity_locks_test_v2
      WHERE user_id=? AND course_id=?
    `, [userId, COURSE]);

    await securityEvent(
      userId, null, null,
      'DESBLOQUEIO_ADMINISTRATIVO',
      `Liberado por ${req.user.email || req.user.id}`
    );

    console.info(
      "TRAINING ADMIN UNLOCK",
      req.user.id,
      userId
    );

    res.json({ data: { unlocked: true } });
  } catch (error) {
    console.error("TRAINING UNLOCK:", error);
    res.sendStatus(500);
  }
});


// DIGITALE_DEV_LOCKS_LIST_V2
router.get("/admin/blocked", async (req, res) => {
  try {
    if (req.user?.role !== "dev") {
      return res.sendStatus(403);
    }

    await setup();

    const [rows] = await db.execute(`
      SELECT
        l.user_id,
        u.email,
        COALESCE(p.full_name, u.email) AS user_name,
        l.reason,
        l.locked_at,
        s.lesson_id,
        a.title AS lesson_title
      FROM training_activity_locks_test_v2 l
      JOIN system_users u
        ON BINARY u.id=BINARY l.user_id
      LEFT JOIN profiles p
        ON BINARY p.id=BINARY l.user_id
      LEFT JOIN training_activity_sessions_test_v2 s
        ON s.id=(
          SELECT x.id
          FROM training_activity_sessions_test_v2 x
          WHERE BINARY x.user_id=BINARY l.user_id
          ORDER BY x.created_at DESC, x.id DESC
          LIMIT 1
        )
      LEFT JOIN training_lessons_v2 a
        ON BINARY a.id=BINARY s.lesson_id
      WHERE l.course_id=?
      ORDER BY l.locked_at DESC
    `, [COURSE]);

    res.json({
      data: { total: rows.length, users: rows }
    });
  } catch (error) {
    console.error("TRAINING DEV LOCKS:", error);
    res.sendStatus(500);
  }
});

router.use((req, res, next) => {
  if (!allowed(req)) return res.sendStatus(403);
  next();
});

router.get("/courses/:courseId/progress", async (req, res) => {
  try {
    if (req.params.courseId !== COURSE) return res.sendStatus(404);
    await setup();

    const [rows] = await db.execute(`
      SELECT DISTINCT a.lesson_id
      FROM training_activity_attempts_test_v2 t
      JOIN training_assessments_v2 a ON a.id=t.assessment_id
      WHERE t.user_id=? AND t.passed=1
        AND a.course_id=? AND a.type='activity'
    `, [req.user.id, COURSE]);

    res.json({
      data: {
        passed_lesson_ids: rows.map(x => x.lesson_id),
        blocked: Boolean(await locked(req.user.id))
      }
    });
  } catch (error) {
    console.error("TRAINING PROGRESS:", error);
    res.sendStatus(500);
  }
});

router.get("/lessons/:lessonId/status", async (req, res) => {
  try {
    await setup();

    const blocked = await locked(req.user.id);
    if (blocked) return respondBlocked(res, blocked.reason);

    const previous = await activeSession(req.user.id);

    // Retorno após interrupção de uma sessão iniciada.
    if (previous) {
      await lock(req.user.id, "Avaliação interrompida ou reaberta.");
      return respondBlocked(
        res,
        "Avaliação interrompida ou reaberta."
      );
    }

    if (!await lessonAccess(req.user.id, req.params.lessonId)) {
      return res.sendStatus(403);
    }

    const a = await assessment(req.params.lessonId);
    if (!a) return res.sendStatus(404);

    const policy = await getSecurityPolicy(COURSE);

    const [passed] = await db.execute(`
      SELECT id FROM training_activity_attempts_test_v2
      WHERE user_id=? AND assessment_id=? AND passed=1
      LIMIT 1
    `, [req.user.id, a.id]);

    res.json({
      data: {
        title: a.title,
        already_passed: passed.length > 0,
        seconds_per_question: policy.seconds_per_question,
        settings: policy
      }
    });
  } catch (error) {
    console.error("TRAINING STATUS:", error);
    res.sendStatus(500);
  }
});

router.post("/lessons/:lessonId/start", async (req, res) => {
  try {
    await setup();

    const blocked = await locked(req.user.id);
    if (blocked) return respondBlocked(res, blocked.reason);

    if (await activeSession(req.user.id)) {
      await lock(req.user.id, "Tentativa de reiniciar avaliação ativa.");
      return respondBlocked(
        res,
        "Tentativa de reiniciar avaliação ativa."
      );
    }

    if (!await lessonAccess(req.user.id, req.params.lessonId)) {
      return res.sendStatus(403);
    }

    const a = await assessment(req.params.lessonId);
    if (!a) return res.sendStatus(404);

    const policy = await getSecurityPolicy(COURSE);

    const [passed] = await db.execute(`
      SELECT id FROM training_activity_attempts_test_v2
      WHERE user_id=? AND assessment_id=? AND passed=1
      LIMIT 1
    `, [req.user.id, a.id]);

    if (passed.length) return res.status(409).json({
      error: { message: "Atividade já aprovada." }
    });

    const [count] = await db.execute(`
      SELECT COUNT(*) AS total FROM training_questions_v2
      WHERE assessment_id=?
    `, [a.id]);

    if (Number(count[0].total) !== 10) {
      return res.status(409).json({
        error: { message: "A atividade precisa de 10 questões." }
      });
    }

    await ensureSecurity();
    const id = crypto.randomUUID();

    await db.execute(`
      INSERT INTO training_activity_sessions_test_v2
        (id,user_id,lesson_id,assessment_id,status,
         question_index,deadline_at,heartbeat_at,
         answers_json,policy_json,active_slot)
      VALUES (?,?,?,?,'active',0,
              DATE_ADD(NOW(3),INTERVAL ? SECOND),
              NOW(3),'{}',?,?)
    `, [
      id, req.user.id, req.params.lessonId, a.id,
      policy.seconds_per_question,
      JSON.stringify(policy),
      policy.prevent_multiple_sessions ? req.user.id : null
    ]);

    await securityEvent(
      req.user.id, req.params.lessonId, id,
      'AVALIACAO_INICIADA'
    );

    res.json({
      data: {
        session_id: id,
        index: 0,
        total: 10,
        remaining_ms: policy.seconds_per_question * 1000,
        settings: policy,
        question: await question(a.id, 0, id, policy)
      }
    });
  } catch (error) {
    console.error("TRAINING START:", error);
    res.sendStatus(500);
  }
});

router.post("/sessions/:id/heartbeat", async (req, res) => {
  try {
    const [result] = await db.execute(`
      UPDATE training_activity_sessions_test_v2
      SET heartbeat_at=NOW(3)
      WHERE id=? AND user_id=? AND status='active'
        AND heartbeat_at >= DATE_SUB(
          NOW(3), INTERVAL 45 SECOND
        )
    `, [req.params.id, req.user.id]);

    if (!result.affectedRows) {
      await lock(req.user.id, "Sessão supervisionada interrompida.");
      return respondBlocked(
        res,
        "Sessão supervisionada interrompida."
      );
    }

    res.json({ data: { ok: true } });
  } catch (error) {
    console.error("TRAINING HEARTBEAT:", error);
    res.sendStatus(500);
  }
});

router.post("/sessions/:id/violation", async (req, res) => {
  try {
    const reasons = new Set([
      "SAIDA_TELA_CHEIA",
      "TROCA_DE_ABA",
      "GUIA_FECHADA",
      "NAVEGACAO"
    ]);

    const reason = reasons.has(req.body?.reason)
      ? req.body.reason
      : "INTERRUPCAO";

    const [rows] = await db.execute(`
      SELECT id,lesson_id,policy_json FROM training_activity_sessions_test_v2
      WHERE id=? AND user_id=? AND status='active'
      LIMIT 1
    `, [req.params.id, req.user.id]);

    if (!rows.length) return res.sendStatus(409);

    const policy=rows[0].policy_json ? JSON.parse(rows[0].policy_json) : await getSecurityPolicy(COURSE);
    if ((reason==='SAIDA_TELA_CHEIA'&&!policy.require_fullscreen)||(reason==='TROCA_DE_ABA'&&!policy.detect_tab_change)||(['GUIA_FECHADA','NAVEGACAO'].includes(reason)&&!policy.detect_navigation))return res.status(409).json({error:{message:'Monitoramento desativado.'}});
    await securityEvent(
      req.user.id, rows[0].lesson_id,
      req.params.id, reason
    );

    await lock(req.user.id, reason);

    res.json({ data: { blocked: true } });
  } catch (error) {
    console.error("TRAINING VIOLATION:", error);
    res.sendStatus(500);
  }
});

router.post("/sessions/:id/answer", async (req, res) => {
  try {
    await setup();

    const blocked = await locked(req.user.id);
    if (blocked) return respondBlocked(res, blocked.reason);

    const [rows] = await db.execute(`
      SELECT *,
        UNIX_TIMESTAMP(deadline_at)*1000 AS deadline_ms,
        UNIX_TIMESTAMP(heartbeat_at)*1000 AS heartbeat_ms
      FROM training_activity_sessions_test_v2
      WHERE id=? AND user_id=?
      LIMIT 1
    `, [req.params.id, req.user.id]);

    const s = rows[0];

    if (!s || s.status !== "active") {
      return res.sendStatus(409);
    }

    if (
      Date.now() - Number(s.heartbeat_ms) >
      HEARTBEAT_LIMIT * 1000
    ) {
      await lock(req.user.id, "Sessão supervisionada interrompida.");
      return respondBlocked(
        res,
        "Sessão supervisionada interrompida."
      );
    }

    if (Number(req.body?.index) !== s.question_index) {
      await securityEvent(
        req.user.id, s.lesson_id, s.id,
        'SEQUENCIA_INVALIDA'
      );
      return res.sendStatus(409);
    }

    const policy = s.policy_json
      ? JSON.parse(s.policy_json)
      : await getSecurityPolicy(COURSE);

    const q = await question(
      s.assessment_id, s.question_index, s.id, policy
    );
    if (!q) return res.sendStatus(409);

    let selected = req.body?.option_id ?? null;

    // Expirou: registra resposta em branco.
    if (Date.now() > Number(s.deadline_ms)) {
      selected = null;
    }

    if (
      selected !== null &&
      !q.options.some(o => o.id === selected)
    ) {
      return res.sendStatus(400);
    }

    const answers = JSON.parse(s.answers_json);
    answers[q.id] = selected;

    const elapsed = Date.now() -
      (Number(s.deadline_ms) -
       policy.seconds_per_question * 1000);

    if (
      policy.detect_fast_answers &&
      selected !== null &&
      elapsed >= 0 &&
      elapsed < 1500
    ) {
      await securityEvent(
        req.user.id, s.lesson_id, s.id,
        'RESPOSTA_MUITO_RAPIDA',
        `Questao ${s.question_index + 1}: ${elapsed}ms`
      );
    }

    const nextIndex = s.question_index + 1;

    if (nextIndex < 10) {
      const [updated] = await db.execute(`
        UPDATE training_activity_sessions_test_v2
        SET answers_json=?,
            question_index=?,
            deadline_at=DATE_ADD(
              NOW(3), INTERVAL ? SECOND
            ),
            heartbeat_at=NOW(3)
        WHERE id=? AND user_id=? AND status='active'
          AND question_index=?
      `, [
        JSON.stringify(answers),
        nextIndex,
        policy.seconds_per_question,
        s.id,
        req.user.id,
        s.question_index
      ]);

      if (!updated.affectedRows) return res.sendStatus(409);

      return res.json({
        data: {
          completed: false,
          index: nextIndex,
          remaining_ms: policy.seconds_per_question * 1000,
          question: await question(
            s.assessment_id, nextIndex, s.id, policy
          )
        }
      });
    }

    const [correctOptions] = await db.execute(`
      SELECT q.id AS question_id, o.id AS option_id
      FROM training_questions_v2 q
      JOIN training_question_options_v2 o
        ON o.question_id=q.id
      WHERE q.assessment_id=? AND o.is_correct=1
    `, [s.assessment_id]);

    const correct = correctOptions.filter(
      x => answers[x.question_id] === x.option_id
    ).length;

    const score = correct * 10;
    const passed = score >= 80;

    const [updated] = await db.execute(`
      UPDATE training_activity_sessions_test_v2
      SET status='completed',
          active_slot=NULL,
          answers_json=?, score=?
      WHERE id=? AND user_id=? AND status='active'
        AND question_index=?
    `, [
      JSON.stringify(answers),
      score,
      s.id,
      req.user.id,
      s.question_index
    ]);

    if (!updated.affectedRows) return res.sendStatus(409);

    await db.execute(`
      INSERT INTO training_activity_attempts_test_v2
        (id,user_id,assessment_id,score,passed)
      VALUES (?,?,?,?,?)
    `, [
      crypto.randomUUID(),
      req.user.id,
      s.assessment_id,
      score,
      passed ? 1 : 0
    ]);

    await securityEvent(
      req.user.id, s.lesson_id, s.id,
      'AVALIACAO_CONCLUIDA',
      `Nota ${score}%`
    );

    res.json({
      data: {
        completed: true,
        correct,
        total: 10,
        score,
        passed
      }
    });
  } catch (error) {
    console.error("TRAINING ANSWER:", error);
    res.sendStatus(500);
  }
});

// Bloqueia o antigo envio das dez respostas sem supervisão.
router.post("/lessons/:lessonId/submit", (_req, res) => {
  res.status(410).json({
    error: { message: "Use a avaliação supervisionada." }
  });
});

// Compatibilidade: não disponibilizar o fluxo antigo de questões.
router.get("/lessons/:lessonId/activity", (_req, res) => {
  res.status(410).json({
    error: { message: "Use a avaliação supervisionada." }
  });
});

export default router;
