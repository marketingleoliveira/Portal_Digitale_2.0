import express from "express";
import { randomUUID } from "node:crypto";

import {
  db,
} from "../database.js";

import {
  requireAuth,
} from "../lib/auth.js";


const router =
  express.Router();


async function getRoles(
  connection,
  userId
) {
  const [rows] =
    await connection.execute(
      `
        SELECT
          LOWER(role) AS role

        FROM user_roles

        WHERE user_id=?
      `,
      [
        String(userId),
      ]
    );

  return new Set(
    rows.map(
      (row) =>
        String(
          row.role || ""
        )
    )
  );
}


function formatMeetingDate(
  scheduledDate
) {
  const [
    datePart,
    timePart,
  ] = String(
    scheduledDate
  ).split(" ");

  const [
    year,
    month,
    day,
  ] = datePart.split("-");

  return (
    `${day}/${month}/${year}`
    + ` às ${timePart.slice(0, 5)}`
  );
}


router.post(
  "/",
  requireAuth,
  async (
    req,
    res
  ) => {

    let connection;


    try {

      const userId =
        String(
          req.user?.id || ""
        );


      if (!userId) {

        return res
          .status(401)
          .json({
            ok: false,
            error:
              "unauthorized",
          });

      }


      connection =
        await db.getConnection();


      const roles =
        await getRoles(
          connection,
          userId
        );


      const isPrivileged =
        roles.has("dev")
        ||
        roles.has("gerente")
        ||
        roles.has("diretoria");


      const isSdr =
        roles.has("sdr");


      if (
        !isSdr
        &&
        !isPrivileged
      ) {

        return res
          .status(403)
          .json({
            ok: false,
            error:
              "meeting_schedule_not_allowed",
          });

      }


      const dealId =
        String(
          req.body?.deal_id || ""
        ).trim();


      const sellerId =
        String(
          req.body?.seller_id || ""
        ).trim();


      const scheduledDate =
        String(
          req.body?.scheduled_date || ""
        ).trim();


      const notes =
        String(
          req.body?.notes || ""
        ).trim();


      let durationMinutes =
        Number(
          req.body?.duration_minutes
          || 60
        );


      if (
        !Number.isFinite(
          durationMinutes
        )
      ) {
        durationMinutes = 60;
      }


      durationMinutes =
        Math.max(
          15,
          Math.min(
            240,
            Math.round(
              durationMinutes
            )
          )
        );


      if (!dealId) {

        return res
          .status(422)
          .json({
            ok: false,
            error:
              "deal_id_required",
          });

      }


      if (!sellerId) {

        return res
          .status(422)
          .json({
            ok: false,
            error:
              "seller_required",
          });

      }


      if (
        !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:00$/
          .test(
            scheduledDate
          )
      ) {

        return res
          .status(422)
          .json({
            ok: false,
            error:
              "invalid_scheduled_date",
          });

      }


      const [futureRows] =
        await connection.execute(
          `
            SELECT
              (? > NOW()) AS future
          `,
          [
            scheduledDate,
          ]
        );


      if (
        Number(
          futureRows?.[0]?.future
          || 0
        ) !== 1
      ) {

        return res
          .status(422)
          .json({
            ok: false,
            error:
              "future_date_required",
          });

      }


      const [deals] =
        await connection.execute(
          `
            SELECT
              d.id,
              d.title,
              d.lead_id,
              d.owner_user_id,
              d.pipeline_id,

              COALESCE(
                NULLIF(
                  TRIM(o.name),
                  ''
                ),
                NULLIF(
                  TRIM(d.title),
                  ''
                ),
                'Negócio'
              ) AS company_name,

              p.name AS contact_name,
              p.phone AS contact_phone,
              p.email AS contact_email

            FROM crm_deals d

            LEFT JOIN crm_organizations o
              ON o.id=d.organization_id

            LEFT JOIN crm_people p
              ON p.id=d.person_id

            WHERE d.id=?

            LIMIT 1
          `,
          [
            dealId,
          ]
        );


      const deal =
        deals?.[0];


      if (!deal) {

        return res
          .status(404)
          .json({
            ok: false,
            error:
              "deal_not_found",
          });

      }


      /*
       * SDR só agenda negócios
       * atribuídos a ele.
       */
      if (
        isSdr
        &&
        !isPrivileged
        &&
        String(
          deal.owner_user_id || ""
        ) !== userId
      ) {

        return res
          .status(403)
          .json({
            ok: false,
            error:
              "deal_not_assigned_to_user",
          });

      }


      /*
       * O atendimento da reunião deve
       * obrigatoriamente ficar com
       * um usuário ativo de cargo vendedor.
       */
      const [sellerRows] =
        await connection.execute(
          `
            SELECT
              p.id,
              p.full_name,
              p.email

            FROM profiles p

            JOIN user_roles ur
              ON ur.user_id=p.id

            WHERE
              p.id=?
              AND COALESCE(
                p.is_active,
                1
              )=1
              AND LOWER(
                ur.role
              )='vendedor'

            LIMIT 1
          `,
          [
            sellerId,
          ]
        );


      const seller =
        sellerRows?.[0];


      if (!seller) {

        return res
          .status(422)
          .json({
            ok: false,
            error:
              "seller_not_found",
          });

      }


      /*
       * Etapa destino:
       * Reuniões Agendadas | Visitas.
       */
      const [stageRows] =
        await connection.execute(
          `
            SELECT
              id,
              name

            FROM crm_stages

            WHERE
              pipeline_id=?
              AND name='Reuniões Agendadas | Visitas'

            LIMIT 1
          `,
          [
            deal.pipeline_id,
          ]
        );


      const meetingStage =
        stageRows?.[0];


      if (!meetingStage) {

        return res
          .status(500)
          .json({
            ok: false,
            error:
              "meeting_stage_not_found",
          });

      }


      const meetingId =
        randomUUID();


      const notificationId =
        randomUUID();


      const title =
        `Reunião - ${
          String(
            deal.company_name
            || deal.title
            || "Lead"
          )
        }`;


      const meetingWhen =
        formatMeetingDate(
          scheduledDate
        );


      const notificationMessage =
        `Uma nova reunião foi atribuída a você. `
        +
        `Empresa: ${
          deal.company_name
          || deal.title
          || "Lead"
        }. `
        +
        `Data: ${meetingWhen}. `
        +
        `Consulte CRM > Calendário para os detalhes.`;


      await connection
        .beginTransaction();




      /*
       * AGENDOR_ATENDIMENTO_LEAD_V1
       *
       * Todo agendamento criado no Agendor gera um
       * registro próprio para o menu Atendimento.
       */
      const attendanceLeadId =
        randomUUID();

      await connection.execute(
        `
          INSERT INTO leads
          (
            id,
            company_name,
            contact_name,
            contact_email,
            contact_phone,
            status,
            source,
            notes,
            assigned_to,
            created_by,
            created_at,
            updated_at,
            scope,
            attendance_status,
            source_lead_id
          )

          VALUES
          (
            ?,
            ?,
            ?,
            ?,
            ?,
            'proposta',
            'outro',
            ?,
            ?,
            ?,
            CURRENT_TIMESTAMP(6),
            CURRENT_TIMESTAMP(6),
            'atendimento',
            'agendado',
            ?
          )
        `,
        [
          attendanceLeadId,

          String(
            deal.company_name
            || deal.title
            || "Negócio"
          ),

          String(
            deal.contact_name
            || deal.company_name
            || deal.title
            || "Contato"
          ),

          deal.contact_email
            || null,

          deal.contact_phone
            || null,

          notes
            || "Pré-agendamento criado pelo Agendor.",

          sellerId,

          userId,

          deal.lead_id
            || null,
        ]
      );

      /*
       * 1. Cria reunião.
       */
      await connection.execute(
        `
          INSERT INTO crm_meeting_schedules
          (
            id,
            scheduled_date,
            duration_minutes,
            title,
            company_name,
            contact_name,
            contact_phone,
            contact_email,
            notes,
            status,
            assigned_to,
            created_by,
            meeting_id,
            lead_id,
            deal_id,
            origin,
            created_at,
            updated_at
          )

          VALUES
          (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            'agendado',
            ?,
            ?,
            NULL,
            ?,
            ?,
            'AGENDOR',
            CURRENT_TIMESTAMP(6),
            CURRENT_TIMESTAMP(6)
          )
        `,
        [
          meetingId,
          scheduledDate,
          durationMinutes,
          title,

          String(
            deal.company_name
            || deal.title
            || "Negócio"
          ),

          deal.contact_name
            || null,

          deal.contact_phone
            || null,

          deal.contact_email
            || null,

          notes
            || "Pré-agendamento criado pelo Agendor.",

          sellerId,

          userId,
          attendanceLeadId,

          dealId,
        ]
      );


      /*
       * 2. Move o card para
       *    Reuniões Agendadas | Visitas.
       *
       * Não troca o dono comercial
       * original do negócio.
       */
      await connection.execute(
        `
          UPDATE crm_deals

          SET
            stage_id=?,
            updated_at=
              CURRENT_TIMESTAMP(6)

          WHERE id=?
        `,
        [
          meetingStage.id,
          dealId,
        ]
      );


      /*
       * 3. Notificação individual
       *    para o vendedor.
       */
      await connection.execute(
        `
          INSERT INTO user_notifications
          (
            id,
            title,
            message,
            created_by,
            target_user_id,
            created_at
          )

          VALUES
          (
            ?,
            'Nova reunião agendada',
            ?,
            ?,
            ?,
            CURRENT_TIMESTAMP(6)
          )
        `,
        [
          notificationId,
          notificationMessage,
          userId,
          sellerId,
        ]
      );


      await connection
        .commit();


      return res
        .status(201)
        .json({
          ok: true,

          id:
            meetingId,

          deal_id:
            dealId,

          scheduled_date:
            scheduledDate,

          assigned_to:
            sellerId,

          seller_name:
            seller.full_name,

          stage_id:
            meetingStage.id,

          stage:
            meetingStage.name,

          notification_id:
            notificationId,

          origin:
            "AGENDOR",
        });


    } catch (error) {

      try {
        await connection
          ?.rollback();
      } catch {
        // noop
      }


      console.error(
        "AGENDOR_MEETING_CREATE",
        error
      );


      return res
        .status(500)
        .json({
          ok: false,
          error:
            "meeting_create_failed",
        });


    } finally {

      connection?.release();

    }
  }
);


export default router;
