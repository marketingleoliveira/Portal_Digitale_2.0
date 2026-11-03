import express from "express";
import crypto from "node:crypto";

import { db } from "../database.js";
import { config } from "../config.js";

const router = express.Router();
const SOURCE_SYSTEM = "site-digitale-agent-ai";
const DEAL_SOURCE = "IA";

function clean(value, max = 1000) {
  if (value === undefined || value === null) return null;
  return String(value).trim().slice(0, max) || null;
}

function safeSecretEqual(received, expected) {
  const a = Buffer.from(String(received || ""));
  const b = Buffer.from(String(expected || ""));
  if (!a.length || !b.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

router.use((req, res, next) => {
  if (!config.siteLeadSecret) {
    return res.status(503).json({ ok: false, error: "site_lead_integration_not_configured" });
  }
  if (!safeSecretEqual(req.get("x-site-lead-secret"), config.siteLeadSecret)) {
    return res.status(403).json({ ok: false, error: "invalid_integration_secret" });
  }
  next();
});

router.get("/health", (_req, res) => {
  res.json({ ok: true, source: DEAL_SOURCE, sourceSystem: SOURCE_SYSTEM });
});

router.post("/", async (req, res) => {
  const visitorKey = clean(req.body?.visitor_key, 80);
  const conversationId = clean(req.body?.conversation_id, 191);
  const summary = clean(req.body?.qualification_summary || req.body?.summary, 3000);
  const segment = clean(req.body?.segment, 180);
  const pageUrl = clean(req.body?.page_url, 1000);
  const pageContext = clean(req.body?.page_context, 80);
  const interestLevel = clean(req.body?.interest_level, 50) || "morno";
  const scoreNumber = Number(req.body?.score || 0);
  const score = Number.isFinite(scoreNumber) ? Math.round(scoreNumber) : 0;

  if (!visitorKey || !/^[A-Za-z0-9_-]{10,80}$/.test(visitorKey)) {
    return res.status(400).json({ ok: false, error: "invalid_visitor_key" });
  }
  if (!conversationId || conversationId.length < 8) {
    return res.status(400).json({ ok: false, error: "invalid_conversation_id" });
  }

  const rawPayload = {
    visitor_key: visitorKey,
    conversation_id: conversationId,
    qualification_summary: summary,
    segment,
    page_url: pageUrl,
    page_context: pageContext,
    interest_level: interestLevel,
    score
  };

  const dedupeKey = crypto
    .createHash("sha256")
    .update(`${SOURCE_SYSTEM}:${conversationId}`)
    .digest("hex");

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [siteImports] = await connection.execute(
      `SELECT *
       FROM crm_external_lead_imports
       WHERE source_system = 'site-digitale'
         AND external_lead_id = ?
       ORDER BY updated_at DESC
       LIMIT 1
       FOR UPDATE`,
      [visitorKey]
    );

    const siteImport = siteImports[0] || null;
    if (!siteImport?.deal_id) {
      await connection.rollback();
      return res.status(409).json({ ok: false, error: "site_lead_not_synced_yet" });
    }

    const [deals] = await connection.execute(
      `SELECT id, source
       FROM crm_deals
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [siteImport.deal_id]
    );

    const deal = deals[0] || null;
    if (!deal) {
      await connection.rollback();
      return res.status(409).json({ ok: false, error: "crm_deal_not_found" });
    }

    const noteParts = [
      "Origem IA: conversa com o assistente virtual comercial da Digitale.",
      segment ? `Segmento: ${segment}` : null,
      pageContext ? `Contexto: ${pageContext}` : null,
      summary ? `Resumo: ${summary}` : null,
      pageUrl ? `Página: ${pageUrl}` : null
    ].filter(Boolean);
    const aiNote = noteParts.join("\n");

    await connection.execute(
      `UPDATE crm_deals
       SET
         source = 'SITE',
         description =
           CASE
             WHEN LOCATE('Origem IA:', COALESCE(description, '')) > 0
             THEN description
             WHEN description IS NULL OR TRIM(description) = ''
             THEN ?
             ELSE CONCAT(description, '\n\n', ?)
           END,
         updated_at = CURRENT_TIMESTAMP(6),
         last_activity_at = CURRENT_TIMESTAMP(6)
       WHERE id = ?`,
      [aiNote, aiNote, deal.id]
    );

    const [existingRows] = await connection.execute(
      `SELECT id
       FROM crm_external_lead_imports
       WHERE source_system = ?
         AND external_lead_id = ?
       LIMIT 1
       FOR UPDATE`,
      [SOURCE_SYSTEM, conversationId]
    );

    if (existingRows.length) {
      await connection.execute(
        `UPDATE crm_external_lead_imports
         SET
           qualification_status = 'identified',
           qualification_score = ?,
           organization_id = ?,
           person_id = ?,
           deal_id = ?,
           owner_user_id = ?,
           payload = ?,
           dedupe_key = ?,
           updated_at = CURRENT_TIMESTAMP(6)
         WHERE id = ?`,
        [
          score,
          siteImport.organization_id,
          siteImport.person_id,
          siteImport.deal_id,
          siteImport.owner_user_id,
          JSON.stringify(rawPayload),
          dedupeKey,
          existingRows[0].id
        ]
      );
    } else {
      await connection.execute(
        `INSERT INTO crm_external_lead_imports
         (
           id,
           source_system,
           external_lead_id,
           qualification_status,
           qualification_score,
           organization_id,
           person_id,
           deal_id,
           owner_user_id,
           payload,
           dedupe_key
         )
         VALUES (?, ?, ?, 'identified', ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          SOURCE_SYSTEM,
          conversationId,
          score,
          siteImport.organization_id,
          siteImport.person_id,
          siteImport.deal_id,
          siteImport.owner_user_id,
          JSON.stringify(rawPayload),
          dedupeKey
        ]
      );
    }

    await connection.commit();

    return res.json({
      ok: true,
      source: DEAL_SOURCE,
      sourceSystem: SOURCE_SYSTEM,
      deal_id: siteImport.deal_id,
      promoted: String(deal.source || "").toUpperCase() !== "IA"
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch {}
    }
    console.error("AI LEAD INTEGRATION:", error?.message || error);
    return res.status(500).json({
      ok: false,
      error: error?.message || "ai_lead_sync_failed"
    });
  } finally {
    connection?.release();
  }
});

export default router;
