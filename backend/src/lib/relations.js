import { db } from "../database.js";
import { decodeRows } from "./rows.js";

function splitTopLevel(input) {
  const parts = [];
  let depth = 0;
  let current = "";

  for (const char of String(input || "")) {
    if (char === "(") depth++;
    if (char === ")") depth--;

    if (char === "," && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseSelect(input) {
  const scalars = [];
  const relations = [];
  let all = false;

  for (const token of splitTopLevel(input)) {
    const open = token.indexOf("(");
    if (open < 0) {
      if (token === "*") all = true;
      else if (token) scalars.push(token.trim());
      continue;
    }

    const close = token.lastIndexOf(")");
    if (close < open) continue;

    const head = token.slice(0, open).trim();
    const nested = token.slice(open + 1, close).trim();

    const colon = head.indexOf(":");
    const alias = colon >= 0 ? head.slice(0, colon).trim() : head.split("!")[0].trim();
    const spec = colon >= 0 ? head.slice(colon + 1).trim() : head;

    const bang = spec.indexOf("!");
    const table = bang >= 0 ? spec.slice(0, bang).trim() : spec.trim();
    const modifier = bang >= 0 ? spec.slice(bang + 1).trim() : "";

    relations.push({
      alias,
      table,
      constraint: modifier && modifier !== "inner" ? modifier : null,
      inner: modifier === "inner",
      select: nested || "*",
    });
  }

  return { all, scalars, relations };
}
async function findRelation(baseTable, spec) {
  if (spec.constraint) {
    const [rows] = await db.execute(
      `SELECT * FROM system_relations
       WHERE constraint_name=? LIMIT 1`,
      [spec.constraint]
    );
    if (rows[0]) return rows[0];
  }

  const [rows] = await db.execute(
    `SELECT * FROM system_relations
     WHERE (source_table=? AND target_table=?)
        OR (source_table=? AND target_table=?)
     ORDER BY source_table=? DESC
     LIMIT 1`,
    [baseTable, spec.table, spec.table, baseTable, baseTable]
  );

  return rows[0] || null;
}

async function relatedRows(baseTable, baseRow, spec) {
  const relation = await findRelation(baseTable, spec);
  if (!relation) return { value: null, many: false };

  let sql;
  let value;
  let many = false;

  if (relation.source_table === baseTable) {
    value = baseRow[relation.source_column];
    sql = `SELECT * FROM \`${relation.target_table}\`
           WHERE \`${relation.target_column}\` <=> ?`;
  } else {
    value = baseRow[relation.target_column];
    sql = `SELECT * FROM \`${relation.source_table}\`
           WHERE \`${relation.source_column}\` <=> ?`;
    many = true;
  }

  if (value === undefined || value === null) {
    return { value: many ? [] : null, many };
  }

  const [raw] = await db.execute(sql, [value]);
  const decoded = await decodeRows(spec.table, raw);
  const hydrated = await hydrateRows(spec.table, decoded, spec.select);

  return {
    value: many ? hydrated : hydrated[0] || null,
    many,
  };
}

function projectBase(row, ast) {
  if (ast.all) return { ...row };
  const out = {};

  for (const scalar of ast.scalars) {
    const raw = scalar.trim();
    const colon = raw.indexOf(":");
    const alias = colon >= 0 ? raw.slice(0, colon).trim() : raw;
    const column = colon >= 0 ? raw.slice(colon + 1).trim() : raw;
    if (column in row) out[alias] = row[column];
  }

  return out;
}
export async function hydrateRows(baseTable, rows, selectString) {
  const ast = parseSelect(selectString);
  if (!ast.relations.length) {
    return rows.map((row) => projectBase(row, ast));
  }

  const output = [];

  for (const row of rows) {
    const item = projectBase(row, ast);
    let keep = true;

    for (const relationSpec of ast.relations) {
      const relation = await relatedRows(baseTable, row, relationSpec);
      item[relationSpec.alias] = relation.value;

      if (
        relationSpec.inner &&
        (relation.value === null ||
          (Array.isArray(relation.value) && relation.value.length === 0))
      ) {
        keep = false;
      }
    }

    if (keep) output.push(item);
  }

  return output;
}

export function getNestedValue(row, path) {
  return String(path || "")
    .split(".")
    .reduce((value, part) => {
      if (Array.isArray(value)) {
        return value.map((item) => item?.[part]);
      }
      return value?.[part];
    }, row);
}
