import express from "express";
import multer from "multer";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { db } from "../database.js";
import { config } from "../config.js";
import { requireAuth } from "../lib/auth.js";

const router = express.Router();
const stagingDir = "/var/lib/portal-digitale/scheduled-private";
const publicDir = path.join(config.uploadDir, "files");
const allowedRoles = new Set(["admin", "dev", "gerente", "diretoria"]);
const visibleRoles = new Set(["admin", "gerente", "vendedor", "diretoria"]);

router.use(requireAuth);
router.use((req, res, next) => {
  if (!allowedRoles.has(String(req.user?.role || ""))) {
    return res.status(403).json({
      error: { message: "Sem permissão para agendar arquivos" }
    });
  }
  next();
});

const uploader = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, stagingDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname)
        .toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 16);
      cb(null, crypto.randomUUID() + ext);
    }
  }),
  limits: { fileSize: 150 * 1024 * 1024, files: 10 }
});

let schemaPromise = null;

export function ensureScheduledSchema() {
  if (!schemaPromise) {
    schemaPromise = db.query(`
      CREATE TABLE IF NOT EXISTS portal_scheduled_files (
        id CHAR(36) PRIMARY KEY,
        display_name VARCHAR(255) NOT NULL,
        staged_name VARCHAR(100) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        description TEXT NULL,
        category VARCHAR(255) NULL,
        subcategory_id CHAR(36) NULL,
        visibility_json TEXT NOT NULL,
        regions_json TEXT NOT NULL,
        mime_type VARCHAR(255) NULL,
        file_size BIGINT NOT NULL,
        created_by CHAR(36) NOT NULL,
        scheduled_at DATETIME(3) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
        claimed_at DATETIME(3) NULL,
        published_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_schedule (status, scheduled_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

async function cleanup(files) {
  for (const file of files || []) {
    await fs.rm(file.path, { force: true }).catch(() => {});
  }
}

router.get("/", async (_req, res) => {
  try {
    await ensureScheduledSchema();
    const [rows] = await db.query(`
      SELECT id, display_name, scheduled_at, status
      FROM portal_scheduled_files
      ORDER BY created_at DESC LIMIT 150
    `);
    res.json({ data: rows });
  } catch (error) {
    console.error("SCHEDULE LIST:", error);
    res.status(500).json({
      error: { message: "Falha ao consultar agendamentos" }
    });
  }
});

router.post("/", uploader.array("files", 10), async (req, res) => {
  const files = req.files || [];
  try {
    await ensureScheduledSchema();

    const date = new Date(String(req.body.scheduled_at || ""));
    if (
      !files.length ||
      !Number.isFinite(date.getTime()) ||
      date.getTime() < Date.now() + 60000
    ) {
      throw new Error("Arquivo, data ou horário inválido");
    }

    const roles = JSON.parse(req.body.visibility || "[]");
    const regions = JSON.parse(req.body.regions || "[]");

    if (
      !Array.isArray(roles) ||
      !roles.length ||
      roles.some(role => !visibleRoles.has(role)) ||
      !Array.isArray(regions) ||
      regions.some(region =>
        typeof region !== "string" ||
        !/^(INTERNO|[A-Z]{2})$/.test(region)
      )
    ) {
      throw new Error("Permissões ou regiões inválidas");
    }

    const name = String(req.body.name || "").trim().slice(0, 255);
    const description = String(req.body.description || "").slice(0, 5000);
    const category = String(req.body.category || "").slice(0, 255);
    const subcategory = String(req.body.subcategory_id || "").slice(0, 36);
    const scheduledAt = date.toISOString().slice(0, 23).replace("T", " ");

    if (files.length === 1 && !name) {
      throw new Error("Informe o nome do arquivo");
    }

    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      for (const file of files) {
        const displayName = files.length === 1
          ? name
          : path.parse(file.originalname).name.slice(0, 255);

        await connection.execute(`
          INSERT INTO portal_scheduled_files (
            id, display_name, staged_name, original_name,
            description, category, subcategory_id,
            visibility_json, regions_json, mime_type,
            file_size, created_by, scheduled_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          crypto.randomUUID(),
          displayName,
          file.filename,
          file.originalname.slice(0, 255),
          description || null,
          category || null,
          subcategory || null,
          JSON.stringify([...new Set(roles)]),
          JSON.stringify([...new Set(regions)]),
          file.mimetype,
          file.size,
          String(req.user.id),
          scheduledAt
        ]);
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    res.status(201).json({
      data: { scheduled: files.length }
    });

  } catch (error) {
    await cleanup(files);
    const message = String(error.message || "");
    const invalid = /inválido|inválidas|Informe o nome/.test(message);
    console.error("SCHEDULE CREATE:", message);
    res.status(invalid ? 400 : 500).json({
      error: {
        message: invalid ? message : "Erro ao agendar arquivos"
      }
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await ensureScheduledSchema();

    const connection = await db.getConnection();
    let staged = null;

    try {
      await connection.beginTransaction();

      const [rows] = await connection.execute(`
        SELECT staged_name FROM portal_scheduled_files
        WHERE id=? AND status='scheduled' FOR UPDATE
      `, [req.params.id]);

      if (!rows.length) {
        await connection.rollback();
        return res.status(409).json({
          error: { message: "Agendamento não está mais pendente" }
        });
      }

      staged = rows[0].staged_name;

      await connection.execute(`
        UPDATE portal_scheduled_files
        SET status='cancelled' WHERE id=?
      `, [req.params.id]);

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    if (staged) {
      await fs.rm(
        path.join(stagingDir, path.basename(staged)),
        { force: true }
      ).catch(error => console.error("SCHEDULE CLEANUP:", error));
    }

    res.json({ ok: true });

  } catch (error) {
    console.error("SCHEDULE CANCEL:", error);
    res.status(500).json({
      error: { message: "Erro ao cancelar agendamento" }
    });
  }
});

let processing = false;

async function publishDue() {
  if (processing) return;
  processing = true;

  try {
    await ensureScheduledSchema();
    await fs.mkdir(publicDir, { recursive: true });

    await db.query(`
      UPDATE portal_scheduled_files
      SET status='scheduled', claimed_at=NULL
      WHERE status='processing'
        AND claimed_at < UTC_TIMESTAMP(3) - INTERVAL 5 MINUTE
    `);

    const [rows] = await db.query(`
      SELECT * FROM portal_scheduled_files
      WHERE status='scheduled'
        AND scheduled_at <= UTC_TIMESTAMP(3)
      ORDER BY scheduled_at
      LIMIT 20
    `);

    for (const item of rows) {
      const [claim] = await db.execute(`
        UPDATE portal_scheduled_files
        SET status='processing', claimed_at=UTC_TIMESTAMP(3)
        WHERE id=? AND status='scheduled'
      `, [item.id]);

      if (!claim.affectedRows) continue;

      const source = path.join(
        stagingDir, path.basename(item.staged_name)
      );
      const destination = path.join(
        publicDir, path.basename(item.staged_name)
      );

      let connection = null;

      try {
        try {
          await fs.access(source);
          await fs.rename(source, destination);
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
          await fs.access(destination);
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        const publicUrl =
          `/api/storage/public?bucket=files&path=${encodeURIComponent(item.staged_name)}`;

        await connection.execute(`
          INSERT INTO files (
            id, name, description, file_url, file_type,
            file_size, category, subcategory_id, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          item.id,
          item.display_name,
          item.description,
          publicUrl,
          item.mime_type,
          item.file_size,
          item.category,
          item.subcategory_id,
          item.created_by
        ]);

        for (const role of JSON.parse(item.visibility_json)) {
          await connection.execute(`
            INSERT INTO file_visibility
              (id, file_id, visible_to_role)
            VALUES (?, ?, ?)
          `, [crypto.randomUUID(), item.id, role]);
        }

        for (const region of JSON.parse(item.regions_json)) {
          await connection.execute(`
            INSERT INTO file_region_visibility
              (id, file_id, region)
            VALUES (?, ?, ?)
          `, [crypto.randomUUID(), item.id, region]);
        }

        await connection.execute(`
          UPDATE portal_scheduled_files
          SET status='published', published_at=UTC_TIMESTAMP(3)
          WHERE id=?
        `, [item.id]);

        await connection.commit();
        console.log("ARQUIVO AGENDADO PUBLICADO:", item.id);

      } catch (error) {
        if (connection) {
          await connection.rollback().catch(() => {});
        }

        console.error(
          "ERRO NA PUBLICAÇÃO AGENDADA:",
          item.id, error.message
        );

        try {
          await fs.access(destination);
          await fs.rename(destination, source);
        } catch {}

        await db.execute(`
          UPDATE portal_scheduled_files
          SET status='failed'
          WHERE id=? AND status='processing'
        `, [item.id]).catch(() => {});

      } finally {
        if (connection) connection.release();
      }
    }

  } catch (error) {
    console.error("SCHEDULE WORKER:", error);
  } finally {
    processing = false;
  }
}

export async function startScheduledFilesWorker() {
  await fs.mkdir(stagingDir, {
    recursive: true,
    mode: 0o700
  });
  await ensureScheduledSchema();
  void publishDue();
  const timer = setInterval(() => void publishDue(), 15000);
  timer.unref();
}

export default router;
