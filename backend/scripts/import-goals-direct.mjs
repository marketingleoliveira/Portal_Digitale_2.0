import fs from "node:fs";
import mysql from "mysql2/promise";

const [goalsPath, progressPath] =
  process.argv.slice(2);

const GOAL_COLUMNS = [
  "id",
  "title",
  "description",
  "target_value",
  "unit",
  "period_type",
  "visible_to_roles",
  "is_active",
  "created_by",
  "created_at",
  "updated_at",
  "goal_type",
  "target_user_id",
];

const PROGRESS_COLUMNS = [
  "id",
  "goal_id",
  "user_id",
  "current_value",
  "period_start",
  "period_end",
  "notes",
  "updated_at",
  "updated_by",
];

function pgUnescape(value) {
  if (value === "\\N") {
    return null;
  }

  let output = "";

  for (
    let i = 0;
    i < value.length;
    i++
  ) {
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

function readRows(path, columns) {
  return fs
    .readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(
      line =>
        line &&
        line !== "\\."
    )
    .map((line, index) => {
      const values =
        line.split("\t");

      if (
        values.length !==
        columns.length
      ) {
        throw new Error(
          `Linha inválida ${index + 1}`
        );
      }

      return Object.fromEntries(
        columns.map(
          (column, i) => [
            column,
            pgUnescape(values[i]),
          ]
        )
      );
    });
}

function arrayToJson(value) {
  if (value == null) {
    return null;
  }

  if (
    !value.startsWith("{") ||
    !value.endsWith("}")
  ) {
    return value;
  }

  const content =
    value.slice(1, -1);

  if (!content) {
    return "[]";
  }

  return JSON.stringify(
    content
      .split(",")
      .map(
        item =>
          item
            .trim()
            .replace(/^"|"$/g, "")
      )
  );
}

function removeTimezone(value) {
  if (!value) {
    return value;
  }

  return value
    .replace(
      /([+-]\d{2}(?::?\d{2})?|Z)$/i,
      ""
    )
    .trim()
    .replace("T", " ");
}

const db =
  await mysql.createConnection({
    host:
      process.env.DB_HOST ||
      "127.0.0.1",

    port:
      Number(
        process.env.DB_PORT ||
        3306
      ),

    user:
      process.env.DB_USER,

    password:
      process.env.DB_PASSWORD,

    database:
      process.env.DB_NAME ||
      "portal_digitale",

    charset:
      "utf8mb4",
  });

async function getSchema(table) {
  const [rows] =
    await db.execute(
      `
        SELECT
          COLUMN_NAME,
          DATA_TYPE
        FROM information_schema.COLUMNS
        WHERE
          TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
      `,
      [table]
    );

  return new Map(
    rows.map(
      row => [
        row.COLUMN_NAME,
        String(
          row.DATA_TYPE
        ).toLowerCase(),
      ]
    )
  );
}

function normalize(
  column,
  value,
  type
) {
  if (value == null) {
    return null;
  }

  if (
    column ===
    "visible_to_roles"
  ) {
    return arrayToJson(value);
  }

  if (
    column ===
    "is_active"
  ) {
    return [
      "t",
      "true",
      "1",
    ].includes(
      String(value)
        .toLowerCase()
    )
      ? 1
      : 0;
  }

  if (
    type === "datetime" ||
    type === "timestamp"
  ) {
    return removeTimezone(value);
  }

  return value;
}

async function upsert(
  table,
  rows
) {
  const schema =
    await getSchema(table);

  let imported = 0;

  for (const row of rows) {
    const columns =
      Object.keys(row)
        .filter(
          column =>
            schema.has(column)
        );

    const values =
      columns.map(
        column =>
          normalize(
            column,
            row[column],
            schema.get(column)
          )
      );

    const names =
      columns.map(
        column =>
          `\`${column}\``
      );

    const updates =
      columns
        .filter(
          column =>
            column !== "id"
        )
        .map(
          column =>
            `\`${column}\`=VALUES(\`${column}\`)`
        );

    await db.execute(
      `
        INSERT INTO \`${table}\`
        (${names.join(",")})
        VALUES
        (${columns.map(() => "?").join(",")})
        ${
          updates.length
            ? "ON DUPLICATE KEY UPDATE " +
              updates.join(",")
            : ""
        }
      `,
      values
    );

    imported++;
  }

  return imported;
}

const goals =
  readRows(
    goalsPath,
    GOAL_COLUMNS
  );

const progress =
  readRows(
    progressPath,
    PROGRESS_COLUMNS
  );

console.log(
  `GOALS_RECUPERADAS=${goals.length}`
);

console.log(
  `PROGRESSOS_RECUPERADOS=${progress.length}`
);

await db.query(
  "SET FOREIGN_KEY_CHECKS=0"
);

await db.beginTransaction();

try {

  const goalsImported =
    await upsert(
      "goals",
      goals
    );

  const progressImported =
    await upsert(
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
  await db.query(
    "SELECT COUNT(*) AS total FROM goals"
  );

const [[progressFinal]] =
  await db.query(
    "SELECT COUNT(*) AS total FROM goal_progress"
  );

console.log(
  `GOALS_FINAL=${goalsFinal.total}`
);

console.log(
  `GOAL_PROGRESS_FINAL=${progressFinal.total}`
);

await db.end();
