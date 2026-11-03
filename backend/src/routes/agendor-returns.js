import express from "express";
import { randomUUID } from "node:crypto";
import { db } from "../database.js";
import { requireAuth } from "../lib/auth.js";

const router = express.Router();
router.use(requireAuth);

async function getAccess(userId, dealId) {
  const [[row]] = await db.execute(`
    SELECT
      EXISTS (
        SELECT 1 FROM crm_deals
        WHERE id = ? AND owner_user_id = ?
      ) AS owner,
      EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = ?
          AND LOWER(role) IN ('dev','gerente','diretoria')
      ) AS admin
  `, [dealId, userId, userId]);

  return Boolean(row?.owner || row?.admin);
}

router.get("/", async (req, res) => {
  try {
    const userId = String(req.user?.id || "");

    const [roles] = await db.execute(
      "SELECT LOWER(role) AS role FROM user_roles WHERE user_id=?",
      [userId]
    );

    const isAdmin = roles.some(r =>
      ["dev","gerente","diretoria"].includes(r.role)
    );

    const filters = [];
    const params = [];

    if (!isAdmin) {
      filters.push("r.assigned_user_id=?");
      params.push(userId);
    }

    if (req.query.deal_id) {
      filters.push("r.deal_id=?");
      params.push(String(req.query.deal_id));
    }

    const where = filters.length
      ? "WHERE " + filters.join(" AND ")
      : "";

    const [rows] = await db.execute(`
      SELECT
        r.*,
        d.title AS deal_title,
        p.full_name AS responsible_name
      FROM crm_deal_returns r
      JOIN crm_deals d ON d.id=r.deal_id
      LEFT JOIN profiles p ON p.id=r.assigned_user_id
      ${where}
      ORDER BY r.scheduled_at ASC
      LIMIT 2000
    `, params);

    const normalized = rows.map(row => ({
      ...row,
      scheduled_at: row.scheduled_at
        ? new Date(row.scheduled_at).toISOString()
        : null,
      completed_at: row.completed_at
        ? new Date(row.completed_at).toISOString()
        : null,
    }));

    res.json({ ok:true, returns:normalized });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok:false,
      error:"returns_fetch_failed"
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const userId = String(req.user?.id || "");
    const dealId = String(req.body?.deal_id || "");
    const description = String(req.body?.description || "").trim();

    const scheduledAt = new Date(req.body?.scheduled_at);

    if (
      !dealId ||
      !Number.isFinite(scheduledAt.getTime()) ||
      scheduledAt.getTime() <= Date.now()
    ) {
      return res.status(400).json({
        ok:false,
        error:"invalid_date_or_deal"
      });
    }

    if (!(await getAccess(userId, dealId))) {
      return res.status(403).json({
        ok:false,
        error:"forbidden"
      });
    }

    const [[deal]] = await db.execute(
      "SELECT owner_user_id FROM crm_deals WHERE id=?",
      [dealId]
    );

    if (!deal) {
      return res.status(404).json({
        ok:false,
        error:"deal_not_found"
      });
    }

    const responsibleId = deal.owner_user_id || userId;

    const first = new Date(
      Math.max(Date.now(), scheduledAt.getTime() - 1800000)
    );

    const toMysql = date =>
      date.toISOString().slice(0,19).replace("T"," ");

    const id = randomUUID();

    await db.execute(`
      INSERT INTO crm_deal_returns (
        id, deal_id, assigned_user_id, created_by,
        scheduled_at, description, next_notification_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      dealId,
      responsibleId,
      userId,
      toMysql(scheduledAt),
      description,
      toMysql(first)
    ]);

    res.status(201).json({ ok:true, id });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok:false,
      error:"return_create_failed"
    });
  }
});

router.post("/:id/complete", async (req, res) => {
  try {
    const userId = String(req.user?.id || "");

    const [[item]] = await db.execute(
      "SELECT deal_id FROM crm_deal_returns WHERE id=?",
      [req.params.id]
    );

    if (!item) {
      return res.status(404).json({
        ok:false,
        error:"not_found"
      });
    }

    if (!(await getAccess(userId, item.deal_id))) {
      return res.status(403).json({
        ok:false,
        error:"forbidden"
      });
    }

    await db.execute(`
      UPDATE crm_deal_returns
      SET
        completed_at=COALESCE(completed_at,UTC_TIMESTAMP()),
        completed_by=COALESCE(completed_by,?),
        next_notification_at=NULL
      WHERE id=?
    `, [userId, req.params.id]);

    res.json({ ok:true });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok:false,
      error:"return_completion_failed"
    });
  }
});

export default router;
