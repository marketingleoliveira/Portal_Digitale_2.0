import crypto from "node:crypto";
import {
  withCrmTransaction,
  CrmTransactionAbort
} from "./crm-transaction.mjs";

const TRANSFER_ROLES = new Set([
  "admin",
  "dev",
  "diretoria",
  "gerente"
]);

const DESTINATION_ROLES = [
  "vendedor",
  "sdr",
  "gerente",
  "diretoria",
  "dev"
];

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function abort(status, message) {
  throw new CrmTransactionAbort(status, message);
}

export async function transferCrmDealsAtomic({
  pool,
  user,
  dealIds,
  toUserId,
  reason = null
}) {
  if (!user?.id || !TRANSFER_ROLES.has(String(user.role))) {
    abort(403, "transfer_forbidden");
  }

  if (!UUID.test(String(user.id))) {
    abort(403, "invalid_authenticated_user");
  }

  if (!UUID.test(String(toUserId || ""))) {
    abort(400, "invalid_destination");
  }

  if (!Array.isArray(dealIds) || dealIds.length < 1 ||
      dealIds.length > 100) {
    abort(400, "invalid_deal_batch");
  }

  if (!dealIds.every(id => typeof id === "string" && UUID.test(id))) {
    abort(400, "invalid_deal_id");
  }

  const ids = [...new Set(dealIds.map(id => id.toLowerCase()))].sort();

  if (ids.length !== dealIds.length) {
    abort(400, "duplicate_deal_ids");
  }

  if (reason !== null &&
      (typeof reason !== "string" || reason.length > 1000)) {
    abort(400, "invalid_reason");
  }

  return withCrmTransaction(pool, async ({ connection }) => {
    const [destinations] = await connection.execute(
      `SELECT u.id
       FROM system_users u
       JOIN profiles p ON p.id = u.id
       JOIN user_roles r ON r.user_id = u.id
       WHERE u.id = ?
         AND u.disabled = 0
         AND p.is_active = 1
         AND r.role IN (?, ?, ?, ?, ?)
       LIMIT 1`,
      [toUserId, ...DESTINATION_ROLES]
    );

    if (destinations.length !== 1) {
      abort(400, "destination_not_active_or_authorized");
    }

    const changes = [];

    for (const id of ids) {
      const [rows] = await connection.execute(
        `SELECT id, owner_user_id, created_by
         FROM crm_deals
         WHERE id = ?
         FOR UPDATE`,
        [id]
      );

      if (rows.length !== 1) {
        abort(404, "deal_not_found");
      }

      const deal = rows[0];
      const previousOwner = deal.owner_user_id ?? null;

      if (String(previousOwner ?? "").toLowerCase() === String(toUserId).toLowerCase()) {
        continue;
      }

      const [updated] = await connection.execute(
        `UPDATE crm_deals
         SET owner_user_id = ?
         WHERE id = ?`,
        [toUserId, id]
      );

      if (updated.affectedRows !== 1) {
        abort(409, "deal_update_conflict");
      }

      await connection.execute(
        `INSERT INTO crm_ownership_transfers
          (id, entity_type, entity_id,
           from_user_id, to_user_id,
           reason, transferred_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(6))`,
        [
          crypto.randomUUID(),
          "crm_deals",
          id,
          previousOwner,
          toUserId,
          reason?.trim() || null,
          user.id
        ]
      );

      changes.push({
        dealId: id,
        fromUserId: previousOwner,
        toUserId
      });
    }

    return {
      data: changes,
      error: null,
      count: changes.length
    };
  });
}
