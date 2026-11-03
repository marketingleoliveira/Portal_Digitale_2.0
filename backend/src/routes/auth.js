import express from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "../database.js";
import { requireAuth, signUser } from "../lib/auth.js";

const router = express.Router();

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    aud: "authenticated",
    role: "authenticated",
    created_at: row.created_at,
    updated_at: row.updated_at,
    user_metadata: {},
    app_metadata: {},
  };
}

router.post("/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  const [rows] = await db.execute(
    "SELECT * FROM system_users WHERE email=? LIMIT 1",
    [email]
  );
  const user = rows[0];

  if (!user || user.disabled || !user.password_hash) {
    return res.status(401).json({ error: { message: "Invalid login credentials" } });
  }
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: { message: "Invalid login credentials" } });
  }

  const [profiles] = await db.execute(
    "SELECT is_active FROM profiles WHERE id=? LIMIT 1",
    [user.id]
  );

  if (
    !profiles[0] ||
    Number(profiles[0].is_active) !== 1
  ) {
    return res.status(403).json({
      error: {
        message:
          "Conta aguardando aprovação do administrador"
      }
    });
  }

  const token = signUser(user);
  return res.json({ token, user: publicUser(user) });
});

router.get("/me", requireAuth, async (req, res) => {
  const [rows] = await db.execute(
    "SELECT * FROM system_users WHERE id=? LIMIT 1",
    [req.user.id]
  );
  if (!rows[0]) {
    return res.status(404).json({ error: { message: "user_not_found" } });
  }
  return res.json({ user: publicUser(rows[0]) });
});

router.post("/signup", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const secret = String(req.body?.password || "");
  const fullName = String(req.body?.data?.full_name || "").trim();

  if (!email || secret.length < 6 || !fullName) {
    return res.status(400).json({ error: { message: "invalid_signup_data" } });
  }

  const [existing] = await db.execute(
    "SELECT id FROM system_users WHERE email=? LIMIT 1",
    [email]
  );
  if (existing.length) {
    return res.status(409).json({ error: { message: "User already registered" } });
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
      `INSERT INTO profiles (id,full_name,email,is_active,created_at,updated_at)
       VALUES (?,?,?,0,NOW(6),NOW(6))`,
      [id, fullName, email]
    );
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  return res.status(201).json({
    user: { id, email },
    session: null,
  });
});

router.post("/update-password", requireAuth, async (req, res) => {
  const secret = String(req.body?.password || "");
  if (secret.length < 6) {
    return res.status(400).json({ error: { message: "Senha muito curta" } });
  }

  const hash = await bcrypt.hash(secret, 12);
  await db.execute(
    "UPDATE system_users SET password_hash=?,updated_at=NOW(6) WHERE id=?",
    [hash, req.user.id]
  );

  return res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
    },
  });
});

export default router;
