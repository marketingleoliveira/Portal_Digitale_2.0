import fs from "node:fs";
import mysql from "mysql2/promise";

const work = process.argv[2];

const TABLES = [
  {
    table: "leads",
    file: "leads.tsv",
    columns: [
      "id","company_name","contact_name","contact_email","contact_phone",
      "status","source","estimated_value","notes","assigned_to","created_by",
      "created_at","updated_at","last_contact_at","expected_close_date",
      "cnpj","razao_social","categoria","setor","responsavel",
      "compra_tecido_mensal","rua","bairro","cep","scope","source_lead_id",
      "attendance_status"
    ],
  },
  {
    table: "lead_activities",
    file: "lead_activities.tsv",
    columns: [
      "id","lead_id","user_id","activity_type","description",
      "previous_status","new_status","created_at"
    ],
  },
  {
    table: "lead_schedules",
    file: "lead_schedules.tsv",
    columns: [
      "id","lead_id","meeting_id","scheduled_date","title","notes",
      "created_by","created_at","updated_at","completed_at"
    ],
  },
  {
    table: "lead_service_sessions",
    file: "lead_service_sessions.tsv",
    columns: [
      "id","lead_id","user_id","started_at","ended_at",
      "start_latitude","start_longitude","start_address","start_accuracy",
      "end_latitude","end_longitude","end_address","end_accuracy",
      "notes","created_at","updated_at"
    ],
  },
  {
    table: "marketing_leads",
    file: "marketing_leads.tsv",
    columns: [
      "id","company_name","contact_name","contact_email","contact_phone",
      "status","notes","created_by","created_at","updated_at"
    ],
  },
  {
    table: "marketing_lead_contacts",
    file: "marketing_lead_contacts.tsv",
    columns: [
      "id","lead_id","contact_type","result","message","created_by","created_at"
    ],
  },
];

function pgUnescape(value) {
  if (value === "\\N") return null;

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
    const map = {
      n: "\n",
      r: "\r",
      t: "\t",
      b: "\b",
      f: "\f",
      v: "\v",
      "\\": "\\",
    };

    if (Object.prototype.hasOwnProperty.call(map, c)) {
      output += map[c];
    } else {
      output += c;
    }
  }

  return output;
}

function parseRows(file, columns) {
  const content = fs.readFileSync(file, "utf8");
  const rows = [];

  for (const line of content.split(/\r?\n/)) {
    if (!line) continue;

    const values = line.split("\t");

    if (values.length !== columns.length) {
      throw new Error(
        `Linha inválida em ${file}: ${values.length} campos; esperado ${columns.length}`
      );
    }

    const row = {};

    columns.forEach((column, index) => {
      row[column] = pgUnescape(values[index]);
    });

    rows.push(row);
  }

  return rows;
}

function normalizeDate(value) {
  if (!value) return value;

  return String(value)
    .replace("T", " ")
    .replace(/([+-]\d{2}(?::?\d{2})?|Z)$/i, "")
    .trim();
}

function normalizeValue(value, type) {
  if (value === null) return null;

  const t = String(type || "").toLowerCase();

  if (["tinyint","smallint","mediumint","int","integer","bigint"].includes(t)) {
    const lower = String(value).toLowerCase();
    if (lower === "t" || lower === "true") return 1;
    if (lower === "f" || lower === "false") return 0;
  }

  if (t === "datetime" || t === "timestamp") {
    return normalizeDate(value);
  }

  return value;
}

const db = await mysql.createConnection({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "portal_digitale",
  charset: "utf8mb4",
});

async function schema(table) {
  const [rows] = await db.execute(
    `
      SELECT COLUMN_NAME, DATA_TYPE
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [table]
  );

  return new Map(rows.map(row => [row.COLUMN_NAME, row.DATA_TYPE]));
}

async function upsertTable(table, rows) {
  const tableSchema = await schema(table);

  if (!tableSchema.size) {
    throw new Error(`Tabela ausente: ${table}`);
  }

  let processed = 0;

  for (const source of rows) {
    const usable = Object.keys(source).filter(column => tableSchema.has(column));

    if (!usable.length) continue;

    const values = usable.map(column =>
      normalizeValue(source[column], tableSchema.get(column))
    );

    const quoted = usable.map(column => `\`${column}\``);

    const updates = usable
      .filter(column => column !== "id")
      .map(column => `\`${column}\`=VALUES(\`${column}\`)`);

    await db.execute(
      `
        INSERT INTO \`${table}\`
        (${quoted.join(",")})
        VALUES (${usable.map(() => "?").join(",")})
        ON DUPLICATE KEY UPDATE
        ${updates.join(",")}
      `,
      values
    );

    processed++;
  }

  return processed;
}

const parsed = new Map();

for (const item of TABLES) {
  parsed.set(
    item.table,
    parseRows(`${work}/${item.file}`, item.columns)
  );
}

console.log(`LEADS_COMERCIAIS_RECUPERADOS=${parsed.get("leads").length}`);
console.log(`ATIVIDADES_RECUPERADAS=${parsed.get("lead_activities").length}`);
console.log(`AGENDAMENTOS_RECUPERADOS=${parsed.get("lead_schedules").length}`);
console.log(`SESSOES_RECUPERADAS=${parsed.get("lead_service_sessions").length}`);
console.log(`LEADS_MARKETING_RECUPERADOS=${parsed.get("marketing_leads").length}`);
console.log(`CONTATOS_MARKETING_RECUPERADOS=${parsed.get("marketing_lead_contacts").length}`);

await db.query("SET FOREIGN_KEY_CHECKS=0");
await db.beginTransaction();

try {
  for (const item of TABLES) {
    const total = await upsertTable(item.table, parsed.get(item.table));
    console.log(`${item.table.toUpperCase()}_IMPORTADOS=${total}`);
  }

  await db.commit();
} catch (error) {
  await db.rollback();
  console.error("IMPORT_ROLLBACK=SIM");
  throw error;
} finally {
  await db.query("SET FOREIGN_KEY_CHECKS=1");
}

for (const table of [
  "leads",
  "lead_activities",
  "lead_reminders",
  "lead_schedules",
  "lead_service_sessions",
  "marketing_leads",
  "marketing_lead_contacts",
]) {
  const [[row]] = await db.execute(
    `SELECT COUNT(*) AS total FROM \`${table}\``
  );

  console.log(`${table.toUpperCase()}_FINAL=${row.total}`);
}

const [scopeRows] = await db.execute(
  `
    SELECT COALESCE(scope,'SEM_SCOPE') AS scope, COUNT(*) AS total
    FROM leads
    GROUP BY scope
    ORDER BY scope
  `
);

console.log("LEADS_POR_MODULO=" + JSON.stringify(scopeRows));

await db.end();
