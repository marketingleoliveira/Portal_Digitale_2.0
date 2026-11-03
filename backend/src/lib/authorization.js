import { db } from "../database.js";

const TECHNICAL_ROLES = new Set([
  "dev",
  "diretoria",
  "gerente",
]);

const FULL_ACCESS_ROLES = new Set([
  "admin",
  "dev",
  "diretoria",
  "gerente",
]);

const CREATION_ROLES = new Set([
  "criacao",
  "dev",
  "marketing",
  "diretoria",
  "gerente",
]);

const FILE_FULL_ROLES = new Set([
  "admin",
  "dev",
  "diretoria",
  "gerente",
  "sdr",
  "marketing",
]);

const PRODUCT_FULL_ROLES = new Set([
  "admin",
  "dev",
  "diretoria",
  "gerente",
  "marketing",
  "sdr",
]);

const FINANCE_FULL_ROLES = new Set([
  "financeiro",
  "admin",
  "dev",
  "diretoria",
  "gerente",
]);

export function isTechnical(user) {
  return TECHNICAL_ROLES.has(String(user?.role || ""));
}

export function hasFullAccess(user) {
  return FULL_ACCESS_ROLES.has(String(user?.role || ""));
}

export function hasRole(user, targetRole) {
  const role = String(user?.role || "");
  if (role === targetRole) return true;

  return (
    TECHNICAL_ROLES.has(role) &&
    FULL_ACCESS_ROLES.has(String(targetRole || ""))
  );
}

function same(a, b) {
  return String(a ?? "") === String(b ?? "");
}

async function one(sql, params = []) {
  const [rows] = await db.execute(sql, params);
  return rows[0] || null;
}

async function exists(sql, params = []) {
  return Boolean(await one(sql, params));
}
async function userRegion(userId) {
  const row = await one(
    "SELECT region FROM profiles WHERE id=? LIMIT 1",
    [userId]
  );
  return row?.region || null;
}

async function canViewFile(user, fileId) {
  const role = String(user?.role || "");
  if (FILE_FULL_ROLES.has(role)) return true;

  const roleAccess = await exists(
    `SELECT 1 FROM file_visibility
     WHERE file_id=? AND visible_to_role=?
     LIMIT 1`,
    [fileId, role]
  );

  if (!roleAccess) return false;
  if (role !== "vendedor") return true;

  const hasRegions = await exists(
    "SELECT 1 FROM file_region_visibility WHERE file_id=? LIMIT 1",
    [fileId]
  );

  if (!hasRegions) return true;

  const region = await userRegion(user.id);
  if (!region) return false;
  if (region === "INTERNO") return true;

  return exists(
    `SELECT 1 FROM file_region_visibility
     WHERE file_id=? AND region=?
     LIMIT 1`,
    [fileId, region]
  );
}

async function canViewProduct(user, productId) {
  const role = String(user?.role || "");
  if (PRODUCT_FULL_ROLES.has(role)) return true;

  return exists(
    `SELECT 1 FROM product_visibility
     WHERE product_id=? AND visible_to_role=?
     LIMIT 1`,
    [productId, role]
  );
}

async function canViewTicket(user, ticketId) {
  if (hasRole(user, "admin")) return true;

  return exists(
    "SELECT 1 FROM tickets WHERE id=? AND user_id=? LIMIT 1",
    [ticketId, user.id]
  );
}

async function canViewExpenseReport(user, reportId) {
  if (hasFullAccess(user) || user?.role === "financeiro") {
    return true;
  }

  return exists(
    "SELECT 1 FROM expense_reports WHERE id=? AND user_id=? LIMIT 1",
    [reportId, user.id]
  );
}

async function canViewCrmDeal(user, dealId) {
  if (hasFullAccess(user)) return true;

  return exists(
    `SELECT 1 FROM crm_deals
     WHERE id=? AND (owner_user_id=? OR created_by=?)
     LIMIT 1`,
    [dealId, user.id, user.id]
  );
}
async function canViewCrmEntity(user, table, row) {
  if (hasFullAccess(user)) return true;

  if (
    same(row.owner_user_id, user.id) ||
    same(row.created_by, user.id)
  ) {
    return true;
  }

  if (table === "crm_organizations") {
    return exists(
      `SELECT 1 FROM crm_deals
       WHERE organization_id=?
         AND (owner_user_id=? OR created_by=?)
       LIMIT 1`,
      [row.id, user.id, user.id]
    );
  }

  if (table === "crm_people") {
    return exists(
      `SELECT 1 FROM crm_deals
       WHERE person_id=?
         AND (owner_user_id=? OR created_by=?)
       LIMIT 1`,
      [row.id, user.id, user.id]
    );
  }

  return false;
}

async function canViewLead(user, row) {
  if (hasRole(user, "dev")) return true;
  if (user?.role === "sdr") return true;

  return (
    user?.role === "vendedor" &&
    same(row.assigned_to, user.id)
  );
}

function roleArrayIncludes(value, role) {
  if (Array.isArray(value)) {
    return value.map(String).includes(String(role));
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(String).includes(String(role));
      }
    } catch {}
  }

  return false;
}

async function rowById(table, id) {
  const safe = String(table || "");
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(safe)) return null;
  return one(
    `SELECT * FROM \`${safe}\` WHERE id=? LIMIT 1`,
    [id]
  );
}
export async function canReadRow(user, table, row) {
  if (!row) return false;

  if (!user) {
    if (table === "meetings") {
      return Boolean(row.is_active);
    }

    return (
      table === "meeting_messages" ||
      table === "meeting_participants" ||
      (table === "development_updates" && Boolean(row.is_published))
    );
  }

  if (isTechnical(user)) return true;

  const role = String(user.role || "");

  switch (table) {
    case "profiles":
      return (
        hasRole(user, "admin") ||
        Boolean(row.is_active) ||
        same(row.id, user.id)
      );

    case "user_roles":
    case "categories":
    case "subcategories":
    case "user_activity_sessions":
    case "user_presence":
    case "goal_progress":
    case "room_reservations":
    case "crm_pipelines":
    case "crm_settings":
    case "crm_stages":
    case "marketing_quick_responses":
      return true;

    case "files":
      return canViewFile(user, row.id);

    case "file_visibility":
    case "file_region_visibility":
      return canViewFile(user, row.file_id);

    case "products":
      return canViewProduct(user, row.id);

    case "product_visibility":
      return canViewProduct(user, row.product_id);

    case "goals":
      return (
        hasRole(user, "admin") ||
        roleArrayIncludes(row.visible_to_roles, role)
      );

    case "notifications":
      return (
        hasRole(user, "admin") ||
        roleArrayIncludes(row.visible_to_roles, role)
      );

    case "notification_reads":
      return same(row.user_id, user.id);

    case "user_notifications":
      return (
        hasRole(user, "admin") ||
        same(row.target_user_id, user.id)
      );

    case "price_files": {
      if (hasFullAccess(user) || role === "sdr") return true;
      if (role !== "vendedor") return false;
      const region = await userRegion(user.id);
      return (
        region === "INTERNO" ||
        !row.region ||
        !region ||
        String(row.region) === String(region)
      );
    }

    case "tickets":
      return hasRole(user, "admin") || same(row.user_id, user.id);

    case "ticket_messages":
    case "ticket_attachments":
      return canViewTicket(user, row.ticket_id);

    case "time_records":
      return (
        hasRole(user, "admin") ||
        role === "financeiro" ||
        same(row.user_id, user.id)
      );

    case "travel_expenses":
      return (
        FINANCE_FULL_ROLES.has(role) ||
        same(row.user_id, user.id)
      );

    case "expense_reports":
      return (
        hasFullAccess(user) ||
        role === "financeiro" ||
        same(row.user_id, user.id)
      );

    case "expense_items":
      return canViewExpenseReport(user, row.report_id);
    case "user_locations":
      return (
        hasRole(user, "dev") ||
        same(row.user_id, user.id)
      );

    case "user_location_history":
      return hasRole(user, "dev");

    case "access_logs":
      return hasRole(user, "admin");

    case "achieved_certificates":
      return (
        hasRole(user, "admin") ||
        hasRole(user, "dev") ||
        same(row.user_id, user.id)
      );

    case "creation_categories":
    case "creation_subcategories":
    case "creation_files":
      return CREATION_ROLES.has(role);

    case "marketing_leads":
    case "marketing_lead_contacts":
      return role === "marketing" || hasRole(user, "dev");

    case "marketing_requests":
    case "marketing_request_attachments":
      return role === "marketing" || hasRole(user, "dev");

    case "leads":
      return canViewLead(user, row);

    case "lead_activities":
      return (
        hasRole(user, "dev") ||
        role === "sdr" ||
        role === "vendedor"
      );

    case "lead_reminders":
    case "lead_schedules":
      return (
        hasRole(user, "dev") ||
        role === "sdr" ||
        role === "vendedor"
      );

    case "lead_service_sessions":
      return (
        hasRole(user, "dev") ||
        role === "sdr" ||
        (role === "vendedor" && same(row.user_id, user.id))
      );

    case "meeting_recordings":
      return (
        hasRole(user, "admin") ||
        role === "marketing"
      );

    case "testimonial_schedules":
      return role === "marketing" || hasRole(user, "dev");

    case "erp_settings":
      return true;

    case "development_updates":
      return Boolean(row.is_published) || hasRole(user, "dev");

    case "crm_deals":
      return canViewCrmDeal(user, row.id);

    case "crm_organizations":
    case "crm_people":
      return canViewCrmEntity(user, table, row);

    case "crm_activities":
      return (
        same(row.created_by, user.id) ||
        same(row.assigned_to, user.id) ||
        (row.deal_id && await canViewCrmDeal(user, row.deal_id))
      );

    case "crm_deal_products":
      return canViewCrmDeal(user, row.deal_id);

    case "crm_ownership_transfers":
      return (
        hasFullAccess(user) ||
        same(row.from_user_id, user.id) ||
        same(row.to_user_id, user.id)
      );

    case "meetings":
      return (
        Boolean(row.is_active) ||
        same(row.host_user_id, user.id) ||
        await exists(
          `SELECT 1 FROM meeting_participants
           WHERE meeting_id=? AND user_id=?
           LIMIT 1`,
          [row.id, user.id]
        )
      );

    case "meeting_messages":
    case "meeting_participants":
      return true;

    default:
      return hasFullAccess(user);
  }
}
async function canMutateExpenseItem(user, row) {
  if (!row?.report_id) return false;
  return canViewExpenseReport(user, row.report_id);
}

async function canMutateTicketChild(user, row) {
  if (!row?.ticket_id) return false;
  return canViewTicket(user, row.ticket_id);
}

export async function canInsertRow(user, table, row) {
  if (!user) {
    return (
      table === "meeting_messages" ||
      table === "meeting_participants"
    );
  }

  if (isTechnical(user)) return true;

  const role = String(user.role || "");

  switch (table) {
    case "profiles":
    case "user_roles":
    case "categories":
    case "subcategories":
    case "files":
    case "file_visibility":
    case "file_region_visibility":
    case "products":
    case "product_visibility":
      return hasRole(user, "admin");

    case "access_logs":
    case "achieved_certificates":
    case "notification_reads":
    case "user_locations":
    case "user_location_history":
    case "user_presence":
    case "user_activity_sessions":
    case "time_records":
      return same(row.user_id, user.id);

    case "goal_progress":
      return (
        hasRole(user, "admin") ||
        same(row.user_id, user.id)
      );

    case "goals":
      return hasRole(user, "admin");

    case "notifications":
      return (
        hasRole(user, "admin") ||
        (role === "gerente" && same(row.created_by, user.id))
      );

    case "user_notifications":
      return (
        hasRole(user, "admin") ||
        (
          (role === "sdr" || role === "vendedor") &&
          same(row.created_by, user.id)
        )
      );

    case "tickets":
      return same(row.user_id, user.id);

    case "ticket_messages":
      return (
        same(row.user_id, user.id) &&
        await canMutateTicketChild(user, row)
      );

    case "ticket_attachments":
      return (
        same(row.created_by, user.id) &&
        await canMutateTicketChild(user, row)
      );

    case "travel_expenses":
      return (
        FINANCE_FULL_ROLES.has(role) ||
        same(row.user_id, user.id)
      );

    case "expense_reports":
      return same(row.user_id, user.id);

    case "expense_items":
      return canMutateExpenseItem(user, row);

    case "room_reservations":
      return same(row.user_id, user.id);

    case "creation_categories":
    case "creation_subcategories":
    case "creation_files":
      return CREATION_ROLES.has(role);

    case "marketing_leads":
    case "marketing_lead_contacts":
      return role === "marketing" || hasRole(user, "dev");

    case "marketing_requests":
      return (
        role === "marketing" &&
        same(row.created_by, user.id)
      );

    case "marketing_request_attachments":
      return (
        role === "marketing" &&
        same(row.uploaded_by, user.id)
      );

    case "marketing_quick_responses":
      return same(row.created_by, user.id);
    case "leads":
      return (
        (role === "sdr" || role === "vendedor") &&
        same(row.created_by, user.id)
      );

    case "lead_activities":
      return (
        (role === "sdr" || role === "vendedor") &&
        same(row.user_id, user.id)
      );

    case "lead_reminders":
      return (
        (role === "sdr" || role === "vendedor") &&
        same(row.created_by, user.id)
      );

    case "lead_schedules":
      return (
        (role === "sdr" || role === "vendedor") &&
        same(row.created_by, user.id)
      );

    case "lead_service_sessions":
      return same(row.user_id, user.id);

    case "meeting_recordings":
      return true;

    case "testimonial_schedules":
      return (
        role === "marketing" &&
        same(row.created_by, user.id)
      );

    case "erp_settings":
    case "development_updates":
      return hasRole(user, "dev");

    case "crm_deals":
      return (
        same(row.created_by, user.id) &&
        (
          hasFullAccess(user) ||
          same(row.owner_user_id, user.id)
        )
      );

    case "crm_activities":
    case "crm_people":
    case "crm_organizations":
    case "crm_deal_products":
      return same(row.created_by, user.id);

    case "crm_ownership_transfers":
      return same(row.transferred_by, user.id);

    case "crm_pipelines":
    case "crm_settings":
    case "crm_stages":
      return hasFullAccess(user);

    case "meetings":
      return same(row.host_user_id, user.id);

    case "meeting_messages":
    case "meeting_participants":
      return true;

    default:
      return false;
  }
}

export async function canUpdateRow(user, table, current, patch) {
  if (!user) {
    return false;
  }

  if (isTechnical(user)) return true;

  const role = String(user.role || "");
  const next = { ...current, ...(patch || {}) };

  switch (table) {
    case "profiles":
      return hasRole(user, "admin") || same(current.id, user.id);

    case "user_roles":
    case "categories":
    case "subcategories":
    case "files":
    case "file_visibility":
    case "file_region_visibility":
    case "products":
    case "product_visibility":
      return hasRole(user, "admin");

    case "goal_progress":
      return hasRole(user, "admin") || same(current.user_id, user.id);

    case "goals":
      return hasRole(user, "admin");

    case "user_locations":
    case "user_presence":
    case "user_activity_sessions":
    case "time_records":
      return same(current.user_id, user.id) || hasRole(user, "admin");

    case "travel_expenses":
      return (
        FINANCE_FULL_ROLES.has(role) ||
        same(current.user_id, user.id)
      );

    case "expense_reports":
      return (
        hasFullAccess(user) ||
        role === "financeiro" ||
        same(current.user_id, user.id)
      );

    case "expense_items":
      return canMutateExpenseItem(user, current);

    case "tickets":
      return hasRole(user, "admin") || same(current.user_id, user.id);

    case "room_reservations":
      return same(current.user_id, user.id) || hasFullAccess(user);

    case "creation_categories":
    case "creation_subcategories":
    case "creation_files":
      return CREATION_ROLES.has(role);

    case "marketing_leads":
    case "marketing_lead_contacts":
      return role === "marketing" || hasRole(user, "dev");

    case "marketing_requests":
      return role === "marketing";

    case "marketing_quick_responses":
      return same(current.created_by, user.id);

    case "leads":
      return (
        role === "sdr" ||
        (
          role === "vendedor" &&
          same(current.assigned_to, user.id)
        )
      );

    case "lead_reminders":
      return (
        (role === "sdr" || role === "vendedor") &&
        same(current.created_by, user.id)
      );

    case "lead_schedules":
      return (
        (role === "sdr" || role === "vendedor") &&
        same(current.created_by, user.id)
      );

    case "lead_service_sessions":
      return same(current.user_id, user.id);

    case "testimonial_schedules":
      return role === "marketing";

    case "erp_settings":
    case "development_updates":
      return hasRole(user, "dev");

    case "crm_deals":
    case "crm_people":
    case "crm_organizations":
      return (
        same(current.created_by, user.id) ||
        same(current.owner_user_id, user.id) ||
        hasFullAccess(user)
      );

    case "crm_activities":
      return (
        same(current.created_by, user.id) ||
        same(current.assigned_to, user.id) ||
        hasFullAccess(user)
      );

    case "crm_deal_products":
      return (
        same(current.created_by, user.id) ||
        hasFullAccess(user)
      );

    case "meetings":
      return same(current.host_user_id, user.id);

    case "meeting_participants":
      return (
        same(current.user_id, user.id) ||
        same(next.user_id, user.id)
      );

    default:
      return false;
  }
}
export async function canDeleteRow(user, table, current) {
  if (!user) return false;
  if (isTechnical(user)) return true;

  const role = String(user.role || "");

  switch (table) {
    case "profiles":
    case "user_roles":
    case "categories":
    case "subcategories":
    case "files":
    case "file_visibility":
    case "file_region_visibility":
    case "products":
    case "product_visibility":
    case "goals":
      return hasRole(user, "admin");

    case "goal_progress":
    case "notification_reads":
    case "user_notifications":
    case "user_activity_sessions":
    case "user_location_history":
    case "user_presence":
    case "development_updates":
      return hasRole(user, "dev");

    case "notifications":
      return hasRole(user, "admin") || hasRole(user, "dev");

    case "tickets":
      return false;

    case "travel_expenses":
      return (
        FINANCE_FULL_ROLES.has(role) ||
        same(current.user_id, user.id)
      );

    case "expense_reports":
      return (
        hasFullAccess(user) ||
        same(current.user_id, user.id)
      );

    case "expense_items":
      return canMutateExpenseItem(user, current);

    case "room_reservations":
      return same(current.user_id, user.id) || hasFullAccess(user);

    case "creation_categories":
    case "creation_subcategories":
    case "creation_files":
      return CREATION_ROLES.has(role);

    case "marketing_leads":
    case "marketing_lead_contacts":
      return role === "marketing" || hasRole(user, "dev");

    case "marketing_requests":
      return hasRole(user, "dev");

    case "marketing_quick_responses":
      return same(current.created_by, user.id);

    case "lead_reminders":
      return (
        (role === "sdr" || role === "vendedor") &&
        same(current.created_by, user.id)
      );

    case "lead_schedules":
      return hasRole(user, "dev");

    case "lead_service_sessions":
      return hasRole(user, "dev");

    case "testimonial_schedules":
      return hasRole(user, "dev");

    case "crm_deals":
    case "crm_people":
    case "crm_organizations":
      return (
        same(current.created_by, user.id) ||
        same(current.owner_user_id, user.id) ||
        hasFullAccess(user)
      );

    case "crm_activities":
      return (
        same(current.created_by, user.id) ||
        same(current.assigned_to, user.id) ||
        hasFullAccess(user)
      );

    case "crm_deal_products":
      return (
        same(current.created_by, user.id) ||
        hasFullAccess(user)
      );

    case "meetings":
      return same(current.host_user_id, user.id);

    default:
      return false;
  }
}

export async function filterReadableRows(user, table, rows) {
  const output = [];

  for (const row of rows || []) {
    if (await canReadRow(user, table, row)) {
      output.push(row);
    }
  }

  return output;
}
