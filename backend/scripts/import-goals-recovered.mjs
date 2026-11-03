import fs from "fs";
import mysql from "mysql2/promise";

const SOURCE = process.argv[2];

function loadEnv(path) {
  const result = {};

  for (const raw of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();

    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }

    const index = line.indexOf("=");

    let value = line.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[line.slice(0, index).trim()] = value;
  }

  return result;
}

function pgDecode(value) {
  if (value === "\\N") {
    return null;
  }

  let output = "";

  for (let i = 0; i < value.length; i++) {
    if (value[i] !== "\\") {
      output += value[i];
      continue;
    }

    i++;

    if (i >= value.length) {
      output += "\\";
      break;
    }

    const c = value[i];

    if (c === "n") output += "\n";
    else if (c === "r") output += "\r";
    else if (c === "t") output += "\t";
    else if (c === "b") output += "\b";
    else if (c === "f") output += "\f";
    else if (c === "v") output += "\v";
    else if (c === "\\") output += "\\";
    else output += c;
  }

  return output;
}

function parseCopy(text, table) {
  const escaped =
    table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const re = new RegExp(
    `COPY\\s+(?:public\\.)?"?${escaped}"?\\s*\\(([^)]*)\\)\\s+FROM\\s+stdin;`,
    "i"
  );

  const match = re.exec(text);

  if (!match) {
    return [];
  }

  const columns = match[1]
    .split(",")
    .map(
      value =>
        value.trim().replace(/^"|"$/g, "")
    );

  const body =
    text.slice(match.index + match[0].length);

  const rows = [];

  for (const line of body.split(/\r?\n/)) {
    if (line === "\\.") {
      break;
    }

    if (!line) {
      continue;
    }

    const parts = line.split("\t");

    if (parts.length !== columns.length) {
      continue;
    }

    const row = {};

    columns.forEach((column, index) => {
      row[column] = pgDecode(parts[index]);
    });

    rows.push(row);
  }

  return rows;
}

function pgArrayToJson(value) {
  if (
    typeof value !== "string" ||
    !value.startsWith("{") ||
    !value.endsWith("}")
  ) {
    return value;
  }

  const body = value.slice(1, -1);

  if (!body) {
    return "[]";
  }

  const items =
    body
      .split(",")
      .map(item =>
        item
          .trim()
          .replace(/^"(.*)"$/, "$1")
      );

  return JSON.stringify(items);
}

function normalizeDate(value) {
  if (!value || typeof value !== "string") {
    return value;
  }

  let output = value.replace("T", " ");

  output = output.replace(
    /([+-]\d{2}(?::?\d{2})?|Z)$/,
    ""
  );

  return output.trim();
}

function normalizeValue(value, column) {
  if (value === null) {
    return null;
  }

  const type =
    String(column.DATA_TYPE || "").toLowerCase();

  if (
    [
      "tinyint",
      "smallint",
      "mediumint",
      "int",
      "integer",
      "bigint"
    ].includes(type)
  ) {
    if (
      value === "t" ||
      value === "true"
    ) {
      return 1;
    }

    if (
      value === "f" ||
      value === "false"
    ) {
      return 0;
    }
  }

  if (type === "json") {
    if (
      typeof value === "string" &&
      value.startsWith("{") &&
      value.endsWith("}")
    ) {
      return pgArrayToJson(value);
    }

    try {
      JSON.parse(value);
      return value;
    } catch {
      return JSON.stringify(value);
    }
  }

  if (
    [
      "datetime",
      "timestamp",
      "date"
    ].includes(type)
  ) {
    return normalizeDate(value);
  }

  return value;
}

const env =
  loadEnv(
    "/etc/portal-digitale/backend.env"
  );

const db =
  await mysql.createConnection({
    host: env.DB_HOST || "127.0.0.1",
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database:
      env.DB_NAME || "portal_digitale",
    charset: "utf8mb4",
  });

async function tableColumns(table) {
  const [rows] =
    await db.execute(
      `
        SELECT
          COLUMN_NAME,
          DATA_TYPE,
          COLUMN_TYPE
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
      `,
      [table]
    );

  return new Map(
    rows.map(
      row => [
        row.COLUMN_NAME,
        row
      ]
    )
  );
}

async function restore(table, rows) {
  if (!rows.length) {
    return 0;
  }

  const columns =
    await tableColumns(table);

  let imported = 0;

  for (const source of rows) {
    const usable =
      Object.keys(source)
        .filter(column =>
          columns.has(column)
        );

    if (!usable.length) {
      continue;
    }

    const names =
      usable.map(
        column => `\`${column}\``
      );

    const values =
      usable.map(
        column =>
          normalizeValue(
            source[column],
            columns.get(column)
          )
      );

    const update =
      usable
        .filter(column => column !== "id")
        .map(
          column =>
            `\`${column}\`=VALUES(\`${column}\`)`
        );

    await db.execute(
      `
        INSERT INTO \`${table}\`
        (${names.join(",")})
        VALUES
        (${usable.map(() => "?").join(",")})
        ${
          update.length
            ? "ON DUPLICATE KEY UPDATE " +
              update.join(",")
            : ""
        }
      `,
      values
    );

    imported++;
  }

  return imported;
}

const sql =
  fs.readFileSync(
    SOURCE,
    "utf8"
  );

const goals =
  parseCopy(
    sql,
    "goals"
  );

const progress =
  parseCopy(
    sql,
    "goal_progress"
  );

console.log(
  `GOALS_ENCONTRADAS=${goals.length}`
);

console.log(
  `PROGRESSOS_ENCONTRADOS=${progress.length}`
);

if (!goals.length) {
  throw new Error(
    "O arquivo localizado não possui registros de metas."
  );
}

await db.query(
  "SET FOREIGN_KEY_CHECKS=0"
);

await db.beginTransaction();

try {

  const goalsImported =
    await restore(
      "goals",
      goals
    );

  const progressImported =
    await restore(
      "goal_progress",
      progress
    );

  await db.commit();

  console.log(
    `GOALS_IMPORTADAS=${goalsImported}`
  );

  console.log(
    `PROGRESSOS_IMPORTADOS=${progressImported}`
  );

} catch (error) {

  await db.rollback();

  console.error(
    "IMPORT_ROLLBACK=SIM"
  );

  throw error;

} finally {

  await db.query(
    "SET FOREIGN_KEY_CHECKS=1"
  );
}

const [[goalsFinal]] =
  await db.execute(
    "SELECT COUNT(*) AS total FROM goals"
  );

const [[progressFinal]] =
  await db.execute(
    "SELECT COUNT(*) AS total FROM goal_progress"
  );

console.log(
  `GOALS_FINAL=${goalsFinal.total}`
);

console.log(
  `GOAL_PROGRESS_FINAL=${progressFinal.total}`
);

await db.end();
