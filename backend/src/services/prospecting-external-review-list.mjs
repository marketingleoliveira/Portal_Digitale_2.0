
// Consulta somente leitura da fila externa de CNPJ.

const VALID_STATUSES = new Set([
  'pending',
  'inconclusive',
  'review_required'
]);

export async function listExternalReviews(
  db,
  { limit = 20, status = null } = {}
) {
  const safeLimit = Number(limit);

  if (
    !Number.isInteger(safeLimit) ||
    safeLimit < 1 ||
    safeLimit > 100
  ) {
    throw new Error('invalid_limit');
  }

  if (status !== null && !VALID_STATUSES.has(status)) {
    throw new Error('invalid_status');
  }

  const [totals] = await db.execute(`
    SELECT status, COUNT(*) AS total
    FROM prospecting_external_cnpj_reviews
    GROUP BY status
    ORDER BY status
  `);

  let sql = `
    SELECT
      candidate_id,
      discovery_url,
      domain,
      status,
      attempts,
      evidence_json,
      error_message,
      created_at,
      updated_at
    FROM prospecting_external_cnpj_reviews
  `;

  const params = [];

  if (status !== null) {
    sql += ' WHERE status = ?';
    params.push(status);
  }

  sql += `
    ORDER BY
      CASE status
        WHEN 'review_required' THEN 0
        WHEN 'pending' THEN 1
        WHEN 'inconclusive' THEN 2
        ELSE 3
      END,
      updated_at DESC
    LIMIT ${safeLimit}
  `;

  const [rows] = await db.execute(sql, params);

  const items = rows.map(row => {
    let evidence = null;

    if (row.evidence_json) {
      try {
        evidence = typeof row.evidence_json === 'string'
          ? JSON.parse(row.evidence_json)
          : row.evidence_json;
      } catch {
        evidence = null;
      }
    }

    return {
      candidate_id: row.candidate_id,
      discovery_url: row.discovery_url,
      domain: row.domain,
      status: row.status,
      attempts: row.attempts,
      evidence,
      error_message: row.error_message,
      created_at: row.created_at,
      updated_at: row.updated_at,
      delivery_authorized: false
    };
  });

  return { totals, items };
}
