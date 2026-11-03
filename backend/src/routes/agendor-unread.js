import express from "express";

import {
  db,
} from "../database.js";

import {
  requireAuth,
} from "../lib/auth.js";


const router =
  express.Router();


async function isSdr(
  userId
) {
  const [rows] =
    await db.execute(
      `
        SELECT 1

        FROM user_roles

        WHERE
          user_id = ?

          AND LOWER(
            COALESCE(
              role,
              ''
            )
          ) = 'sdr'

        LIMIT 1
      `,
      [
        String(userId),
      ]
    );

  return (
    rows.length > 0
  );
}


async function unreadCount(
  userId
) {
  const [rows] =
    await db.execute(
      `
        SELECT
          COUNT(*) AS total

        FROM crm_deals d

        LEFT JOIN crm_deal_reads r
          ON r.deal_id=d.id
          AND r.user_id=?

        WHERE
          d.owner_user_id=?

          AND r.deal_id IS NULL

          AND LOWER(
            COALESCE(
              d.status,
              'aberto'
            )
          ) NOT IN (
            'ganho',
            'perdido',
            'fechado'
          )
      `,
      [
        String(userId),
        String(userId),
      ]
    );

  return Number(
    rows?.[0]?.total || 0
  );
}


/*
 * Quantidade de leads atribuídos ao
 * SDR autenticado que ainda não abriu.
 */
router.get(
  "/",
  requireAuth,
  async (
    req,
    res
  ) => {
    try {
      const userId =
        String(
          req.user?.id || ""
        );

      if (
        !userId
        || !await isSdr(userId)
      ) {
        return res.json({
          ok: true,
          unread_count: 0,
          has_new: false,
        });
      }

      const total =
        await unreadCount(
          userId
        );

      return res.json({
        ok: true,
        unread_count: total,
        has_new: total > 0,
      });

    } catch (error) {
      console.error(
        "AGENDOR_UNREAD_GET",
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          error:
            "agendor_unread_failed",
        });
    }
  }
);


/*
 * O negócio só pode ser marcado como
 * lido pelo próprio SDR responsável.
 */
router.post(
  "/:dealId/read",
  requireAuth,
  async (
    req,
    res
  ) => {
    try {
      const userId =
        String(
          req.user?.id || ""
        );

      const dealId =
        String(
          req.params?.dealId || ""
        );

      if (
        !userId
        || !await isSdr(userId)
      ) {
        return res
          .status(403)
          .json({
            ok: false,
            error:
              "sdr_required",
          });
      }


      const [deals] =
        await db.execute(
          `
            SELECT id

            FROM crm_deals

            WHERE
              id=?
              AND owner_user_id=?

            LIMIT 1
          `,
          [
            dealId,
            userId,
          ]
        );


      if (
        deals.length === 0
      ) {
        return res
          .status(404)
          .json({
            ok: false,
            error:
              "assigned_deal_not_found",
          });
      }


      await db.execute(
        `
          INSERT INTO crm_deal_reads (
            deal_id,
            user_id,
            read_at
          )

          VALUES (
            ?,
            ?,
            CURRENT_TIMESTAMP(6)
          )

          ON DUPLICATE KEY UPDATE
            read_at =
              VALUES(read_at)
        `,
        [
          dealId,
          userId,
        ]
      );


      const total =
        await unreadCount(
          userId
        );


      return res.json({
        ok: true,
        deal_id: dealId,
        unread_count: total,
        has_new: total > 0,
      });

    } catch (error) {
      console.error(
        "AGENDOR_UNREAD_READ",
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          error:
            "agendor_mark_read_failed",
        });
    }
  }
);


export default router;
