import {
  scanProspectingCandidate
} from './prospecting-email-scanner.mjs';

import {
  reserveEmailScan,
  finishEmailScan
} from './prospecting-email-scan-control.mjs';

export async function executeEmailScan(
  db,
  candidate,
  options = {}
) {
  const reservation = await reserveEmailScan(db, candidate);

  if (!reservation.reserved) {
    return {
      candidateId: candidate.id,
      skipped: true,
      reason: reservation.reason
    };
  }

  try {
    const result = await scanProspectingCandidate(
      db,
      candidate,
      options
    );

    const error = result.result === 'site_scan_completed'
      ? null
      : result.result;

    await finishEmailScan(db, candidate.id, {
      emailsFound: result.emailsFound,
      error
    });

    return {
      ...result,
      skipped: false,
      success: !error
    };

  } catch (error) {
    const reason = String(
      error?.message || 'email_scan_failed'
    ).slice(0, 191);

    await finishEmailScan(db, candidate.id, {
      emailsFound: 0,
      error: reason
    });

    throw error;
  }
}
