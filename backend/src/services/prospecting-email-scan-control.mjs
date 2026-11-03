export const EMAIL_SCAN_HOURLY_LIMIT = 12;
export const EMAIL_SCAN_DAILY_LIMIT = 60;

export function scanQuotaAvailable(hour, day) {
  return (
    Number(hour) < EMAIL_SCAN_HOURLY_LIMIT &&
    Number(day) < EMAIL_SCAN_DAILY_LIMIT
  );
}

export async function reserveEmailScan(db, candidate) {
  if (!candidate?.id || !candidate?.domain) {
    throw Error('invalid_scan_candidate');
  }

  const connection = await db.getConnection();
  let locked = false;

  try {
    const [[lock]] = await connection.query(
      "SELECT GET_LOCK('digitale:email-scan-control',10) AS acquired"
    );

    if (Number(lock.acquired) !== 1) {
      throw Error('email_scan_lock_timeout');
    }

    locked = true;

    const [[usage]] = await connection.execute(`
      SELECT
        COALESCE(SUM(
          scanned_at >= UTC_TIMESTAMP(6) - INTERVAL 1 HOUR
        ),0) AS hour_count,
        COALESCE(SUM(
          scanned_at >= UTC_DATE()
        ),0) AS day_count
      FROM prospecting_email_scans
    `);

    if (!scanQuotaAvailable(
      usage.hour_count,
      usage.day_count
    )) {
      return {reserved: false, reason: 'scan_quota_reached'};
    }

    const [result] = await connection.execute(
      `INSERT IGNORE INTO prospecting_email_scans
       (candidate_id,domain,scan_status,scanned_at)
       VALUES (?,?,'running',UTC_TIMESTAMP(6))`,
      [candidate.id, candidate.domain]
    );

    if (result.affectedRows !== 1) {
      return {reserved: false, reason: 'already_scanned'};
    }

    return {reserved: true};

  } finally {
    if (locked) {
      await connection.query(
        "SELECT RELEASE_LOCK('digitale:email-scan-control')"
      );
    }
    connection.release();
  }
}

export async function finishEmailScan(
  db,
  candidateId,
  {emailsFound = 0, error = null} = {}
) {
  await db.execute(
    `UPDATE prospecting_email_scans
     SET scan_status = ?,
         emails_found = ?,
         last_error = ?
     WHERE candidate_id = ?`,
    [
      error ? 'failed' : 'completed',
      Number(emailsFound) || 0,
      error ? String(error).slice(0,191) : null,
      candidateId
    ]
  );
}
