import express from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../database.js';
import { requireAuth } from '../lib/auth.js';

const router = express.Router();

router.use(requireAuth);
router.use((req, res, next) => {
  if (req.user?.role !== 'dev') {
    return res.status(403).json({
      error: { message: 'Acesso exclusivo para Desenvolvedor' }
    });
  }
  next();
});

let tablePromise;
function ensureTable() {
  if (!tablePromise) {
    tablePromise = db.query(`
      CREATE TABLE IF NOT EXISTS portal_trainings (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        title VARCHAR(180) NOT NULL,
        category VARCHAR(80) NOT NULL DEFAULT 'Geral',
        description TEXT NULL,
        content MEDIUMTEXT NULL,
        material_url VARCHAR(2048) NULL,
        is_published TINYINT(1) NOT NULL DEFAULT 0,
        created_by VARCHAR(64) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_trainings_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch(error => {
      tablePromise = null;
      throw error;
    });
  }
  return tablePromise;
}

function validate(body) {
  const title = String(body?.title || '').trim().slice(0, 180);
  const category = String(body?.category || 'Geral').trim().slice(0, 80) || 'Geral';
  const description = String(body?.description || '').slice(0, 5000);
  const content = String(body?.content || '').slice(0, 100000);
  const material_url = String(body?.material_url || '').trim();

  if (!title) throw new Error('Informe o título');
  if (material_url.length > 2048) throw new Error('Link muito longo');
  if (material_url && !/^https?:\/\/[^\s]+$/i.test(material_url)) {
    throw new Error('O link precisa começar com http:// ou https://');
  }

  return {
    title, category, description, content, material_url,
    is_published: body?.is_published === true ? 1 : 0
  };
}

const handle = fn => async (req, res) => {
  try {
    await ensureTable();
    await fn(req, res);
  } catch (error) {
    console.error('TREINAMENTOS:', error);
    const invalid = [
      'Informe o título',
      'Link muito longo',
      'O link precisa começar com http:// ou https://'
    ].includes(error.message);

    return res.status(invalid ? 400 : 500).json({
      error: {
        message: invalid ? error.message : 'Erro ao processar treinamento'
      }
    });
  }
};

router.get('/', handle(async (_req, res) => {
  const [rows] = await db.execute(
    'SELECT * FROM portal_trainings ORDER BY created_at DESC'
  );
  res.json({ data: rows });
}));

router.post('/', handle(async (req, res) => {
  const item = validate(req.body);
  const id = randomUUID();

  await db.execute(`
    INSERT INTO portal_trainings
    (id, title, category, description, content, material_url,
     is_published, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, item.title, item.category, item.description,
    item.content, item.material_url, item.is_published,
    String(req.user.id)
  ]);

  res.status(201).json({ id });
}));

router.put('/:id', handle(async (req, res) => {
  const item = validate(req.body);
  const [result] = await db.execute(`
    UPDATE portal_trainings
    SET title=?, category=?, description=?, content=?,
        material_url=?, is_published=?
    WHERE id=?
  `, [
    item.title, item.category, item.description,
    item.content, item.material_url,
    item.is_published, req.params.id
  ]);

  if (!result.affectedRows) {
    return res.status(404).json({
      error: { message: 'Treinamento não encontrado' }
    });
  }

  res.json({ ok: true });
}));

router.delete('/:id', handle(async (req, res) => {
  const [result] = await db.execute(
    'DELETE FROM portal_trainings WHERE id=?',
    [req.params.id]
  );

  if (!result.affectedRows) {
    return res.status(404).json({
      error: { message: 'Treinamento não encontrado' }
    });
  }

  res.json({ ok: true });
}));

export default router;
