import express from 'express';
import crypto from 'node:crypto';
import { db } from '../database.js';

export const securityRouter = express.Router();

const COURSE = '297fc0fd-694a-4de4-831d-517b447b34cb';

const DEFAULTS = Object.freeze({
  require_fullscreen: true,
  detect_tab_change: true,
  detect_navigation: true,
  prevent_copy: true,
  shuffle_questions: true,
  shuffle_options: true,
  detect_fast_answers: true,
  prevent_multiple_sessions: true,
  seconds_per_question: 60
});

export function normalizeSecurityPolicy(input, base = DEFAULTS, allowUnlimited = false) {
  if (input == null) input = {};
  if (typeof input !== 'object' || Array.isArray(input)) throw Object.assign(Error('Configurações inválidas'), {status:400});
  const next = {};
  for (const key of Object.keys(DEFAULTS)) {
    const value = input[key] ?? base[key];
    if (key === 'seconds_per_question') {
      if (!(allowUnlimited ? [0,30,45,60,90] : [30,45,60,90]).includes(value)) throw Object.assign(Error('Tempo inválido'), {status:400});
    } else if (typeof value !== 'boolean') throw Object.assign(Error('Configuração inválida: '+key), {status:400});
    next[key] = value;
  }
  return next;
}

let prepared;

export async function ensureSecurity() {
  if (!prepared) {
    prepared = (async () => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS training_security_settings_v2 (
          id VARCHAR(30) PRIMARY KEY,
          settings_json LONGTEXT NOT NULL,
          updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS training_security_events_v2 (
          id CHAR(36) PRIMARY KEY,
          user_id VARCHAR(64) NOT NULL,
          lesson_id VARCHAR(64) NULL,
          session_id VARCHAR(64) NULL,
          event_type VARCHAR(70) NOT NULL,
          details VARCHAR(255) NULL,
          created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
          INDEX idx_security_user (user_id),
          INDEX idx_security_time (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      const [columns] = await db.execute(`
        SHOW COLUMNS FROM training_activity_sessions_test_v2
      `);

      const fields = new Set(columns.map(x => x.Field));

      if (!fields.has('policy_json')) {
        await db.execute(`
          ALTER TABLE training_activity_sessions_test_v2
          ADD COLUMN policy_json LONGTEXT NULL
        `);
      }

      if (!fields.has('active_slot')) {
        await db.execute(`
          ALTER TABLE training_activity_sessions_test_v2
          ADD COLUMN active_slot VARCHAR(64) NULL,
          ADD UNIQUE KEY unique_training_active_slot (active_slot)
        `);
      }
    })().catch(error => {
      prepared = null;
      throw error;
    });
  }

  return prepared;
}

export async function getSecurityPolicy(courseId = null) {
  if (courseId) {
    const [courses] = await db.execute("SELECT security_policy_json FROM training_courses_v2 WHERE id=?", [courseId]);
    if (!courses.length || !courses[0].security_policy_json) throw Error("Política individual indisponível");
    return normalizeSecurityPolicy(JSON.parse(courses[0].security_policy_json), DEFAULTS, true);
  }
  await ensureSecurity();

  const [rows] = await db.execute(`
    SELECT settings_json
    FROM training_security_settings_v2
    WHERE id='main'
    LIMIT 1
  `);

  let saved = {};

  try {
    if (rows.length) saved = JSON.parse(rows[0].settings_json);
  } catch {
    saved = {};
  }

  return { ...DEFAULTS, ...saved };
}

export async function securityEvent(
  userId, lessonId, sessionId, type, details = ''
) {
  try {
    await ensureSecurity();

    await db.execute(`
      INSERT INTO training_security_events_v2
      (id,user_id,lesson_id,session_id,event_type,details)
      VALUES (?,?,?,?,?,?)
    `, [
      crypto.randomUUID(),
      String(userId),
      lessonId || null,
      sessionId || null,
      String(type).slice(0, 70),
      String(details).slice(0, 255)
    ]);
  } catch (error) {
    console.error('TRAINING SECURITY AUDIT:', error);
  }
}

function devOnly(req, res, next) {
  if (req.user?.role !== 'dev') return res.sendStatus(403);
  next();
}

securityRouter.get('/settings', devOnly, async (_req, res) => {
  try {
    res.json({ data: await getSecurityPolicy() });
  } catch (error) {
    console.error('SECURITY SETTINGS:', error);
    res.sendStatus(500);
  }
});

securityRouter.put('/settings', devOnly, async (req, res) => {
  try {
    const current = await getSecurityPolicy();
    const next = {};

    for (const [key, defaultValue] of Object.entries(DEFAULTS)) {
      const input = req.body?.[key];

      if (key === 'seconds_per_question') {
        const seconds = Number(input ?? current[key]);

        if (![30, 45, 60, 90].includes(seconds)) {
          return res.status(400).json({
            error: { message: 'Tempo inválido.' }
          });
        }

        next[key] = seconds;
      } else {
        next[key] = typeof input === 'boolean'
          ? input
          : current[key] ?? defaultValue;
      }
    }

    await db.execute(`
      INSERT INTO training_security_settings_v2
      (id,settings_json,updated_at)
      VALUES ('main',?,NOW(3))
      ON DUPLICATE KEY UPDATE
      settings_json=VALUES(settings_json),
      updated_at=NOW(3)
    `, [JSON.stringify(next)]);

    await securityEvent(
      req.user.id, null, null,
      'CONFIGURACOES_ALTERADAS',
      'Configurações de avaliações atualizadas pelo DEV'
    );

    res.json({ data: next });
  } catch (error) {
    console.error('SECURITY SAVE:', error);
    res.sendStatus(500);
  }
});

securityRouter.get('/events', devOnly, async (_req, res) => {
  try {
    await ensureSecurity();

    const [rows] = await db.execute(`
      SELECT e.id, e.user_id, e.lesson_id,
             e.event_type, e.details, e.created_at,
             u.email,
             COALESCE(p.full_name,u.email) AS user_name,
             l.title AS lesson_title
      FROM training_security_events_v2 e
      LEFT JOIN system_users u
        ON BINARY u.id=BINARY e.user_id
      LEFT JOIN profiles p
        ON BINARY p.id=BINARY e.user_id
      LEFT JOIN training_lessons_v2 l
        ON BINARY l.id=BINARY e.lesson_id
      ORDER BY e.created_at DESC
      LIMIT 200
    `);

    res.json({ data: rows });
  } catch (error) {
    console.error('SECURITY EVENTS:', error);
    res.sendStatus(500);
  }
});

// Read-only consolidated history. Security enforcement remains unchanged.
securityRouter.get('/history', devOnly, async (_req, res) => {
  try {
    const [tables] = await db.query("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'training_%'");
    const exists = new Set(tables.map(t => t.name));
    const events = [];
    const read = async (table, sql) => {
      if (!exists.has(table)) return;
      const [rows] = await db.query(sql);
      events.push(...rows);
    };
    const common = " LEFT JOIN system_users u ON BINARY u.id=BINARY e.user_id LEFT JOIN profiles p ON BINARY p.id=BINARY e.user_id ";
    const identity = "e.user_id, COALESCE(p.full_name,u.email,e.user_id) AS user_name, u.email";
    await read('training_security_events_v2', `SELECT CONCAT('security-',e.id) AS id, ${identity}, l.title AS lesson_title, c.title AS course_title, e.event_type,e.details,e.created_at, NULL AS score, CASE WHEN e.event_type IN ('AVALIACAO_INICIADA','AVALIACAO_CONCLUIDA','DESBLOQUEIO_ADMINISTRATIVO','PROVA_FINAL_LIBERADA_POR_DEV','CONFIGURACOES_ALTERADAS') THEN 'managerial' ELSE 'security' END AS category FROM training_security_events_v2 e ${common} LEFT JOIN training_lessons_v2 l ON BINARY l.id=BINARY e.lesson_id LEFT JOIN training_courses_v2 c ON BINARY c.id=BINARY l.course_id ORDER BY e.created_at DESC`);
    await read('training_commercial_video_progress_v3', `SELECT CONCAT('video-',e.user_id,'-',e.lesson_id) AS id,${identity},l.title AS lesson_title,c.title AS course_title,'VIDEOAULA_CONCLUIDA' AS event_type,NULL AS details,e.completed_at AS created_at,NULL AS score,'managerial' AS category FROM training_commercial_video_progress_v3 e ${common} LEFT JOIN training_lessons_v2 l ON BINARY l.id=BINARY e.lesson_id LEFT JOIN training_courses_v2 c ON BINARY c.id=BINARY l.course_id`);
    if (exists.has('training_commercial_sessions_v3')) {
      const [rows] = await db.query(`SELECT e.id,${identity},l.title AS lesson_title,c.title AS course_title,e.kind,e.status,e.score,e.passed,e.created_at,e.finished_at,JSON_UNQUOTE(JSON_EXTRACT(e.payload_json,'$.interruptionReason')) AS reason FROM training_commercial_sessions_v3 e ${common} LEFT JOIN training_lessons_v2 l ON BINARY l.id=BINARY e.lesson_id LEFT JOIN training_courses_v2 c ON BINARY c.id=BINARY e.course_id`);
      for (const r of rows) {
        const base = {user_id:r.user_id,user_name:r.user_name,email:r.email,lesson_title:r.lesson_title,course_title:r.course_title};
        const prefix = r.kind === 'exam' ? 'PROVA_FINAL' : 'ATIVIDADE';
        if (['activity','exam'].includes(r.kind)) {
          events.push({...base,id:'start-'+r.id,event_type:prefix+'_INICIADA',created_at:r.created_at,category:'managerial'});
          if (r.status==='completed') {
            events.push({...base,id:'finish-'+r.id,event_type:prefix+'_FINALIZADA',created_at:r.finished_at,score:r.score,category:'managerial'});
            if (r.kind==='exam' && Number(r.passed)===1) events.push({...base,id:'pass-'+r.id,event_type:'TREINAMENTO_CONCLUIDO',created_at:r.finished_at,score:r.score,category:'managerial'});
          }
        }
        if (r.status==='interrupted') events.push({...base,id:'interrupt-'+r.id,event_type:r.kind==='video'?'VIDEO_INTERROMPIDO':prefix+'_INTERROMPIDA',created_at:r.finished_at,details:r.reason,category:'security'});
      }
    }
    if (exists.has('training_final_journey_v2')) {
      const [rows] = await db.query(`SELECT e.id,${identity},c.title AS course_title,e.started_at,e.finished_at,e.status,e.score FROM training_final_journey_v2 e ${common} LEFT JOIN training_courses_v2 c ON BINARY c.id=BINARY e.course_id`);
      for (const r of rows) {
        const base={user_id:r.user_id,user_name:r.user_name,email:r.email,course_title:r.course_title,category:'managerial'};
        events.push({...base,id:'legacy-start-'+r.id,event_type:'PROVA_FINAL_INICIADA',created_at:r.started_at});
        if(r.status==='completed') events.push({...base,id:'legacy-finish-'+r.id,event_type:'PROVA_FINAL_FINALIZADA',created_at:r.finished_at,score:r.score});
      }
    }
    await read('training_final_certificates_journey_v2', `SELECT CONCAT('certificate-',e.id) AS id,${identity},e.course_title,'TREINAMENTO_CONCLUIDO' AS event_type,e.issued_at AS created_at,e.score,'managerial' AS category FROM training_final_certificates_journey_v2 e ${common}`);
    await read('training_progress_reset_audit_v1', `SELECT CONCAT('reset-',e.id) AS id,${identity},c.title AS course_title,'RESET_DE_PROGRESSO' AS event_type,CONCAT('Responsável: ',COALESCE(ap.full_name,au.email,e.actor_id)) AS details,e.created_at,'managerial' AS category FROM training_progress_reset_audit_v1 e ${common} LEFT JOIN training_courses_v2 c ON BINARY c.id=BINARY e.course_id LEFT JOIN system_users au ON BINARY au.id=BINARY e.actor_id LEFT JOIN profiles ap ON BINARY ap.id=BINARY e.actor_id`);
    events.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)||String(b.id).localeCompare(String(a.id)));
    res.setHeader('Cache-Control','no-store');
    res.json({data:events});
  } catch (error) {
    console.error('TRAINING HISTORY:',error.code||error.message);
    res.sendStatus(500);
  }
});

securityRouter.post('/event', async (req, res) => {
  try {
    await ensureSecurity();

    const type = String(req.body?.type || '');

    const allowed = new Set([
      'COPIA_BLOQUEADA',
      'COLAGEM_BLOQUEADA',
      'IMPRESSAO_BLOQUEADA',
      'MENU_CONTEXTO_BLOQUEADO'
    ]);

    if (!allowed.has(type)) return res.sendStatus(400);

    const sessionId = String(req.body?.session_id || '');

    const [rows] = await db.execute(`
      SELECT lesson_id
      FROM training_activity_sessions_test_v2
      WHERE id=? AND user_id=? AND status='active'
      LIMIT 1
    `, [sessionId, req.user.id]);

    if (!rows.length) return res.sendStatus(409);

    await securityEvent(
      req.user.id,
      rows[0].lesson_id,
      sessionId,
      type
    );

    res.json({ data: { recorded: true } });
  } catch (error) {
    console.error('SECURITY EVENT:', error);
    res.sendStatus(500);
  }
});

export function shuffled(items, sessionId, enabled) {
  if (!enabled) return items;

  const hash = value => crypto
    .createHash('sha256')
    .update(`${sessionId}:${value}`)
    .digest('hex');

  return [...items].sort(
    (a, b) => hash(a.id).localeCompare(hash(b.id))
  );
}
