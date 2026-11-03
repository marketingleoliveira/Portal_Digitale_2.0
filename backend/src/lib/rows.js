import { db } from "../database.js";

const metaCache = new Map();

export async function columnMeta(table) {
  if (metaCache.has(table)) return metaCache.get(table);

  const [rows] = await db.execute(
    `SELECT column_name,pg_data_type,udt_name,mysql_data_type
     FROM system_columns
     WHERE table_name=?`,
    [table]
  );

  const map = new Map(rows.map((r) => [r.column_name, r]));
  metaCache.set(table, map);
  return map;
}

export function clearMetaCache() {
  metaCache.clear();
}

function maybeJson(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
export async function decodeRow(table, row) {
  if (!row) return row;
  const meta = await columnMeta(table);
  const out = { ...row };

  for (const [key, value] of Object.entries(out)) {
    const c = meta.get(key);
    if (!c || value === null || value === undefined) continue;

    if (["json", "jsonb", "ARRAY"].includes(c.pg_data_type)) {
      out[key] = maybeJson(value);
    } else if (c.pg_data_type === "boolean") {
      out[key] = Boolean(value);
    }
  }

  return out;
}

export async function decodeRows(table, rows) {
  return Promise.all((rows || []).map((row) => decodeRow(table, row)));
}

export async function encodeValue(table, column, value) {
  if (value === undefined || value === null) return null;

  const meta = await columnMeta(table);
  const c = meta.get(column);
  if (!c) return value;

  if (["json", "jsonb", "ARRAY"].includes(c.pg_data_type)) {
    return typeof value === "string" ? value : JSON.stringify(value);
  }
  if (c.pg_data_type === "boolean") {
    return value ? 1 : 0;
  }

  if (
    String(c.pg_data_type).startsWith("timestamp") &&
    typeof value === "string"
  ) {
    return value
      .replace("T", " ")
      .replace(/Z$/, "")
      .replace(/([+-]\d\d:\d\d)$/, "");
  }

  if (typeof value === "object" && !Buffer.isBuffer(value)) {
    return JSON.stringify(value);
  }

  return value;
}
