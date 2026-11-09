import express from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "../database.js";
import { requireAuth, signUser } from "../lib/auth.js";

const router = express.Router();

// Controle de tentativas somente para contas cadastradas
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map();

function getLoginAttempt(email) {
  const entry = loginAttempts.get(email);

  if (entry && Date.now() >= entry.expiresAt) {
    loginAttempts.delete(email);
    return null;
  }

  return entry || null;
}

function recordLoginFailure(email) {
  const current = getLoginAttempt(email);
  const count = (current?.count || 0) + 1;

  const expiresAt =
    current?.expiresAt || Date.now() + LOGIN_WINDOW_MS;

  loginAttempts.set(email, { count, expiresAt });

  return {
    remaining: Math.max(0, LOGIN_MAX_ATTEMPTS - count),
    blocked: count >= LOGIN_MAX_ATTEMPTS
  };
}

const loginCleanup = setInterval(() => {
  for (const email of loginAttempts.keys()) {
    getLoginAttempt(email);
  }
}, LOGIN_WINDOW_MS);

loginCleanup.unref();





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

  // E-mail inexistente: mensagem genérica e sem contador
  if (!user || user.disabled || !user.password_hash) {
    return res.status(401).json({
      error: {
        message: "E-mail ou senha incorretos. Verifique seus dados."
      }
    });
  }

  // Conta cadastrada já bloqueada
  const attempt = getLoginAttempt(email);

  if (attempt && attempt.count >= LOGIN_MAX_ATTEMPTS) {
    const minutes = Math.max(
      1,
      Math.ceil((attempt.expiresAt - Date.now()) / 60000)
    );

    return res.status(429).json({
      error: {
        message:
          "Limite de tentativas atingido. Tente novamente em " +
          minutes + " minuto(s)."
      }
    });
  }

  const valid = await bcrypt.compare(
    password,
    user.password_hash
  );

  if (!valid) {
    const result = recordLoginFailure(email);

    if (result.blocked) {
      return res.status(429).json({
        error: {
          message:
            "Limite de tentativas atingido. " +
            "Tente novamente em 15 minutos."
        }
      });
    }

    const remaining = result.remaining;

    return res.status(401).json({
      error: {
        message:
          remaining === 1
            ? "Senha incorreta. Resta 1 tentativa."
            : "Senha incorreta. Restam " +
              remaining + " tentativas."
      }
    });
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
        message: "Conta aguardando aprovação do administrador"
      }
    });
  }

  // Login realizado com sucesso
  loginAttempts.delete(email);

  const token = signUser(user);

  return res.json({
    token,
    user: publicUser(user)
  });
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
    "UPDATE system_users SET password_hash=?,token_version=COALESCE(token_version,0)+1,updated_at=NOW(6) WHERE id=?",
    [hash, req.user.id]
  );

  const [versions] = await db.execute(
    "SELECT token_version FROM system_users WHERE id=? LIMIT 1",
    [req.user.id]
  );

  const token = signUser({
    id: req.user.id,
    email: req.user.email,
    token_version: versions[0].token_version
  });

  return res.json({
    token,
    user: {
      id: req.user.id,
      email: req.user.email,
    },
  });
});

export default router;
