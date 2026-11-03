import mysql from "mysql2/promise";

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
      "portal_digitale"
  });

async function columns(table) {
  const [rows] =
    await db.execute(
      `
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS
        WHERE
          TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
      `,
      [table]
    );

  return new Set(
    rows.map(
      row => row.COLUMN_NAME
    )
  );
}

const rec =
  await columns(
    "meeting_recordings"
  );

const alterations = [
  [
    "status",
    `
      ALTER TABLE meeting_recordings
      ADD COLUMN status VARCHAR(32)
      NOT NULL DEFAULT 'completed'
    `
  ],

  [
    "storage_path",
    `
      ALTER TABLE meeting_recordings
      ADD COLUMN storage_path TEXT NULL
    `
  ],

  [
    "size_bytes",
    `
      ALTER TABLE meeting_recordings
      ADD COLUMN size_bytes BIGINT NULL
    `
  ],

  [
    "started_at",
    `
      ALTER TABLE meeting_recordings
      ADD COLUMN started_at DATETIME(6) NULL
    `
  ],

  [
    "completed_at",
    `
      ALTER TABLE meeting_recordings
      ADD COLUMN completed_at DATETIME(6) NULL
    `
  ],

  [
    "egress_id",
    `
      ALTER TABLE meeting_recordings
      ADD COLUMN egress_id VARCHAR(191) NULL
    `
  ],

  [
    "error_message",
    `
      ALTER TABLE meeting_recordings
      ADD COLUMN error_message TEXT NULL
    `
  ]
];

for (
  const [
    name,
    sql
  ] of alterations
) {
  if (!rec.has(name)) {
    await db.execute(sql);

    console.log(
      `COLUNA_ADICIONADA=${name}`
    );
  }
}

const meetingCols =
  await columns(
    "meetings"
  );

if (
  !meetingCols.has(
    "recording_ref"
  )
) {
  await db.execute(`
    ALTER TABLE meetings
    ADD COLUMN recording_ref
      CHAR(36) NULL
  `);

  console.log(
    "COLUNA_ADICIONADA=meetings.recording_ref"
  );
}

await db.execute(`
  UPDATE meeting_recordings
  SET status = 'completed'
  WHERE
    status IS NULL
    OR status = ''
`);

await db.end();

console.log(
  "BANCO_GRAVACOES=OK"
);
