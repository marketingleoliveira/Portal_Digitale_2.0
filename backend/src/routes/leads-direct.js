import express from "express";
import { db } from "../database.js";
import { requireAuth } from "../lib/auth.js";

const router = express.Router();

async function getRoles(userId) {
  const [rows] = await db.execute(
    `
      SELECT role
      FROM user_roles
      WHERE user_id = ?
    `,
    [userId]
  );

  return rows.map(
    row => String(row.role || "")
  );
}

function hasAnyRole(
  roles,
  allowed
) {
  return roles.some(
    role => allowed.includes(role)
  );
}


/* ======================================================
   LEADS COMERCIAIS / ATENDIMENTO EAD / CRM
   ====================================================== */

router.get(
  "/commercial",
  requireAuth,
  async (req, res) => {
    try {
      const userId =
        String(req.user.id);

      const scope =
        String(
          req.query.scope ||
          "atendimento"
        );

      const status =
        req.query.status
          ? String(req.query.status)
          : null;

      const roles =
        await getRoles(userId);

      const fullAccess =
        hasAnyRole(
          roles,
          [
            "dev",
            "admin",
            "gerente",
            "sdr"
          ]
        );

      const where = [
        "COALESCE(l.scope,'atendimento') = ?"
      ];

      const params = [
        scope
      ];

      if (status) {
        where.push(
          "l.status = ?"
        );

        params.push(
          status
        );
      }

      if (!fullAccess) {
        where.push(
          "(l.assigned_to = ? OR l.created_by = ?)"
        );

        params.push(
          userId,
          userId
        );
      }

      const [rows] =
        await db.execute(
          `
            SELECT
              l.*,
              p.full_name
                AS assigned_full_name,
              p.avatar_url
                AS assigned_avatar_url
            FROM leads l
            LEFT JOIN profiles p
              ON p.id = l.assigned_to
            WHERE
              ${where.join(" AND ")}
            ORDER BY
              l.created_at DESC
          `,
          params
        );

      const data =
        rows.map(row => {
          const {
            assigned_full_name,
            assigned_avatar_url,
            ...lead
          } = row;

          return {
            ...lead,

            assigned_profile:
              assigned_full_name
                ? {
                    full_name:
                      assigned_full_name,

                    avatar_url:
                      assigned_avatar_url
                  }
                : null
          };
        });

      return res.json({
        data
      });

    } catch (error) {

      console.error(
        "DIRECT LEADS:",
        error
      );

      return res.status(500).json({
        error: {
          message:
            "Erro ao carregar leads"
        }
      });
    }
  }
);


/* ======================================================
   HISTORICO DO LEAD
   ====================================================== */

router.get(
  "/commercial/:leadId/activities",
  requireAuth,
  async (req, res) => {
    try {

      const [rows] =
        await db.execute(
          `
            SELECT
              la.*,
              p.full_name
                AS user_full_name
            FROM lead_activities la
            LEFT JOIN profiles p
              ON p.id = la.user_id
            WHERE
              la.lead_id = ?
            ORDER BY
              la.created_at DESC
          `,
          [
            String(
              req.params.leadId
            )
          ]
        );

      const data =
        rows.map(row => {
          const {
            user_full_name,
            ...activity
          } = row;

          return {
            ...activity,

            user_profile:
              user_full_name
                ? {
                    full_name:
                      user_full_name
                  }
                : null
          };
        });

      return res.json({
        data
      });

    } catch (error) {

      console.error(
        "DIRECT LEAD ACTIVITIES:",
        error
      );

      return res.status(500).json({
        error: {
          message:
            "Erro ao carregar histórico"
        }
      });
    }
  }
);


/* ======================================================
   MARKETING LEADS
   ====================================================== */

router.get(
  "/marketing",
  requireAuth,
  async (req, res) => {
    try {

      const roles =
        await getRoles(
          String(req.user.id)
        );

      const allowed =
        hasAnyRole(
          roles,
          [
            "dev",
            "admin",
            "marketing"
          ]
        );

      if (!allowed) {
        return res.json({
          data: []
        });
      }

      const [rows] =
        await db.execute(
          `
            SELECT *
            FROM marketing_leads
            ORDER BY
              created_at DESC
          `
        );

      return res.json({
        data: rows
      });

    } catch (error) {

      console.error(
        "DIRECT MARKETING LEADS:",
        error
      );

      return res.status(500).json({
        error: {
          message:
            "Erro ao carregar leads de marketing"
        }
      });
    }
  }
);


/* ======================================================
   CONTATOS DE UM LEAD DE MARKETING
   ====================================================== */

router.get(
  "/marketing/:leadId/contacts",
  requireAuth,
  async (req, res) => {
    try {

      const [rows] =
        await db.execute(
          `
            SELECT *
            FROM marketing_lead_contacts
            WHERE lead_id = ?
            ORDER BY
              created_at DESC
          `,
          [
            String(
              req.params.leadId
            )
          ]
        );

      return res.json({
        data: rows
      });

    } catch (error) {

      console.error(
        "DIRECT MARKETING CONTACTS:",
        error
      );

      return res.status(500).json({
        error: {
          message:
            "Erro ao carregar contatos"
        }
      });
    }
  }
);


/* ======================================================
   TODOS OS CONTATOS DE MARKETING
   ====================================================== */

router.get(
  "/marketing-contacts",
  requireAuth,
  async (_req, res) => {
    try {

      const [rows] =
        await db.execute(
          `
            SELECT *
            FROM marketing_lead_contacts
            ORDER BY
              created_at DESC
          `
        );

      return res.json({
        data: rows
      });

    } catch (error) {

      console.error(
        "DIRECT ALL MARKETING CONTACTS:",
        error
      );

      return res.status(500).json({
        error: {
          message:
            "Erro ao carregar contatos"
        }
      });
    }
  }
);

export default router;
