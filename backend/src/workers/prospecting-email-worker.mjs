import {db} from '../database.js';

import {
  executeEmailScan
} from '../services/prospecting-email-executor.mjs';

const executeRequested = process.argv.includes('--execute');
const pilotConfirmed = process.argv.includes('--pilot-one');

if (executeRequested && !pilotConfirmed) {
  console.error('EXECUCAO BLOQUEADA: exige --pilot-one.');
  process.exit(2);
}

if (pilotConfirmed && !executeRequested) {
  console.error('ARGUMENTOS INVALIDOS: falta --execute.');
  process.exit(2);
}

const execute = executeRequested && pilotConfirmed;

const idArgs = process.argv.filter(
  arg => arg.startsWith('--candidate-id=')
);

if (idArgs.length > 1) {
  console.error('BLOQUEADO: ID duplicado.');
  process.exit(2);
}

const candidateId = idArgs.length
  ? idArgs[0].slice('--candidate-id='.length)
  : null;

if (
  (execute && !candidateId) ||
  (candidateId && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(candidateId))
) {
  console.error('BLOQUEADO: ID valido obrigatorio.');
  process.exit(2);
}

const query = `
  SELECT
    c.id,
    c.domain,
    c.discovery_url,
    c.status,
    c.reason
  FROM prospecting_auto_candidates c
  WHERE c.status IN (
    'rejected', 'delivered', 'duplicate', 'review', 'discovered'
  )
    AND (c.reason IS NULL OR c.reason <> 'excluded_or_own_domain')
    AND NOT EXISTS (
      SELECT 1
      FROM prospecting_email_scans s
      WHERE BINARY s.candidate_id = BINARY c.id
    )
    AND (? IS NULL OR BINARY c.id = BINARY ?)
  ORDER BY c.discovered_at ASC
  LIMIT ${execute ? 1 : 10}
`;

try {
  const [candidates] = await db.execute(
    query,
    [candidateId, candidateId]
  );

  console.log(JSON.stringify({
    event: 'email_worker_selection',
    mode: execute ? 'execute' : 'dry_run',
    selected: candidates.length
  }));

  if (!execute) {
    for (const candidate of candidates) {
      console.log(JSON.stringify({
        id: candidate.id,
        domain: candidate.domain,
        crm_status: candidate.status,
        reason: candidate.reason
      }));
    }

    console.log('SIMULACAO CONCLUIDA: nenhuma analise executada.');
  } else {
    for (const candidate of candidates) {
      try {
        const result = await executeEmailScan(db, candidate);
        console.log(JSON.stringify({
          event: 'email_scan_result',
          ...result
        }));

        if (result.reason === 'scan_quota_reached') break;
      } catch (error) {
        console.error(JSON.stringify({
          event: 'email_scan_error',
          candidateId: candidate.id,
          error: String(error?.message || 'unknown').slice(0, 191)
        }));
      }
    }
  }
} catch (error) {
  console.error('Falha no trabalhador:', error.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
