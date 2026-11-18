import {DEFAULT_ACCESS,parseAccess,normalizeAccess,canAccessCourse,requireCourseAccess} from './training-access.js';
import {getSecurityPolicy, normalizeSecurityPolicy, securityEvent} from './training-security-test.js';
import commercialJourney from './commercial-journey.js';
import express from "express";
import multer from "multer";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";

import { db } from "../database.js";
import { config } from "../config.js";
import { requireAuth } from "../lib/auth.js";

const router = express.Router();

const storageRoot = path.join(
  config.uploadDir,
  "training-private"
);

fs.mkdirSync(storageRoot, {
  recursive: true,
  mode: 0o700
});

const uuid = () => crypto.randomUUID();

const allowedExtensions = new Set([
  ".pdf", ".png", ".jpg", ".jpeg", ".webp",
  ".gif", ".mp4", ".mov", ".webm", ".m4v",
  ".mp3", ".wav", ".m4a",
  ".doc", ".docx", ".ppt", ".pptx",
  ".xls", ".xlsx", ".csv", ".txt", ".zip"
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, storageRoot);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, uuid() + ext);
    }
  }),
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    if (!allowedExtensions.has(ext)) {
      return cb(new Error("Tipo de arquivo não permitido"));
    }

    cb(null, true);
  }
  // Sem limite artificial de tamanho em MB.
  // Multer grava o arquivo diretamente no disco.
});


// Visualização incorporada: link temporário assinado,
// com suporte nativo do Express a requisições HTTP Range.
router.get("/materials/:id/stream", async (req, res) => {
  try {
    const ticket = String(req.query.ticket || "");
    const payload = jwt.verify(ticket, config.jwtSecret, {
      algorithms: ["HS256"]
    });

    if (
      payload.scope !== "training-preview" ||
      payload.materialId !== req.params.id ||
      !payload.userId
    ) {
      return res.sendStatus(403);
    }

    // Revalida o perfil no MariaDB a cada requisição.
    const [users] = await db.execute(`
      SELECT u.id,u.disabled,u.token_version, p.is_active, r.role
      FROM system_users u
      LEFT JOIN profiles p ON p.id=u.id
      LEFT JOIN user_roles r ON r.user_id=u.id
      WHERE u.id=? LIMIT 1
    `, [payload.userId]);

    const user = users[0];

    if (
      !user ||
      Number(user.disabled) === 1 ||
      Number(user.is_active) !== 1 ||
      (payload.tokenVersion != null ? Number(payload.tokenVersion)!==Number(user.token_version) : user.role!=="dev")
    ) {
      return res.sendStatus(403);
    }

    const [rows] = await db.execute(`
      SELECT m.stored_name, m.mime_type, m.original_name,c.id AS course_id,c.status,c.access_policy_json
      FROM training_materials_v2 m
      JOIN training_lessons_v2 l ON l.id=m.lesson_id
      JOIN training_courses_v2 c ON c.id=l.course_id
      WHERE m.id=? AND c.status='published'
      LIMIT 1
    `, [req.params.id]);

    if (!rows.length) return res.sendStatus(404);

    const item = rows[0];
    if(!canAccessCourse(user,item))return res.sendStatus(403);

    const file = path.join(
      storageRoot,
      path.basename(item.stored_name)
    );

    const type = String(item.mime_type || "");

    const inlineAllowed =
      type.startsWith("video/") ||
      type.startsWith("audio/") ||
      type.startsWith("image/") ||
      type === "application/pdf";

    if (!inlineAllowed) return res.sendStatus(415);

    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", "inline");
    res.type(type);

    return res.sendFile(file, {
      acceptRanges: true,
      cacheControl: false
    }, error => {
      if (error && !res.headersSent) {
        res.sendStatus(error.statusCode || 404);
      }
    });

  } catch {
    return res.sendStatus(403);
  }
});

router.use(requireAuth);

// Somente a função real DEV pode utilizar esta API.
// Não utiliza o perfil de visualização simulada.
router.use(async (req,res,next)=>{
 if(req.user?.role==='dev')return next();
 const p=req.path;
 if(req.method==='GET'&&p==='/available')return next();
 if(p.startsWith('/commercial-course/'))return next(); // child router verifies course and user
 try{
  let match=p.match(/^\/courses\/([^/]+)\/lessons$/),courseId=match?.[1];
  if(req.method!=='GET')return res.sendStatus(403);
  if(!courseId&&(match=p.match(/^\/lessons\/([^/]+)\/materials$/))){const [r]=await db.execute('SELECT course_id FROM training_lessons_v2 WHERE id=?',[match[1]]);courseId=r[0]?.course_id;}
  if(!courseId&&(match=p.match(/^\/materials\/([^/]+)\/(preview-ticket|download)$/))){const [r]=await db.execute('SELECT l.course_id,m.mime_type FROM training_materials_v2 m JOIN training_lessons_v2 l ON l.id=m.lesson_id WHERE m.id=?',[match[1]]);courseId=r[0]?.course_id;if(match[2]==='download'&&String(r[0]?.mime_type||'').startsWith('video/'))return res.sendStatus(403);}
  if(courseId&&await requireCourseAccess(req.user,courseId))return next();
  return res.sendStatus(403);
 }catch(e){console.error('TRAINING ACCESS',e.code);return res.sendStatus(500);}
});

let schemaPromise = null;

export function ensureTrainingSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS training_courses_v2 (
          id CHAR(36) NOT NULL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          description TEXT NULL,
          security_policy_json LONGTEXT NULL,
          access_policy_json LONGTEXT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'draft',
          created_by CHAR(36) NOT NULL,
          created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
            ON UPDATE CURRENT_TIMESTAMP(3),
          INDEX idx_training_course_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS training_lessons_v2 (
          id CHAR(36) NOT NULL PRIMARY KEY,
          course_id CHAR(36) NOT NULL,
          title VARCHAR(255) NOT NULL,
          description TEXT NULL,
          sort_order INT NOT NULL DEFAULT 0,
          created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
            ON UPDATE CURRENT_TIMESTAMP(3),
          INDEX idx_training_lesson_course (course_id, sort_order),
          CONSTRAINT fk_training_lesson_course_v2
            FOREIGN KEY (course_id)
            REFERENCES training_courses_v2(id)
            ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS training_materials_v2 (
          id CHAR(36) NOT NULL PRIMARY KEY,
          lesson_id CHAR(36) NOT NULL,
          original_name VARCHAR(255) NOT NULL,
          stored_name VARCHAR(100) NOT NULL,
          mime_type VARCHAR(255) NULL,
          file_size BIGINT NOT NULL DEFAULT 0,
          created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          INDEX idx_training_material_lesson (lesson_id),
          CONSTRAINT fk_training_material_lesson_v2
            FOREIGN KEY (lesson_id)
            REFERENCES training_lessons_v2(id)
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
    await ensureTrainingSchema();
    next();
  } catch (error) {
    console.error("TRAINING SCHEMA:", error);
    res.status(500).json({
      error: { message: "Banco de treinamentos indisponível" }
    });
  }
});

function fail(res, error, fallback = "Operação não realizada") {
  console.error("TRAINING:", error);
  return res.status(500).json({
    error: { message: fallback }
  });
}

// CURSOS
router.get('/available',async(req,res)=>{
 try{
  const [rows]=await db.query("SELECT c.id,c.title,c.description,c.status,c.access_policy_json,(SELECT COUNT(*) FROM training_lessons_v2 l WHERE l.course_id=c.id) AS lesson_count FROM training_courses_v2 c WHERE c.status='published' ORDER BY c.created_at DESC");
  res.setHeader('Cache-Control','no-store');
  res.json({data:rows.filter(c=>canAccessCourse(req.user,c)).map(({access_policy_json,...c})=>c)});
 }catch(e){fail(res,e,'Erro ao consultar treinamentos disponíveis');}
});
router.get('/access-users',async(_req,res)=>{
 try{const [rows]=await db.query("SELECT u.id,COALESCE(p.full_name,u.email) AS name,u.email,r.role FROM system_users u JOIN profiles p ON p.id=u.id LEFT JOIN user_roles r ON r.user_id=u.id WHERE u.disabled=0 AND p.is_active=1 ORDER BY name");res.setHeader('Cache-Control','no-store');res.json({data:rows});}
 catch(e){fail(res,e,'Erro ao consultar colaboradores');}
});
router.get('/security-defaults', async (_req,res) => {
  try { res.json({data:await getSecurityPolicy()}); } catch(e) { fail(res,e,'Erro ao consultar padrões'); }
});

router.get("/courses", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM training_lessons_v2 l
         WHERE l.course_id = c.id) AS lesson_count
      FROM training_courses_v2 c
      WHERE c.status = ${
          req.query.published === '1'
            ? "'published'"
            : "c.status"
        }
        AND c.status <> 'archived'
      ORDER BY c.created_at DESC
    `);

    res.json({ data: rows });
  } catch (error) {
    fail(res, error, "Erro ao listar treinamentos");
  }
});

router.post("/courses", async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim();
    const status = String(req.body?.status || "draft");

    if (!["draft", "published"].includes(status)) {
      return res.status(400).json({
        error: { message: "Status de treinamento inválido" }
      });
    }

    if (!title || title.length > 255) {
      return res.status(400).json({
        error: { message: "Informe um nome válido para o treinamento" }
      });
    }

    const id = uuid();
    const policy = normalizeSecurityPolicy(req.body?.security_policy, await getSecurityPolicy(), false);
    const access=await normalizeAccess(req.body?.access_policy);

    await db.execute(`
      INSERT INTO training_courses_v2
        (id, title, description, created_by, status, security_policy_json, access_policy_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      id, title, description || null, req.user.id, status, JSON.stringify(policy), JSON.stringify(access)
    ]);

    res.status(201).json({
      data: { id, title, description, status, security_policy_json: JSON.stringify(policy),access_policy_json:JSON.stringify(access) }
    });
  } catch (error) {
    if(error.status===400) return res.status(400).json({error:{message:error.message}});
    fail(res, error, "Erro ao criar treinamento");
  }
});

router.patch("/courses/:id", async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim();
    const status = String(req.body?.status || "draft");

    if (!["draft", "published"].includes(status)) {
      return res.status(400).json({
        error: { message: "Status de treinamento inválido" }
      });
    }

    if (!title || title.length > 255) {
      return res.status(400).json({
        error: { message: "Nome do treinamento inválido" }
      });
    }

    const [existing] = await db.execute("SELECT security_policy_json,access_policy_json FROM training_courses_v2 WHERE id=? AND status <> 'archived'",[req.params.id]);
    if (!existing.length) return res.status(404).json({error:{message:'Treinamento não encontrado'}});
    const previous = await getSecurityPolicy(req.params.id);
    const policy = normalizeSecurityPolicy(req.body?.security_policy, previous, req.params.id==='a7c54ef2-b9a3-4a28-9d11-261116000001');
    const changed = JSON.stringify(previous) !== JSON.stringify(policy);
    const access=await normalizeAccess(req.body?.access_policy,existing[0].access_policy_json);
    const accessChanged=JSON.stringify(parseAccess(existing[0].access_policy_json))!==JSON.stringify(access);
    const [result] = await db.execute(`
      UPDATE training_courses_v2
      SET title=?, description=?, status=?, security_policy_json=?, access_policy_json=?
      WHERE id=? AND status <> 'archived'
    `, [title, description || null, status, JSON.stringify(policy), JSON.stringify(access), req.params.id]);

    if (!result.affectedRows) {
      return res.status(404).json({
        error: { message: "Treinamento não encontrado" }
      });
    }

    if(accessChanged) await securityEvent(req.user.id,null,null,"CONFIGURACOES_ALTERADAS","Disponibilidade e acesso: "+title);
    if(changed) await securityEvent(req.user.id,null,null,"CONFIGURACOES_ALTERADAS", "Configurações individuais: "+title);
    res.json({ ok: true });
  } catch (error) {
    if(error.status===400) return res.status(400).json({error:{message:error.message}});
    fail(res, error, "Erro ao atualizar treinamento");
  }
});

// Arquivar preserva os cursos e materiais existentes.
router.delete("/courses/:id", async (req, res) => {
  try {
    const [result] = await db.execute(`
      UPDATE training_courses_v2
      SET status='archived'
      WHERE id=?
    `, [req.params.id]);

    if (!result.affectedRows) {
      return res.status(404).json({
        error: { message: "Treinamento não encontrado" }
      });
    }

    res.json({ ok: true });
  } catch (error) {
    fail(res, error, "Erro ao arquivar treinamento");
  }
});

// AULAS

router.get("/courses/:id/lessons", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT l.*,
        (SELECT COUNT(*) FROM training_materials_v2 m
         WHERE m.lesson_id=l.id) AS material_count
      FROM training_lessons_v2 l
      JOIN training_courses_v2 c ON c.id=l.course_id
      WHERE l.course_id=? AND c.status <> 'archived'
      ORDER BY l.sort_order, l.created_at
    `, [req.params.id]);

    res.json({ data: rows });
  } catch (error) {
    fail(res, error, "Erro ao consultar aulas");
  }
});

router.post("/courses/:id/lessons", async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim();

    if (!title || title.length > 255) {
      return res.status(400).json({
        error: { message: "Informe o nome da aula" }
      });
    }

    const [courses] = await db.execute(`
      SELECT id FROM training_courses_v2
      WHERE id=? AND status <> 'archived'
      LIMIT 1
    `, [req.params.id]);

    if (!courses.length) {
      return res.status(404).json({
        error: { message: "Treinamento não encontrado" }
      });
    }

    const [positions] = await db.execute(`
      SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order
      FROM training_lessons_v2 WHERE course_id=?
    `, [req.params.id]);

    const id = uuid();

    await db.execute(`
      INSERT INTO training_lessons_v2
        (id, course_id, title, description, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `, [
      id,
      req.params.id,
      title,
      description || null,
      positions[0].next_order
    ]);

    res.status(201).json({
      data: { id, title, description }
    });
  } catch (error) {
    fail(res, error, "Erro ao criar aula");
  }
});

router.patch("/lessons/:id", async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim();

    if (!title || title.length > 255) {
      return res.status(400).json({
        error: { message: "Nome da aula inválido" }
      });
    }

    const [result] = await db.execute(`
      UPDATE training_lessons_v2 l
      JOIN training_courses_v2 c ON c.id=l.course_id
      SET l.title=?, l.description=?
      WHERE l.id=? AND c.status <> 'archived'
    `, [title, description || null, req.params.id]);

    if (!result.affectedRows) {
      return res.status(404).json({
        error: { message: "Aula não encontrada" }
      });
    }

    res.json({ ok: true });
  } catch (error) {
    fail(res, error, "Erro ao editar aula");
  }
});

// MATERIAIS

router.get("/lessons/:id/materials", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT m.id, m.original_name, m.mime_type,
             m.file_size, m.created_at
      FROM training_materials_v2 m
      JOIN training_lessons_v2 l ON l.id=m.lesson_id
      JOIN training_courses_v2 c ON c.id=l.course_id
      WHERE m.lesson_id=? AND c.status <> 'archived'
      ORDER BY m.created_at
    `, [req.params.id]);

    res.json({ data: rows });
  } catch (error) {
    fail(res, error, "Erro ao consultar materiais");
  }
});

// Verifica a aula ANTES de aceitar o upload.
async function validateLesson(req, res, next) {
  try {
    const [rows] = await db.execute(`
      SELECT l.id FROM training_lessons_v2 l
      JOIN training_courses_v2 c ON c.id=l.course_id
      WHERE l.id=? AND c.status <> 'archived'
      LIMIT 1
    `, [req.params.id]);

    if (!rows.length) {
      return res.status(404).json({
        error: { message: "Aula não encontrada" }
      });
    }

    next();
  } catch (error) {
    fail(res, error, "Erro ao validar aula");
  }
}

router.post(
  "/lessons/:id/materials",
  validateLesson,
  upload.array("files", 100),
  async (req, res) => {
    const files = req.files || [];

    if (!files.length) {
      return res.status(400).json({
        error: { message: "Selecione arquivos para enviar" }
      });
    }

    let connection;

    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      for (const file of files) {
        await connection.execute(`
          INSERT INTO training_materials_v2 (
            id, lesson_id, original_name, stored_name,
            mime_type, file_size
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
          uuid(),
          req.params.id,
          file.originalname.slice(0, 255),
          file.filename,
          file.mimetype || null,
          file.size
        ]);
      }

      await connection.commit();

      res.status(201).json({
        data: { uploaded: files.length }
      });
    } catch (error) {
      if (connection) {
        await connection.rollback().catch(() => {});
      }

      for (const file of files) {
        await fsp.rm(file.path, { force: true }).catch(() => {});
      }

      fail(res, error, "Erro ao salvar materiais");
    } finally {
      connection?.release();
    }
  }
);


// Somente DEV autenticado pode emitir um endereço
// temporário para visualizar o material no próprio Portal.
router.get("/materials/:id/preview-ticket", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT m.id
      FROM training_materials_v2 m
      JOIN training_lessons_v2 l ON l.id=m.lesson_id
      JOIN training_courses_v2 c ON c.id=l.course_id
      WHERE m.id=? AND c.status='published'
      LIMIT 1
    `, [req.params.id]);

    if (!rows.length) {
      return res.status(404).json({
        error: { message: "Material indisponível" }
      });
    }

    const ticket = jwt.sign({
      scope: "training-preview",
      materialId: req.params.id,
      userId: req.user.id,tokenVersion:Number(req.user.token_version||0)
    }, config.jwtSecret, {
      algorithm: "HS256",
      expiresIn: "2h"
    });

    res.setHeader("Cache-Control", "no-store");

    res.json({
      data: {
        url: `/api/training-v2/materials/${encodeURIComponent(req.params.id)}/stream?ticket=${encodeURIComponent(ticket)}`
      }
    });

  } catch (error) {
    console.error("TRAINING PREVIEW:", error);
    res.status(500).json({
      error: { message: "Erro ao preparar visualização" }
    });
  }
});


// Download protegido: exige sessão válida e perfil real DEV.
router.get("/materials/:id/download", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT m.original_name, m.stored_name
      FROM training_materials_v2 m
      JOIN training_lessons_v2 l ON l.id=m.lesson_id
      JOIN training_courses_v2 c ON c.id=l.course_id
      WHERE m.id=? AND c.status <> 'archived'
      LIMIT 1
    `, [req.params.id]);

    if (!rows.length) {
      return res.status(404).json({
        error: { message: "Material não encontrado" }
      });
    }

    const item = rows[0];

    const file = path.join(
      storageRoot,
      path.basename(item.stored_name)
    );

    res.download(file, item.original_name, error => {
      if (error && !res.headersSent) {
        res.status(404).json({
          error: { message: "Arquivo indisponível" }
        });
      }
    });
  } catch (error) {
    fail(res, error, "Erro ao baixar material");
  }
});

router.delete("/materials/:id", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT m.stored_name
      FROM training_materials_v2 m
      JOIN training_lessons_v2 l ON l.id=m.lesson_id
      JOIN training_courses_v2 c ON c.id=l.course_id
      WHERE m.id=? AND c.status <> 'archived'
    `, [req.params.id]);

    if (!rows.length) {
      return res.status(404).json({
        error: { message: "Material não encontrado" }
      });
    }

    await db.execute(`
      DELETE FROM training_materials_v2
      WHERE id=?
    `, [req.params.id]);

    await fsp.rm(
      path.join(storageRoot, path.basename(rows[0].stored_name)),
      { force: true }
    ).catch(error => console.error("TRAINING CLEANUP:", error));

    res.json({ ok: true });
  } catch (error) {
    fail(res, error, "Erro ao excluir material");
  }
});

// Middleware de erro do upload.
router.use((error, _req, res, _next) => {
  console.error("TRAINING UPLOAD:", error.message);
  res.status(400).json({
    error: { message: "Upload recusado: " + error.message }
  });
});


// Nova jornada protegida. Não manter endpoints antigos de conclusão direta.
router.use('/commercial-course', commercialJourney);
export default router;
