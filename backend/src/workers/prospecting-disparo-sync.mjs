import fs from 'node:fs';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { db as portal } from '../database.js';

const NICOLLE = 'fba75bd9-8f92-4e2b-83f9-3bc48d7fa4bd';
const LISTA = 'IA PROSPECÇÃO';
const aplicar = process.argv.includes('--apply');

const env = dotenv.parse(
  fs.readFileSync('/var/www/TESTE_DISPARO/.env')
);

if (
  env.DB_NAME !== 'TESTE_DISPARO' ||
  !env.DB_USER ||
  env.DB_PASSWORD === undefined
) {
  throw new Error('Configuracao inesperada do Disparo');
}

const disparo = mysql.createPool({
  host: env.DB_HOST || '127.0.0.1',
  port: Number(env.DB_PORT || 3306),
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  charset: 'utf8mb4',
  connectionLimit: 2
});

const lock = await portal.getConnection();
let locked = false;

try {
  const [[check]] = await lock.query(
    "SELECT GET_LOCK('digitale:disparo-sync', 0) AS acquired"
  );

  if (Number(check.acquired) !== 1) {
    console.log('Outra sincronizacao esta em andamento.');
    process.exitCode = 1;
  } else {
    locked = true;

    const [rows] = await portal.execute(`
      SELECT deal_id, owner_id, email, company, phone, attempts
      FROM prospecting_disparo_outbox
      WHERE status = 'pending'
        AND next_attempt_at <= UTC_TIMESTAMP(6)
      ORDER BY created_at
      LIMIT 50
    `);

    console.log('MODO:', aplicar ? 'SINCRONIZACAO' : 'SOMENTE LEITURA');
    console.log('REGISTROS ELEGIVEIS:', rows.length);

    if (aplicar) {
      const [listas] = await disparo.execute(
        'SELECT id FROM disparo_contact_lists WHERE name = ? LIMIT 1',
        [LISTA]
      );

      if (!listas.length) {
        throw new Error('Lista IA PROSPECÇÃO nao encontrada');
      }

      for (const row of rows) {
        try {
          if (row.owner_id !== NICOLLE) {
            throw new Error('responsavel_diferente');
          }

          const email = String(row.email || '').trim().toLowerCase();

          if (
            email.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)
          ) {
            throw new Error('email_invalido');
          }

          const [existing] = await disparo.execute(
            'SELECT status FROM disparo_contacts WHERE email = ? LIMIT 1',
            [email]
          );

          if (existing[0]?.status === 'Descadastrado') {
            await portal.execute(`
              UPDATE prospecting_disparo_outbox
              SET status = 'suppressed',
                  last_error = 'contato_descadastrado'
              WHERE deal_id = ?
            `, [row.deal_id]);

            console.log('DESCADASTRO PRESERVADO:', row.deal_id);
            continue;
          }

          await disparo.execute(`
            INSERT INTO disparo_contacts (
              id, name, email, company, phone,
              status, lists_json, tags_json, last_activity
            )
            VALUES (?, ?, ?, ?, ?, 'Pendente', ?, '["IA"]', 'IA Digitale')
            ON DUPLICATE KEY UPDATE
              lists_json = CASE
                WHEN status = 'Descadastrado' THEN lists_json
                WHEN JSON_CONTAINS(
                  IF(
                    JSON_VALID(lists_json),
                    lists_json,
                    '[]'
                  ),
                  JSON_QUOTE(?)
                ) THEN lists_json
                ELSE JSON_ARRAY_APPEND(
                  IF(
                    JSON_VALID(lists_json),
                    lists_json,
                    '[]'
                  ),
                  '$',
                  ?
                )
              END,
              tags_json = CASE
                WHEN status = 'Descadastrado' THEN tags_json
                WHEN JSON_CONTAINS(
                  IF(JSON_VALID(tags_json), tags_json, '[]'),
                  JSON_QUOTE('IA')
                ) THEN tags_json
                ELSE JSON_ARRAY_APPEND(
                  IF(JSON_VALID(tags_json), tags_json, '[]'),
                  '$',
                  'IA'
                )
              END
          `, [
            crypto.randomUUID(),
            String(row.company).slice(0, 255),
            email,
            String(row.company).slice(0, 255),
            String(row.phone || '').slice(0, 40),
            JSON.stringify([LISTA]),
            LISTA,
            LISTA
          ]);

          const [after] = await disparo.execute(
            'SELECT status FROM disparo_contacts WHERE email = ? LIMIT 1',
            [email]
          );

          if (after[0]?.status === 'Descadastrado') {
            await portal.execute(`
              UPDATE prospecting_disparo_outbox
              SET status = 'suppressed',
                  last_error = 'contato_descadastrado'
              WHERE deal_id = ?
            `, [row.deal_id]);

            console.log('DESCADASTRO PRESERVADO:', row.deal_id);
            continue;
          }

          await portal.execute(`
            UPDATE prospecting_disparo_outbox
            SET status = 'synced',
                synced_at = UTC_TIMESTAMP(6),
                last_error = NULL
            WHERE deal_id = ?
          `, [row.deal_id]);

          console.log('SINCRONIZADO:', row.deal_id);

        } catch (error) {
          const attempts = Number(row.attempts || 0) + 1;
          const delay = Math.min(3600, 30 * 2 ** Math.min(attempts, 7));
          const reason = String(
            error.code || error.message || 'erro_desconhecido'
          ).slice(0, 255);

          await portal.execute(`
            UPDATE prospecting_disparo_outbox
            SET attempts = ?,
                last_error = ?,
                next_attempt_at = DATE_ADD(
                  UTC_TIMESTAMP(6),
                  INTERVAL ? SECOND
                )
            WHERE deal_id = ?
          `, [attempts, reason, delay, row.deal_id]);

          console.error('FALHA:', row.deal_id, reason);
          process.exitCode = 1;
        }
      }
    }
  }
} catch (error) {
  console.error('ERRO GERAL:', error.code || error.message);
  process.exitCode = 1;
} finally {
  if (locked) {
    await lock.query(
      "SELECT RELEASE_LOCK('digitale:disparo-sync')"
    );
  }

  lock.release();
  await disparo.end();
  await portal.end();
}
