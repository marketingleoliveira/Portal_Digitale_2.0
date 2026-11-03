import crypto from 'node:crypto';

export function normalizeProspectingEmail(value, domain) {
  const email = String(value ?? '').trim().toLowerCase();
  const siteDomain = String(domain ?? '').trim().toLowerCase();

  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) {
    return null;
  }

  const emailDomain = email.split('@')[1];

  if (
    !siteDomain ||
    (emailDomain !== siteDomain &&
     !emailDomain.endsWith('.' + siteDomain))
  ) {
    return null;
  }

  return email;
}

export async function storeProspectingEmails(db, data) {
  const domain = String(data?.domain ?? '').trim().toLowerCase();
  const unique = new Set();

  for (const value of data?.emails ?? []) {
    const email = normalizeProspectingEmail(value, domain);
    if (email) unique.add(email);
  }

  let processed = 0;

  for (const email of unique) {
    await db.execute(
      `INSERT INTO prospecting_email_contacts
       (
         id, candidate_id, domain, email, source_url,
         segment_confirmed, status, sync_status
       )
       VALUES (?, ?, ?, ?, ?, 0, 'pending_review', 'pending')
       ON DUPLICATE KEY UPDATE
         last_found_at = UTC_TIMESTAMP(6)`,
      [
        crypto.randomUUID(),
        data?.candidateId || null,
        domain,
        email,
        data?.sourceUrl || null
      ]
    );

    processed++;
  }

  return {processed};
}
