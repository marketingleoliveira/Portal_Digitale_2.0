import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import { db } from "../src/database.js";
import { config } from "../src/config.js";
import { columnMeta, encodeValue } from "../src/lib/rows.js";

const LEGACY_USER_ID =
  "6986d30e-40c0-4771-bf4a-46e2faa7c7de";

const [[currentUser]] = await db.query(
  `SELECT id,email
   FROM system_users
   WHERE email='marketing@digitaletextil.com.br'
   LIMIT 1`
);

if (!currentUser?.id) {
  throw new Error("Current marketing user not found");
}

const CURRENT_USER_ID = currentUser.id;
function parseEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || !line.includes("=")) continue;
    const i = line.indexOf("=");
    out[line.slice(0, i)] =
      line.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return out;
}

const env = parseEnv(
  "/var/backups/portal-digitale/20260923-175548/env-repositorio-original"
);
const base = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const refresh = fs
  .readFileSync("/tmp/portal-cloud-refresh.secret", "utf8")
  .trim();

const tokenResponse = await fetch(
  base + "/auth/v1/token?grant_type=refresh_token",
  {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: "Bearer " + anon,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ refresh_token: refresh })
  }
);

const tokenData = await tokenResponse.json();

if (!tokenResponse.ok || !tokenData.access_token) {
  throw new Error("Could not refresh legacy cloud session");
}

const access = tokenData.access_token;
async function getRows(table) {
  const response = await fetch(
    base + "/rest/v1/" + table + "?select=*&limit=10000",
    {
      headers: {
        apikey: anon,
        Authorization: "Bearer " + access,
        Accept: "application/json"
      }
    }
  );

  const data = await response.json();

  if (!response.ok || !Array.isArray(data)) {
    throw new Error(
      "Failed to fetch " + table + ": " +
      JSON.stringify(data).slice(0, 300)
    );
  }

  return data;
}

function mapUserId(value) {
  return String(value || "") === LEGACY_USER_ID
    ? CURRENT_USER_ID
    : value;
}

function encodePath(name) {
  return String(name)
    .split("/")
    .map(encodeURIComponent)
    .join("/");
}

function localPublicUrl(bucket, objectPath) {
  return (
    "/api/storage/public?bucket=" +
    encodeURIComponent(bucket) +
    "&path=" +
    encodeURIComponent(objectPath)
  );
}
function storagePathFromUrl(url, bucket) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const markerPublic =
      "/storage/v1/object/public/" + bucket + "/";
    const markerSigned =
      "/storage/v1/object/sign/" + bucket + "/";
    const markerAuth =
      "/storage/v1/object/authenticated/" + bucket + "/";

    for (const marker of [markerPublic, markerSigned, markerAuth]) {
      const index = parsed.pathname.indexOf(marker);
      if (index >= 0) {
        return decodeURIComponent(
          parsed.pathname.slice(index + marker.length)
        );
      }
    }
  } catch {}

  return null;
}

function localizePublicUrl(url, bucket) {
  if (!url) return url;
  const objectPath = storagePathFromUrl(url, bucket);
  return objectPath
    ? localPublicUrl(bucket, objectPath)
    : url;
}

function signedReceiptUrl(objectPath, userId) {
  const token = jwt.sign(
    {
      scope: "storage-read",
      user_id: mapUserId(userId),
      bucket: "reembolsos",
      path: objectPath
    },
    config.jwtSecret,
    { expiresIn: "365d" }
  );

  return (
    "/api/storage/public?bucket=reembolsos&path=" +
    encodeURIComponent(objectPath) +
    "&token=" +
    encodeURIComponent(token)
  );
}

function localFileExists(bucket, objectPath) {
  if (!objectPath) return false;
  return fs.existsSync(
    path.join(config.uploadDir, bucket, objectPath)
  );
}
function mapCommonIds(row) {
  const out = { ...row };
  for (const key of [
    "id",
    "created_by",
    "uploaded_by",
    "user_id",
    "updated_by"
  ]) {
    if (out[key]) {
      out[key] = mapUserId(out[key]);
    }
  }
  return out;
}

async function upsertRows(conn, table, rows) {
  const meta = await columnMeta(table);
  let written = 0;

  for (const source of rows) {
    const row = mapCommonIds(source);
    const columns = Object.keys(row).filter(
      (key) => meta.has(key) && row[key] !== undefined
    );

    if (!columns.length) continue;

    const values = [];
    for (const column of columns) {
      let value = row[column];
      const info = meta.get(column);

      if (
        info?.pg_data_type === "date" &&
        value !== null &&
        value !== undefined
      ) {
        const text = String(value);
        const match =
          /^\d{4}-\d{2}-\d{2}$/.test(text);
        const parsed = match
          ? new Date(text + "T00:00:00Z")
          : null;
        const valid =
          parsed &&
          !Number.isNaN(parsed.getTime()) &&
          parsed.toISOString().slice(0, 10) === text;

        if (!valid) {
          invalidDates.push({
            table,
            id: row.id || null,
            column,
            value: text
          });
          value = null;
        }
      }

      values.push(
        await encodeValue(
          table,
          column,
          value
        )
      );
    }

    const updates = columns
      .filter((column) => column !== "id")
      .map((column) => `\`${column}\`=VALUES(\`${column}\`)`)
      .join(",");

    const sql =
      `INSERT INTO \`${table}\` (` +
      columns.map((c) => `\`${c}\``).join(",") +
      `) VALUES (` +
      columns.map(() => "?").join(",") +
      `) ON DUPLICATE KEY UPDATE ` +
      (updates || "id=id");

    await conn.execute(sql, values);
    written++;
  }

  return written;
}
const [
  profiles,
  categories,
  subcategories,
  files,
  fileVisibility,
  fileRegionVisibility,
  priceFiles,
  meetingRecordings,
  testimonialSchedules,
  travelExpenses,
  expenseReports,
  expenseItems
] = await Promise.all([
  getRows("profiles"),
  getRows("categories"),
  getRows("subcategories"),
  getRows("files"),
  getRows("file_visibility"),
  getRows("file_region_visibility"),
  getRows("price_files"),
  getRows("meeting_recordings"),
  getRows("testimonial_schedules"),
  getRows("travel_expenses"),
  getRows("expense_reports"),
  getRows("expense_items")
]);

const stats = {};
const missingPhysical = [];
const invalidDates = [];
for (const row of profiles) {
  row.id = mapUserId(row.id);
  if (row.avatar_url) {
    row.avatar_url =
      localizePublicUrl(
        row.avatar_url,
        "avatars"
      );
  }
  if (row.id === CURRENT_USER_ID) {
    row.is_active = true;
    row.email = currentUser.email;
  }
}

for (const row of files) {
  if (!row.is_external_link && row.file_url) {
    const objectPath =
      storagePathFromUrl(
        row.file_url,
        "files"
      );

    if (objectPath) {
      if (
        localFileExists(
          "files",
          objectPath
        )
      ) {
        row.file_url =
          localPublicUrl(
            "files",
            objectPath
          );
      } else {
        missingPhysical.push({
          table: "files",
          id: row.id,
          path: objectPath
        });
      }
    }
  }
  row.created_by =
    mapUserId(row.created_by);
}
for (const row of priceFiles) {
  if (row.file_url) {
    const objectPath =
      storagePathFromUrl(
        row.file_url,
        "price-files"
      );

    if (objectPath) {
      if (
        localFileExists(
          "price-files",
          objectPath
        )
      ) {
        row.file_url =
          localPublicUrl(
            "price-files",
            objectPath
          );
      } else {
        missingPhysical.push({
          table: "price_files",
          id: row.id,
          path: objectPath
        });
      }
    }
  }
  row.created_by =
    mapUserId(row.created_by);
}

for (const row of meetingRecordings) {
  if (row.download_url) {
    row.download_url =
      localizePublicUrl(
        row.download_url,
        "meeting-recordings"
      );
  }
}

for (const row of testimonialSchedules) {
  if (row.orientation_file_url) {
    row.orientation_file_url =
      localizePublicUrl(
        row.orientation_file_url,
        "testimonial-files"
      );
  }
  row.created_by =
    mapUserId(row.created_by);
}
for (const row of travelExpenses) {
  row.user_id =
    mapUserId(row.user_id);

  if (row.receipt_path) {
    const objectPath =
      row.receipt_path;

    if (
      localFileExists(
        "reembolsos",
        objectPath
      )
    ) {
      row.receipt_url =
        signedReceiptUrl(
          objectPath,
          row.user_id
        );
    } else {
      missingPhysical.push({
        table: "travel_expenses",
        id: row.id,
        path: objectPath
      });
    }
  }
}

for (const row of expenseReports) {
  row.user_id =
    mapUserId(row.user_id);
}

const reportOwner = new Map(
  expenseReports.map(
    (row) => [
      row.id,
      row.user_id
    ]
  )
);

for (const row of expenseItems) {
  if (row.receipt_path) {
    const objectPath =
      row.receipt_path;
    const owner =
      reportOwner.get(row.report_id) ||
      CURRENT_USER_ID;

    if (
      localFileExists(
        "reembolsos",
        objectPath
      )
    ) {
      row.receipt_url =
        signedReceiptUrl(
          objectPath,
          owner
        );
    } else {
      missingPhysical.push({
        table: "expense_items",
        id: row.id,
        path: objectPath
      });
    }
  }
}
const conn = await db.getConnection();

try {
  await conn.beginTransaction();

  stats.profiles =
    await upsertRows(
      conn,
      "profiles",
      profiles
    );

  stats.categories =
    await upsertRows(
      conn,
      "categories",
      categories
    );

  stats.subcategories =
    await upsertRows(
      conn,
      "subcategories",
      subcategories
    );

  stats.files =
    await upsertRows(
      conn,
      "files",
      files
    );

  stats.file_visibility =
    await upsertRows(
      conn,
      "file_visibility",
      fileVisibility
    );

  stats.file_region_visibility =
    await upsertRows(
      conn,
      "file_region_visibility",
      fileRegionVisibility
    );
  stats.price_files =
    await upsertRows(
      conn,
      "price_files",
      priceFiles
    );

  stats.meeting_recordings =
    await upsertRows(
      conn,
      "meeting_recordings",
      meetingRecordings
    );

  stats.testimonial_schedules =
    await upsertRows(
      conn,
      "testimonial_schedules",
      testimonialSchedules
    );

  stats.travel_expenses =
    await upsertRows(
      conn,
      "travel_expenses",
      travelExpenses
    );

  stats.expense_reports =
    await upsertRows(
      conn,
      "expense_reports",
      expenseReports
    );

  stats.expense_items =
    await upsertRows(
      conn,
      "expense_items",
      expenseItems
    );

  await conn.commit();
} catch (error) {
  await conn.rollback();
  throw error;
} finally {
  conn.release();
}
const result = {
  ok: true,
  stats,
  missingPhysicalCount:
    missingPhysical.length,
  missingPhysical:
    missingPhysical.slice(0, 50),
  invalidDateCount:
    invalidDates.length,
  invalidDates:
    invalidDates.slice(0, 50)
};

console.log(
  JSON.stringify(
    result,
    null,
    2
  )
);

await db.end();
