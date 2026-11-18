import express from "express";
import { db } from "../database.js";
import { requireAuth } from "../lib/auth.js";
import { ensureProgressSchema } from "./training-progress-v2.js";
import { ensureTrainingSchema } from "./training-v2.js";

const router = express.Router();

const TEST_COURSE =
  "297fc0fd-694a-4de4-831d-517b447b34cb";

router.use(requireAuth);

router.use((req, res, next) => {
  if (req.user?.role !== "dev" || !req.user?.id) {
    return res.sendStatus(403);
  }
  next();
});

router.use(async (_req, res, next) => {
  try {
    await ensureTrainingSchema();
    await ensureProgressSchema();
    next();
  } catch (error) {
    console.error("JOURNEY SCHEMA:", error);
    res.sendStatus(500);
  }
});

async function getLessons(courseId) {
  const [rows] = await db.execute(`
    SELECT l.id, l.sort_order
    FROM training_lessons_v2 l
    JOIN training_courses_v2 c ON c.id = l.course_id
    WHERE l.course_id = ?
      AND c.status IN ('draft', 'published')
    ORDER BY l.sort_order, l.created_at, l.id
  `, [courseId]);

  return rows;
}

async function getCompleted(userId, courseId) {
  const [rows] = await db.execute(`
    SELECT lp.lesson_id
    FROM training_lesson_progress_v2 lp
    JOIN training_lessons_v2 l ON l.id = lp.lesson_id
    WHERE lp.user_id = ?
      AND l.course_id = ?
  `, [userId, courseId]);

  return rows.map(row => row.lesson_id);
}

router.get("/courses/:courseId/progress", async (req, res) => {
  try {
    if (req.params.courseId !== TEST_COURSE) {
      return res.sendStatus(404);
    }

    const lessons = await getLessons(TEST_COURSE);
    const completed = await getCompleted(
      req.user.id,
      TEST_COURSE
    );

    const done = new Set(completed);
    const next = lessons.find(lesson => !done.has(lesson.id));

    res.json({
      data: {
        completed_lesson_ids: completed,
        current_lesson_id:
          next?.id || lessons.at(-1)?.id || null,
        total_lessons: lessons.length,
        completed_lessons: completed.length
      }
    });
  } catch (error) {
    console.error("JOURNEY GET:", error);
    res.sendStatus(500);
  }
});

// Registro da conclusão recebido do player.
// Ainda não é uma atestação independente do vídeo.
router.post(
  "/courses/:courseId/lessons/:lessonId/complete",
  async (req, res) => {
    try {
      if (req.params.courseId !== TEST_COURSE) {
        return res.sendStatus(404);
      }

      const lessons = await getLessons(TEST_COURSE);
      const index = lessons.findIndex(
        lesson => lesson.id === req.params.lessonId
      );

      if (index < 0) return res.sendStatus(404);

      const completed = await getCompleted(
        req.user.id,
        TEST_COURSE
      );

      const done = new Set(completed);

      if (lessons.slice(0, index).some(
        lesson => !done.has(lesson.id)
      )) {
        return res.status(409).json({
          error: {
            message: "Conclua as aulas anteriores primeiro."
          }
        });
      }

      await db.execute(`
        INSERT INTO training_lesson_progress_v2
          (user_id, lesson_id)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE
          completed_at = completed_at
      `, [req.user.id, req.params.lessonId]);

      const updated = await getCompleted(
        req.user.id,
        TEST_COURSE
      );

      res.json({
        data: {
          completed_lesson_ids: updated
        }
      });
    } catch (error) {
      console.error("JOURNEY COMPLETE:", error);
      res.sendStatus(500);
    }
  }
);


// DIGITALE_TEST_SKIP_MARKETING_V1
// Exceção de laboratório: somente DEV e e-mail autorizado.
router.post(
  "/courses/:courseId/lessons/:lessonId/test-skip",
  async (req, res) => {
    try {
      if (req.params.courseId !== TEST_COURSE) {
        return res.sendStatus(404);
      }

      const [users] = await db.execute(
        `SELECT LOWER(TRIM(email)) AS email
         FROM system_users
         WHERE id = ? AND COALESCE(disabled, 0) = 0
         LIMIT 1`,
        [req.user.id]
      );

      if (
        users.length !== 1 ||
        users[0].email !== "marketing@digitaletextil.com.br"
      ) {
        return res.status(403).json({
          error: { message: "Permissão exclusiva da conta de teste." }
        });
      }

      const lessons = await getLessons(TEST_COURSE);
      const index = lessons.findIndex(
        lesson => lesson.id === req.params.lessonId
      );

      if (index < 0) return res.sendStatus(404);

      const completed = await getCompleted(
        req.user.id,
        TEST_COURSE
      );

      const done = new Set(completed);

      if (lessons.slice(0, index).some(
        lesson => !done.has(lesson.id)
      )) {
        return res.status(409).json({
          error: { message: "As etapas anteriores estão pendentes." }
        });
      }

      await db.execute(
        `INSERT INTO training_lesson_progress_v2
           (user_id, lesson_id)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE
           completed_at = completed_at`,
        [req.user.id, req.params.lessonId]
      );

      const updated = await getCompleted(
        req.user.id,
        TEST_COURSE
      );

      console.info(
        "TRAINING TEST SKIP",
        req.user.id,
        req.params.lessonId
      );

      res.json({
        data: {
          completed_lesson_ids: updated,
          test_skip: true
        }
      });
    } catch (error) {
      console.error("TRAINING TEST SKIP:", error);
      res.sendStatus(500);
    }
  }
);

export default router;
