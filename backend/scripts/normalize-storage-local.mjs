import mysql from "mysql2/promise";

const connection =
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

const OLD_HOST =
  "ddgbqeaqksiamnnzioyv.supabase.co";

function convert(value) {
  if (
    typeof value !== "string" ||
    !value.includes(OLD_HOST)
  ) {
    return value;
  }

  return value.replace(
    new RegExp(
      "https?://" +
      OLD_HOST.replaceAll(
        ".",
        "\\."
      ) +
      "/storage/v1/object/public/" +
      "([^/]+)/" +
      "([^\\s\\\"'<>?#]+)" +
      "(?:\\?[^\\s\\\"'<>]*)?",
      "g"
    ),

    (_, bucket, rawPath) => {
      let filePath = rawPath;

      try {
        filePath =
          decodeURIComponent(rawPath);
      } catch {}

      return (
        "/api/storage/public" +
        "?bucket=" +
        encodeURIComponent(bucket) +
        "&path=" +
        encodeURIComponent(filePath)
      );
    }
  );
}

const [columns] =
  await connection.query(`
    SELECT
      c.TABLE_NAME,
      c.COLUMN_NAME
    FROM information_schema.COLUMNS c
    WHERE c.TABLE_SCHEMA = DATABASE()
      AND c.DATA_TYPE IN (
        'char',
        'varchar',
        'tinytext',
        'text',
        'mediumtext',
        'longtext'
      )
  `);

const [primaryKeys] =
  await connection.query(`
    SELECT
      TABLE_NAME,
      COLUMN_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME = 'PRIMARY'
    ORDER BY TABLE_NAME,
             ORDINAL_POSITION
  `);

const keysByTable =
  new Map();

for (
  const {
    TABLE_NAME,
    COLUMN_NAME
  }
  of primaryKeys
) {
  if (!keysByTable.has(TABLE_NAME)) {
    keysByTable.set(
      TABLE_NAME,
      []
    );
  }

  keysByTable
    .get(TABLE_NAME)
    .push(COLUMN_NAME);
}

let updated = 0;

for (
  const {
    TABLE_NAME,
    COLUMN_NAME
  }
  of columns
) {
  const keys =
    keysByTable.get(TABLE_NAME)
    || [];

  if (keys.length !== 1) {
    continue;
  }

  const pk = keys[0];

  const table =
    `\`${TABLE_NAME
      .replaceAll("`", "``")}\``;

  const column =
    `\`${COLUMN_NAME
      .replaceAll("`", "``")}\``;

  const primary =
    `\`${pk
      .replaceAll("`", "``")}\``;

  const [rows] =
    await connection.query(
      `
        SELECT
          ${primary} AS pk,
          ${column} AS value
        FROM ${table}
        WHERE ${column}
          LIKE ?
      `,
      [`%${OLD_HOST}%`]
    );

  for (const row of rows) {
    const converted =
      convert(row.value);

    if (
      converted === row.value
    ) {
      continue;
    }

    await connection.query(
      `
        UPDATE ${table}
        SET ${column} = ?
        WHERE ${primary} = ?
      `,
      [
        converted,
        row.pk
      ]
    );

    updated++;
  }
}

console.log(
  `STORAGE_URLS_MIGRADAS=${updated}`
);

await connection.end();
