import express from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "../database.js";
import { config } from "../config.js";
import { userFromToken, tokenFrom } from "../lib/auth.js";
import { emitBroadcast, emitTableChange } from "../lib/realtime.js";
import {
  hasFullAccess,
} from "../lib/authorization.js";
import { reverseGeocode } from "../lib/reverse-geocode.js";

const router = express.Router();

async function currentUser(req) {
  return userFromToken(tokenFrom(req));
}

async function roleFor(userId) {
  const [rows] = await db.execute(
    "SELECT role FROM user_roles WHERE user_id=? LIMIT 1",
    [userId]
  );
  return rows[0]?.role || null;
}

async function requirePortalUser(req, res) {
  const user = await currentUser(req);
  if (!user) {
    res.status(401).json({ data: null, error: { message: "Unauthorized" } });
    return null;
  }
  return user;
}

async function requireManager(req, res) {
  const user = await requirePortalUser(req, res);
  if (!user) return null;

  const role = await roleFor(user.id);
  if (!["admin", "dev", "diretoria", "gerente"].includes(role)) {
    res.status(403).json({ data: null, error: { message: "Forbidden" } });
    return null;
  }

  return { ...user, role };
}

async function meetingForDaily(body = {}) {
  const raw =
    String(
      body.meetingCode ||
      body.roomName ||
      ""
    );

  if (!raw) return null;

  const compact =
    raw.replaceAll("-", "");

  const [rows] =
    await db.execute(
      `SELECT
         id,
         meeting_code,
         host_user_id,
         is_active
       FROM meetings
       WHERE meeting_code = ?
          OR REPLACE(meeting_code, '-', '') = ?
       LIMIT 1`,
      [raw, compact]
    );

  return rows[0] || null;
}

function canManageMeeting(user, meeting) {
  if (!user || !meeting) return false;

  return (
    hasFullAccess(user) ||
    String(meeting.host_user_id) ===
      String(user.id)
  );
}

async function dailyRequest(endpoint, options = {}) {
  if (!config.dailyApiKey) {
    throw new Error("DAILY_API_KEY not configured");
  }

  const response = await fetch(`https://api.daily.co/v1${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.dailyApiKey}`,
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function handleDaily(body) {
  const action = body?.action;
  const rawName =
    body?.roomName ||
    String(body?.meetingCode || "").replaceAll("-", "") ||
    `room${Date.now()}`;
  const roomName = rawName.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 41);

  if (action === "create" || action === "get") {
    if (action === "get") {
      const found = await dailyRequest(`/rooms/${roomName}`, { method: "GET" });
      if (found.response.ok) {
        return { url: found.data.url, name: found.data.name };
      }
    }

    const created = await dailyRequest("/rooms", {
      method: "POST",
      body: JSON.stringify({
        name: roomName,
        privacy: "public",
        properties: {
          enable_chat: true,
          enable_screenshare: true,
          start_video_off: false,
          start_audio_off: false,
          exp: Math.floor(Date.now() / 1000) + 86400,
        },
      }),
    });

    if (!created.response.ok) {
      const found = await dailyRequest(`/rooms/${roomName}`, { method: "GET" });
      if (found.response.ok) {
        return { url: found.data.url, name: found.data.name };
      }
      throw new Error(created.data?.info || created.data?.error || "daily_room_failed");
    }

    return { url: created.data.url, name: created.data.name };
  }
  if (action === "delete") {
    const result = await dailyRequest(`/rooms/${roomName}`, { method: "DELETE" });
    return { success: result.response.ok, roomName };
  }

  if (action === "start-recording") {
    const result = await dailyRequest(`/rooms/${roomName}/recordings`, {
      method: "POST",
      body: JSON.stringify({ type: "cloud" }),
    });
    if (!result.response.ok) throw new Error("daily_recording_start_failed");
    return { success: true, recording: result.data };
  }

  if (action === "stop-recording") {
    const result = await dailyRequest(`/rooms/${roomName}/recordings`, {
      method: "DELETE",
    });
    return { success: result.response.ok };
  }

  if (action === "get-recordings") {
    const result = await dailyRequest(
      `/recordings?room_name=${encodeURIComponent(roomName)}`,
      { method: "GET" }
    );
    if (!result.response.ok) throw new Error("daily_recordings_failed");
    return { recordings: result.data?.data || [] };
  }

  if (action === "get-recording-link") {
    const recordingId = String(body?.recordingId || "");
    if (!recordingId) throw new Error("Recording ID required");
    const result = await dailyRequest(
      `/recordings/${encodeURIComponent(recordingId)}/access-link`,
      { method: "GET" }
    );
    if (!result.response.ok) throw new Error("daily_recording_link_failed");
    return { link: result.data?.download_link };
  }

  throw new Error("Invalid action");
}

async function syncRecordings(body) {
  if (!config.dailyApiKey) throw new Error("DAILY_API_KEY not configured");

  if (body.action === "refresh-link") {
    const result = await dailyRequest(
      `/recordings/${encodeURIComponent(body.recordingId)}/access-link`,
      { method: "GET" }
    );
    if (!result.response.ok) throw new Error("Failed to get recording link");

    await db.execute(
      "UPDATE meeting_recordings SET download_url=? WHERE recording_id=?",
      [result.data.download_link, body.recordingId]
    );
    return { success: true, link: result.data.download_link };
  }

  let meetingId = body.meetingId || null;
  let roomName = null;
  let meetingTitle = body.meetingTitle || null;
  let meetingDate = body.meetingDate || null;

  if (body.action === "sync-meeting") {
    const [meetings] = await db.execute(
      "SELECT id,title,created_at,meeting_code FROM meetings WHERE id=? LIMIT 1",
      [meetingId]
    );
    const meeting = meetings[0];
    if (!meeting) throw new Error("Meeting not found");
    roomName = String(meeting.meeting_code || "").replaceAll("-", "");
    meetingTitle ||= meeting.title;
    meetingDate ||= meeting.created_at;
  }

  const endpoint =
    body.action === "sync-meeting"
      ? `/recordings?room_name=${encodeURIComponent(roomName)}`
      : "/recordings";

  const result = await dailyRequest(endpoint, { method: "GET" });
  if (!result.response.ok) throw new Error("Failed to fetch recordings");

  let synced = 0;
  for (const recording of result.data?.data || []) {
    const [exists] = await db.execute(
      "SELECT id FROM meeting_recordings WHERE recording_id=? LIMIT 1",
      [recording.id]
    );
    if (exists.length) continue;

    let resolvedMeetingId = meetingId;
    let resolvedTitle = meetingTitle;
    let resolvedDate = meetingDate;

    if (!resolvedMeetingId && recording.room_name) {
      const [matches] = await db.execute(
        "SELECT id,title,created_at FROM meetings WHERE meeting_code LIKE ? LIMIT 1",
        [`%${recording.room_name}%`]
      );
      resolvedMeetingId = matches[0]?.id || null;
      resolvedTitle = matches[0]?.title || `Gravação ${recording.room_name}`;
      resolvedDate = matches[0]?.created_at || recording.start_ts;
    }
    const link = await dailyRequest(
      `/recordings/${encodeURIComponent(recording.id)}/access-link`,
      { method: "GET" }
    );
    const id = crypto.randomUUID();

    await db.execute(
      `INSERT INTO meeting_recordings
       (id,meeting_id,meeting_title,meeting_date,recording_id,download_url,duration_seconds)
       VALUES (?,?,?,?,?,?,?)`,
      [
        id,
        resolvedMeetingId,
        resolvedTitle || "Gravação",
        resolvedDate || new Date(),
        recording.id,
        link.response.ok ? link.data.download_link : null,
        recording.duration || null,
      ]
    );
    synced++;
  }

  return {
    success: true,
    synced,
    total: (result.data?.data || []).length,
  };
}

async function geolocation(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = forwarded || req.socket.remoteAddress || "";

  try {
    const response = await fetch(
      `https://ipwho.is/${encodeURIComponent(ip)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await response.json();
    if (response.ok && data.success !== false) {
      return {
        ip: data.ip || ip,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        city: data.city || "Unknown",
        region: data.region || "Unknown",
        country: data.country || "Unknown",
      };
    }
  } catch {}

  return {
    ip,
    latitude: null,
    longitude: null,
    city: "Unknown",
    region: "Unknown",
    country: "Unknown",
  };
}

router.post("/:name", async (req, res) => {
  const name = String(req.params.name || "");

  try {
    if (name === "daily-room") {
      const body = req.body || {};
      const action = String(body.action || "");
      const user = await currentUser(req);
      const meeting = await meetingForDaily(body);

      if (action === "get") {
        if (
          !meeting ||
          (
            !Boolean(meeting.is_active) &&
            !canManageMeeting(user, meeting)
          )
        ) {
          return res.status(403).json({
            data: null,
            error: {
              message: "Meeting not available"
            }
          });
        }
      } else if (
        action === "get-recording-link"
      ) {
        if (
          !user ||
          !(
            hasFullAccess(user) ||
            String(user.role) === "marketing"
          )
        ) {
          return res.status(403).json({
            data: null,
            error: {
              message: "Forbidden"
            }
          });
        }
      } else if (
        action === "get-recordings"
      ) {
        if (
          !user ||
          !(
            canManageMeeting(user, meeting) ||
            String(user.role) === "marketing"
          )
        ) {
          return res.status(403).json({
            data: null,
            error: {
              message: "Forbidden"
            }
          });
        }
      } else {
        if (
          !user ||
          !canManageMeeting(user, meeting)
        ) {
          return res.status(403).json({
            data: null,
            error: {
              message: "Forbidden"
            }
          });
        }
      }

      if (!config.dailyApiKey) {
        return res.status(503).json({
          data: null,
          error: {
            message: "Daily integration is not configured",
            code: "daily_not_configured"
          }
        });
      }

      return res.json({
        data: await handleDaily(body),
        error: null
      });
    }

    if (name === "get-geolocation") {
      const user =
        await requirePortalUser(
          req,
          res
        );

      if (!user) return;

      return res.json({
        data:
          await geolocation(req),
        error: null
      });
    }

    if (name === "reverse-geocode") {
      const user =
        await requirePortalUser(
          req,
          res
        );

      if (!user) return;

      return res.json({
        data:
          await reverseGeocode(
            req.body?.lat,
            req.body?.lng
          ),
        error: null
      });
    }
    if (name === "create-user") {
      const manager = await requireManager(req, res);
      if (!manager) return;

      const body = req.body || {};
      const email = String(body.email || "").trim().toLowerCase();
      const secret = String(body.password || "");
      const allowedRoles = new Set([
        "admin",
        "gerente",
        "vendedor",
        "dev",
        "criacao",
        "sdr",
        "marketing",
        "qualidade",
        "financeiro",
        "diretoria"
      ]);

      if (
        !email ||
        secret.length < 6 ||
        !body.full_name ||
        !allowedRoles.has(
          String(body.role || "")
        )
      ) {
        return res.status(400).json({
          data: {
            error:
              "Invalid user data"
          },
          error: null
        });
      }

      const [existing] = await db.execute(
        "SELECT id FROM system_users WHERE email=? LIMIT 1",
        [email]
      );
      if (existing.length) {
        return res.status(400).json({ data: { error: "User already registered" }, error: null });
      }

      const id = crypto.randomUUID();
      const hash = await bcrypt.hash(secret, 12);
      const conn = await db.getConnection();

      try {
        await conn.beginTransaction();
        await conn.execute(
          "INSERT INTO system_users (id,email,password_hash,created_at,updated_at) VALUES (?,?,?,NOW(6),NOW(6))",
          [id, email, hash]
        );
        await conn.execute(
          `INSERT INTO profiles
           (id,full_name,email,is_active,region,location_sharing_enabled,created_at,updated_at)
           VALUES (?,?,?,?,?,?,NOW(6),NOW(6))`,
          [
            id,
            body.full_name,
            email,
            body.is_active === false ? 0 : 1,
            body.region || null,
            body.location_sharing_enabled ?? null,
          ]
        );
        await conn.execute(
          "INSERT INTO user_roles (id,user_id,role) VALUES (?,?,?)",
          [crypto.randomUUID(), id, body.role]
        );
        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }

      emitTableChange("profiles", "INSERT", { id, email, full_name: body.full_name }, null);
      emitTableChange("user_roles", "INSERT", { user_id: id, role: body.role }, null);
      return res.json({ data: { success: true, user_id: id }, error: null });
    }

    if (name === "reset-user-password") {
      const manager = await requireManager(req, res);
      if (!manager) return;

      const email = String(req.body?.email || "").trim().toLowerCase();
      const secret = String(req.body?.password || "");
      if (!email || secret.length < 6) {
        return res.status(400).json({ data: { error: "Email and password are required" }, error: null });
      }

      const hash = await bcrypt.hash(secret, 12);
      const [result] = await db.execute(
        `UPDATE system_users
         SET password_hash=?,updated_at=NOW(6),token_version=token_version+1
         WHERE email=?`,
        [hash, email]
      );

      if (!result.affectedRows) {
        return res.status(404).json({ data: { error: "User not found" }, error: null });
      }

      return res.json({ data: { success: true }, error: null });
    }

    if (name === "force-logout-all") {
      const manager = await requireManager(req, res);
      if (!manager) return;

      await db.execute(
        "UPDATE system_users SET token_version=token_version+1 WHERE id<>?",
        [manager.id]
      );
      await db.execute(
        "UPDATE user_presence SET is_online=0,last_seen=NOW(6) WHERE user_id<>?",
        [manager.id]
      );
      await db.execute(
        "UPDATE user_activity_sessions SET session_end=NOW(6) WHERE session_end IS NULL AND user_id<>?",
        [manager.id]
      );
      return res.json({ data: { success: true }, error: null });
    }

    if (name === "end-all-meetings") {
      const manager = await requireManager(req, res);
      if (!manager) return;

      const [meetings] = await db.query(
        "SELECT id,meeting_code FROM meetings WHERE ended_at IS NULL AND is_active=1"
      );
      for (const meeting of meetings) {
        if (config.dailyApiKey && meeting.meeting_code) {
          try {
            await dailyRequest(
              `/rooms/${String(meeting.meeting_code).replaceAll("-", "")}`,
              { method: "DELETE" }
            );
          } catch {}
        }
      }

      await db.query(
        "UPDATE meetings SET ended_at=NOW(6),is_active=0 WHERE ended_at IS NULL"
      );
      emitTableChange("meetings", "UPDATE", null, null);

      return res.json({
        data: { success: true, count: meetings.length },
        error: null,
      });
    }

    if (name === "sync-recordings") {
      const user =
        await requirePortalUser(
          req,
          res
        );

      if (!user) return;

      const body =
        req.body || {};

      if (
        body.action === "sync-meeting"
      ) {
        const [rows] =
          await db.execute(
            `SELECT
               id,
               host_user_id,
               meeting_code,
               is_active
             FROM meetings
             WHERE id=?
             LIMIT 1`,
            [body.meetingId]
          );

        const meeting =
          rows[0] || null;

        if (
          !meeting ||
          !(
            canManageMeeting(
              user,
              meeting
            ) ||
            String(user.role) ===
              "marketing"
          )
        ) {
          return res
            .status(403)
            .json({
              data: null,
              error: {
                message:
                  "Forbidden"
              }
            });
        }
      } else if (
        !(
          hasFullAccess(user) ||
          String(user.role) ===
            "marketing"
        )
      ) {
        return res
          .status(403)
          .json({
            data: null,
            error: {
              message:
                "Forbidden"
            }
          });
      }

      if (!config.dailyApiKey) {
        return res.status(503).json({
          data: null,
          error: {
            message: "Daily integration is not configured",
            code: "daily_not_configured"
          }
        });
      }

      return res.json({
        data:
          await syncRecordings(
            body
          ),
        error: null
      });
    }

    if (name === "notify-location-update") {
      const user =
        await requireManager(
          req,
          res
        );

      if (!user) return;

      const [online] = await db.query(
        "SELECT user_id FROM user_presence WHERE is_online=1"
      );
      const onlineIds = online.map((row) => row.user_id);

      let missing = [];
      if (onlineIds.length) {
        const placeholders = onlineIds.map(() => "?").join(",");
        const [withLocation] = await db.execute(
          `SELECT user_id FROM user_locations WHERE user_id IN (${placeholders})`,
          onlineIds
        );
        const found = new Set(withLocation.map((row) => row.user_id));
        missing = onlineIds.filter((id) => !found.has(id));
      }

      emitBroadcast(
        "location-update-request",
        "request-location-update",
        { user_ids: missing, timestamp: new Date().toISOString() }
      );

      return res.json({
        data: {
          message: "Location update request sent",
          onlineUsers: onlineIds.length,
          usersWithoutLocation: missing.length,
          userIds: missing,
        },
        error: null,
      });
    }

    if (name === "sac-proxy") {
      const user =
        await requirePortalUser(
          req,
          res
        );

      if (!user) return;

      const id =
        req.body?.id
          ? String(req.body.id)
          : "";

      const parseRaw = value => {
        if (!value) return {};

        if (
          typeof value === "object"
        ) {
          return value;
        }

        try {
          return JSON.parse(value);
        } catch {
          return {};
        }
      };

      const normalizeSac = row => ({
        ...parseRaw(row.raw_data),
        id: row.id,
        protocol:
          row.protocol || undefined,
        client_name:
          row.client_name || undefined,
        complaint_type:
          row.complaint_type || undefined,
        status:
          row.status || undefined,
        message:
          row.message || undefined,
        created_at:
          row.created_at || undefined,
        updated_at:
          row.updated_at || undefined,
        customer: {
          name:
            row.client_name || undefined,
          email:
            row.client_email || undefined,
          phone:
            row.client_phone || undefined,
          document:
            row.client_document || undefined
        }
      });

      if (!id) {
        const [rows] =
          await db.query(
            `SELECT *
             FROM sac_records
             ORDER BY created_at DESC
             LIMIT 1000`
          );

        return res.json({
          data: {
            sacs:
              rows.map(
                normalizeSac
              )
          },
          error: null
        });
      }

      const [rows] =
        await db.execute(
          `SELECT *
           FROM sac_records
           WHERE id=?
           LIMIT 1`,
          [id]
        );

      const row =
        rows[0] || null;

      if (!row) {
        return res.status(404).json({
          data: null,
          error: {
            message:
              "SAC não encontrado"
          }
        });
      }

      const [comments] =
        await db.execute(
          `SELECT *
           FROM sac_comments
           WHERE sac_id=?
           ORDER BY created_at ASC`,
          [id]
        );

      const [attachments] =
        await db.execute(
          `SELECT *
           FROM sac_attachments
           WHERE sac_id=?
           ORDER BY created_at ASC`,
          [id]
        );

      const [reports] =
        await db.execute(
          `SELECT *
           FROM sac_reports
           WHERE sac_id=?
           ORDER BY created_at ASC`,
          [id]
        );

      return res.json({
        data: {
          sac: {
            ...normalizeSac(row),
            tickets:
              comments,
            comments:
              comments,
            attachments:
              attachments,
            laudos:
              reports
          }
        },
        error: null
      });
    }

    return res.status(404).json({
      data: null,
      error: { message: "function_not_found" },
    });
  } catch (error) {
    console.error("FUNCTION", name, error);
    return res.status(500).json({
      data: null,
      error: { message: error?.message || "function_failed" },
    });
  }
});

export default router;
