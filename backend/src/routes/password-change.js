import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../database.js";
import { config } from "../config.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const authHeader =
      String(req.headers.authorization || "");

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: {
          message: "Sessão inválida. Faça login novamente."
        }
      });
    }

    const token =
      authHeader.substring(7).trim();

    let payload;

    try {
      payload = jwt.verify(
        token,
        config.jwtSecret
      );
    } catch {
      return res.status(401).json({
        error: {
          message: "Sessão expirada. Faça login novamente."
        }
      });
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
      return res.status(401).json({
        error: {
          message: "Usuário não identificado."
        }
      });
    }

    const password =
      typeof req.body?.password === "string"
        ? req.body.password
        : "";

    if (password.length < 6) {
      return res.status(400).json({
        error: {
          message:
            "A nova senha deve ter pelo menos 6 caracteres."
        }
      });
    }

    if (password.length > 200) {
      return res.status(400).json({
        error: {
          message: "Senha inválida."
        }
      });
    }

    const [users] = await db.query(
      `
        SELECT
          id,
          disabled
        FROM system_users
        WHERE id = ?
        LIMIT 1
      `,
      [String(userId)]
    );

    if (!users.length) {
      return res.status(404).json({
        error: {
          message: "Conta não encontrada."
        }
      });
    }

    if (Number(users[0].disabled) === 1) {
      return res.status(403).json({
        error: {
          message: "Conta desativada."
        }
      });
    }

    const passwordHash =
      await bcrypt.hash(password, 12);

    await db.query(
      `
        UPDATE system_users
        SET
          password_hash = ?,
          updated_at = NOW(6)
        WHERE id = ?
      `,
      [
        passwordHash,
        String(userId)
      ]
    );

    return res.json({
      ok: true,
      message:
        "Senha atualizada com sucesso."
    });

  } catch (error) {
    console.error(
      "PASSWORD UPDATE:",
      error
    );

    return res.status(500).json({
      error: {
        message:
          "Erro ao atualizar a senha."
      }
    });
  }
});

export default router;
