import trainingFinalJourneyRoutes from "./routes/training-final-journey.js";
import trainingActivityReportRoutes from "./routes/training-activity-report.js";
import { startAgendorReturnWorker } from "./workers/agendor-returns.js";
import agendorReturnRoutes from "./routes/agendor-returns.js";
import http from "node:http";
import express from "express";
import cors from "cors";
import { db } from "./database.js";
import { config } from "./config.js";
import authRoutes from "./routes/auth.js";
import { requireAuth } from "./lib/auth.js";
import { readFile } from "node:fs/promises";

import meetingRoutes from "./routes/meetings.js";
import recordingRoutes from "./routes/recordings.js";
import locationRoutes from "./routes/location.js";
import presenceUnloadRoutes from "./routes/presence-unload.js";
import passwordChangeRoutes from "./routes/password-change.js";
import dataRoutes from "./routes/data.js";
import leadsDirectRoutes from "./routes/leads-direct.js";
import siteLeadRoutes from "./routes/site-leads.js";
import aiLeadRoutes from "./routes/ai-leads.js";
import prospectingLeadRoutes from "./routes/prospecting-leads.js";
import agendorUnreadRoutes from "./routes/agendor-unread.js";
import agendorMeetingRoutes from "./routes/agendor-meetings.js";

import storageRoutes from "./routes/storage.js";
import trainingProgressRoutes from "./routes/training-progress-v2.js";
import trainingV2Routes from "./routes/training-v2.js";
import trainingActivityPlayerTest from "./routes/training-activity-player-test.js";
import trainingJourneyTestRoutes from "./routes/training-journey-test-v2.js";
import trainingAssessmentsV2Routes from "./routes/training-assessments-v2.js";
import scheduledFilesRoutes, { startScheduledFilesWorker } from "./routes/scheduled-files.js";
import functionRoutes from "./routes/functions.js";
import { createRealtimeServer } from "./lib/realtime.js";

import digitaleAIRoutes from './routes/digitale-ai.js';
import prospectingDashboardRoutes from './routes/prospecting-dashboard.js';
import rafaelAttendanceRoutes from './routes/rafael-attendance.js';

const app = express();
app.set("trust proxy", true);
app.disable("x-powered-by");
const allowedOrigins = new Set([
  "https://portal.digitaletextil.com.br",
  ...String(process.env.PORTAL_ALLOWED_ORIGINS || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean)
]);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    let allowed = allowedOrigins.has(origin);

    try {
      const url = new URL(origin);
      const isDigitale =
        url.protocol === "https:" &&
        (
          url.hostname === "digitaletextil.com.br" ||
          url.hostname.endsWith(".digitaletextil.com.br")
        );
      const isLocal =
        (url.hostname === "localhost" ||
         url.hostname === "127.0.0.1") &&
        (url.protocol === "http:" || url.protocol === "https:");

      allowed = allowed || isDigitale || isLocal;
    } catch {}

    callback(null, allowed);
  },
  credentials: true
}));
app.use(express.json({ limit: "20mb" }));

app.get("/api/health", async (_req, res) => {
  try {
    await db.query("SELECT 1");
    return res.json({
      ok: true,
      database: config.db.name,
      storage: "local",
      realtime: "websocket",
      maps: "openstreetmap",
      sac: "mysql-local",
      supabase: "disabled",
      daily: config.dailyApiKey
        ? "configured"
        : "missing-key",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "database_unavailable",
    });
  }
});

app.use("/api/auth/password", passwordChangeRoutes);
app.use("/api/auth", authRoutes);

// Estado do backup: acesso autenticado, nunca publica arquivos do servidor.
app.get("/api/admin/backup-status", requireAuth, async (req, res) => {
  const allowedEmails = new Set([
    "marketing@digitaletextil.com.br",
    "marketing2@digitaletextil.com.br",
  ]);
  const email = String(req.user?.email || "").trim().toLowerCase();
  if (!allowedEmails.has(email) && req.user?.role !== "dev") {
    return res.status(403).json({ error: "Acesso negado" });
  }
  try {
    const raw = await readFile(
      "/var/lib/portal-github-backup/status.json", "utf8"
    );
    const status = JSON.parse(raw);
    res.setHeader("Cache-Control", "no-store");
    return res.json({
      repository: status.repository,
      lastAttemptAt: status.lastAttemptAt || null,
      lastSuccessAt: status.lastSuccessAt || null,
      lastRunSuccessful: status.lastRunSuccessful === true,
      commit: status.commit || null,
      error: status.error || null,
      schedule: "Todos os dias às 18h - horário de Brasília",
    });
  } catch {
    return res.status(503).json({ error: "Status indisponível" });
  }
});

app.use("/api/meetings", meetingRoutes);
app.use("/api/recordings", recordingRoutes);
app.use("/api/location", locationRoutes);
app.use("/api/leads-direct", leadsDirectRoutes);
app.use("/api/integrations/site-leads", siteLeadRoutes);
app.use("/api/integrations/ai-leads", aiLeadRoutes);
app.use("/api/integrations/prospecting-leads", prospectingLeadRoutes);
app.use("/api/digitale-ai", digitaleAIRoutes);
app.use("/api/prospecting-dashboard", prospectingDashboardRoutes);
app.use("/api/rafael-attendance", rafaelAttendanceRoutes);
app.use("/api/agendor-unread", agendorUnreadRoutes);
app.use("/api/agendor-meetings", agendorMeetingRoutes);
app.use("/api/agendor-returns", agendorReturnRoutes);

app.use("/api/data", dataRoutes);
app.use("/api/storage", storageRoutes);
app.use("/api/training-progress-v2", trainingProgressRoutes);
app.use("/api/training-final-journey", trainingFinalJourneyRoutes);
app.use("/api/training-activity-report", trainingActivityReportRoutes);
app.use("/api/training-v2", trainingV2Routes);
app.use("/api/training-activity-player-test", trainingActivityPlayerTest);
app.use("/api/training-journey-test-v2", trainingJourneyTestRoutes);
app.use("/api/training-assessments-v2", trainingAssessmentsV2Routes);
app.use("/api/scheduled-files", scheduledFilesRoutes);
app.use("/api/functions/presence-unload", presenceUnloadRoutes);
app.use("/api/functions", functionRoutes);

app.use((error, _req, res, _next) => {
  console.error("PORTAL API:", error);
  res.status(500).json({
    error: { message: error?.message || "internal_error" },
  });
});

const server = http.createServer(app);
createRealtimeServer(server);

server.listen(config.apiPort, config.apiHost, () => {
  startAgendorReturnWorker();
  void startScheduledFilesWorker().catch(error => {
    console.error("SCHEDULE START:", error);
  });
  console.log(`Portal Digitale API listening on ${config.apiHost}:${config.apiPort}`);
});
