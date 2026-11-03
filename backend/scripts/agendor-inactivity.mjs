import { db } from '../src/database.js';
import { randomUUID } from 'node:crypto';

const dryRun = process.argv.includes('--dry-run');
const connection = await db.getConnection();
let locked = false;
let delivered = 0;

const latestUpdate = `
  GREATEST(
    COALESCE(d.created_at, '1000-01-01'),
    COALESCE(d.updated_at, '1000-01-01'),
    COALESCE(d.last_activity_at, '1000-01-01'),
    COALESCE((
      SELECT MAX(GREATEST(
        COALESCE(a.created_at, '1000-01-01'),
        COALESCE(a.updated_at, '1000-01-01'),
        CASE WHEN a.completed_at <= NOW(6)
          THEN a.completed_at ELSE '1000-01-01' END
      ))
      FROM crm_activities a
      WHERE a.deal_id = d.id
    ), '1000-01-01')
  )
`;

try {
  const [[lock]] = await connection.query(
    "SELECT GET_LOCK('digitale_agendor_inactivity', 0) AS acquired"
  );
  locked = Number(lock.acquired) === 1;

  if (locked) {
    if (!dryRun) {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS crm_inactivity_alerts (
          deal_id CHAR(36) NOT NULL,
          user_id CHAR(36) NOT NULL,
          last_update_at DATETIME(6) NOT NULL,
          notified_at DATETIME(6) NOT NULL,
          PRIMARY KEY (deal_id, user_id)
        ) ENGINE=InnoDB
      `);
    }

    const [managers] = await connection.query(`
      SELECT DISTINCT user_id
      FROM user_roles
      WHERE LOWER(TRIM(role)) = 'gerente'
        AND user_id IS NOT NULL
      UNION
      SELECT id AS user_id
      FROM system_users
      WHERE id = '41f3fdf4-30f0-4db8-8814-4f6d9714c6f8'
        AND LOWER(TRIM(email)) = 'gerente@digitaletextil.com.br'
      UNION
      SELECT id AS user_id
      FROM system_users
      WHERE id = '41f3fdf4-30f0-4db8-8814-4f6d9714c6f8'
        AND LOWER(TRIM(email)) = 'gerente@digitaletextil.com.br'
    `);

    const [candidates] = await connection.query(`
      SELECT d.id
      FROM crm_deals d
      WHERE LOWER(TRIM(d.status)) = 'aberto'
        AND ${latestUpdate} <= DATE_SUB(NOW(6), INTERVAL 2 HOUR)
    `);

    console.log(JSON.stringify({
      modo: dryRun ? 'simulação' : 'execução',
      gerentes: managers.length,
      leads_sem_atualizacao: candidates.length
    }));

    if (!dryRun && managers.length) {
      for (const candidate of candidates) {
        await connection.beginTransaction();
        try {
          // Reconfere o lead antes de criar as notificações.
          await connection.execute(
            'SELECT id FROM crm_deals WHERE id = ? FOR UPDATE',
            [candidate.id]
          );

          const [rows] = await connection.execute(`
            SELECT d.id, d.title,
              DATE_FORMAT(${latestUpdate},
                '%Y-%m-%d %H:%i:%s.%f') AS last_update
            FROM crm_deals d
            WHERE d.id = ?
              AND LOWER(TRIM(d.status)) = 'aberto'
              AND ${latestUpdate}
                  <= DATE_SUB(NOW(6), INTERVAL 2 HOUR)
          `, [candidate.id]);

          if (rows.length) {
            const lead = rows[0];

            for (const manager of managers) {
              const [previous] = await connection.execute(`
                SELECT 1 FROM crm_inactivity_alerts
                WHERE deal_id = ? AND user_id = ?
                  AND last_update_at >= ?
              `, [lead.id, manager.user_id, lead.last_update]);

              if (previous.length) continue;

              const message =
                `O LEAD "${lead.title || 'Sem título'}" do Agendor ` +
                `está há pelo menos 2 horas sem atualização. ` +
                `Verifique o acompanhamento no Agendor. ID: ${lead.id}`;

              await connection.execute(`
                INSERT INTO user_notifications
                  (id, title, message, created_by,
                   target_user_id, created_at)
                VALUES (?, ?, ?, NULL, ?, NOW(6))
              `, [
                randomUUID(),
                'Agendor: lead há 2h sem atualização',
                message,
                manager.user_id
              ]);

              await connection.execute(`
                INSERT INTO crm_inactivity_alerts
                  (deal_id, user_id, last_update_at, notified_at)
                VALUES (?, ?, ?, NOW(6))
                ON DUPLICATE KEY UPDATE
                  last_update_at = VALUES(last_update_at),
                  notified_at = VALUES(notified_at)
              `, [lead.id, manager.user_id, lead.last_update]);
            }
          }

          await connection.commit();
        } catch (error) {
          await connection.rollback();
          throw error;
        }
      }

      const [[count]] = await connection.query(`
        SELECT COUNT(*) AS total FROM crm_inactivity_alerts
      `);
      delivered = Number(count.total);
      console.log('Alertas registrados no controle:', delivered);
    }
  } else {
    console.log('Outra execução já está verificando os leads.');
  }
} catch (error) {
  console.error('AGENDOR_INACTIVITY:', error.message);
  process.exitCode = 1;
} finally {
  if (locked) {
    await connection.query(
      "SELECT RELEASE_LOCK('digitale_agendor_inactivity')"
    );
  }
  connection.release();
  await db.end();
}
