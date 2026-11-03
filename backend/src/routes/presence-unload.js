import express from "express";
import jwt from "jsonwebtoken";

import { db } from "../database.js";
import { config } from "../config.js";

const router = express.Router();


function toMysqlDatetime6(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid datetime value");
  }

  return date
    .toISOString()
    .replace("T", " ")
    .replace("Z", "");
}

router.post("/", async (req, res) => {
  try {
    const authorization =
      String(
        req.headers.authorization || ""
      );

    if (
      !authorization.startsWith(
        "Bearer "
      )
    ) {
      return res.sendStatus(401);
    }

    const token =
      authorization.slice(7).trim();

    let payload;

    try {
      payload = jwt.verify(
        token,
        config.jwtSecret
      );
    } catch {
      return res.sendStatus(401);
    }

    const userId =
      typeof payload === "object"
        ? (
            payload.sub ||
            payload.user_id ||
            payload.userId ||
            payload.id
          )
        : null;

    if (!userId) {
      return res.sendStatus(401);
    }

    const {
      sessionId,
      sessionEnd,
      durationSeconds,
      lastSeen,
    } = req.body || {};

    if (sessionId) {
      await db.query(
        `
          UPDATE user_activity_sessions
          SET
            session_end = ?,
            duration_seconds = ?
          WHERE id = ?
            AND user_id = ?
        `,
        [
          toMysqlDatetime6(sessionEnd || new Date()),
          Number(durationSeconds || 0),
          String(sessionId),
          String(userId),
        ]
      );
    }

    await db.query(
      `
        UPDATE user_presence
        SET
          is_online = 0,
          last_seen = ?
        WHERE user_id = ?
      `,
      [
        toMysqlDatetime6(lastSeen || new Date()),
        String(userId),
      ]
    );

    return res.sendStatus(204);

  } catch (error) {
    console.error(
      "PRESENCE UNLOAD:",
      error
    );

    return res.sendStatus(500);
  }
});

export default router;
