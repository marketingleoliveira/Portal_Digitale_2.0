import { startAgendorReturnWorker } from "./workers/agendor-returns.js";
import agendorReturnRoutes from "./routes/agendor-returns.js";
import http from "node:http";
import express from "express";
import cors from "cors";
import { db } from "./database.js";
import { config } from "./config.js";
import authRoutes from "./routes/auth.js";
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
import functionRoutes from "./routes/functions.js";
import { createRealtimeServer } from "./lib/realtime.js";

import digitaleAIRoutes from './routes/digitale-ai.js';
import prospectingDashboardRoutes from './routes/prospecting-dashboard.js';

const app = express();
app.set("trust proxy", true);
app.disable("x-powered-by");
app.use(cors({ origin: true, credentials: true }));
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
app.use("/api/meetings", meetingRoutes);
app.use("/api/recordings", recordingRoutes);
app.use("/api/location", locationRoutes);
app.use("/api/leads-direct", leadsDirectRoutes);
app.use("/api/integrations/site-leads", siteLeadRoutes);
app.use("/api/integrations/ai-leads", aiLeadRoutes);
app.use("/api/integrations/prospecting-leads", prospectingLeadRoutes);
app.use("/api/digitale-ai", digitaleAIRoutes);
app.use("/api/prospecting-dashboard", prospectingDashboardRoutes);
app.use("/api/agendor-unread", agendorUnreadRoutes);
app.use("/api/agendor-meetings", agendorMeetingRoutes);
app.use("/api/agendor-returns", agendorReturnRoutes);

app.use("/api/data", dataRoutes);
app.use("/api/storage", storageRoutes);
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
  console.log(`Portal Digitale API listening on ${config.apiHost}:${config.apiPort}`);
});
