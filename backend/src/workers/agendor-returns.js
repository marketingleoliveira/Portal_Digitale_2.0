import { randomUUID } from "node:crypto";
import { db } from "../database.js";

let processing = false;

async function processReturns() {
  if (processing) return;
  processing = true;

  try {
    const [items] = await db.query(`
      SELECT id
      FROM crm_deal_returns
      WHERE completed_at IS NULL
        AND next_notification_at <= UTC_TIMESTAMP()
      ORDER BY next_notification_at
      LIMIT 50
    `);

    for (const item of items) {
      const connection = await db.getConnection();

      try {
        await connection.beginTransaction();

        const [[r]] = await connection.execute(`
          SELECT r.*, d.title AS deal_title
          FROM crm_deal_returns r
          JOIN crm_deals d ON d.id=r.deal_id
          WHERE r.id=?
          FOR UPDATE
        `, [item.id]);

        if (
          !r ||
          r.completed_at ||
          !r.next_notification_at
        ) {
          await connection.rollback();
          continue;
        }

        const [[clock]] = await connection.execute(
          `SELECT
             CASE WHEN ? <= UTC_TIMESTAMP()
               THEN 1 ELSE 0
             END AS is_due`,
          [r.next_notification_at]
        );

        if (!clock.is_due) {
          await connection.rollback();
          continue;
        }

        await connection.execute(`
          INSERT INTO user_notifications (
            id, title, message,
            created_by, target_user_id, created_at
          ) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())
        `, [
          randomUUID(),
          "Retorno pendente — Agendor",
          `Retorno agendado: ${r.deal_title}. Acesse Agendor > Retornos.`,
          r.created_by,
          r.assigned_user_id
        ]);

        await connection.execute(`
          UPDATE crm_deal_returns
          SET
            notification_count=notification_count+1,
            next_notification_at=DATE_ADD(
              UTC_TIMESTAMP(), INTERVAL 30 MINUTE
            )
          WHERE id=? AND completed_at IS NULL
        `, [r.id]);

        await connection.commit();

      } catch (error) {
        await connection.rollback();
        console.error("RETORNO:", error);
      } finally {
        connection.release();
      }
    }
  } catch (error) {
    console.error("WORKER RETORNOS:", error);
  } finally {
    processing = false;
  }
}

export function startAgendorReturnWorker() {
  const timer = setInterval(() => {
    void processReturns();
  }, 60000);

  timer.unref();
}
