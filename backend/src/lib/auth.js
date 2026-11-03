import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { db } from "../database.js";

export function tokenFrom(req) {
  const header = String(req.headers.authorization || "");
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

export async function userFromToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const [rows] = await db.execute(
      `SELECT
         u.id,
         u.email,
         u.disabled,
         u.token_version,
         p.is_active,
         r.role
       FROM system_users u
       LEFT JOIN profiles p
         ON p.id = u.id
       LEFT JOIN user_roles r
         ON r.user_id = u.id
       WHERE u.id = ?
       LIMIT 1`,
      [payload.id]
    );

    const user = rows[0];

    if (
      !user ||
      user.disabled ||
      Number(user.is_active) !== 1 ||
      Number(user.token_version) !==
        Number(payload.token_version || 0)
    ) {
      return null;
    }

    return {
      ...payload,
      email: user.email,
      role: user.role || null
    };
  } catch {
    return null;
  }
}

export async function requireAuth(req, res, next) {
  const user = await userFromToken(tokenFrom(req));
  if (!user) return res.status(401).json({ error: { message: "unauthorized" } });
  req.user = user;
  next();
}

export function signUser(user) {
  return jwt.sign(
    { id: user.id, email: user.email, token_version: Number(user.token_version || 0) },
    config.jwtSecret,
    { expiresIn: "30d" }
  );
}
