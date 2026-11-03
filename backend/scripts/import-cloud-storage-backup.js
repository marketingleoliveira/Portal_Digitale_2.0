import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const MANIFEST = "/tmp/portal-storage-manifest.tsv";
const ROOT = "/var/lib/portal-digitale/uploads";
const REPORT_DIR = fs
  .readFileSync("/tmp/portal-storage-import-dir", "utf8")
  .trim();
const ENV_FILE =
  "/var/backups/portal-digitale/20260923-175548/env-repositorio-original";

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
const env = parseEnv(ENV_FILE);
const base = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_PUBLISHABLE_KEY;
let access = fs
  .readFileSync("/tmp/portal-cloud-access.secret", "utf8")
  .trim();

if (!base || !anon || !access) {
  throw new Error("Legacy cloud credentials are unavailable");
}

const items = fs
  .readFileSync(MANIFEST, "utf8")
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    const [bucket, name, size] = line.split("\t");
    return { bucket, name, expected: Number(size) };
  });

function encodeObjectName(name) {
  return name.split("/").map(encodeURIComponent).join("/");
}
function safeTarget(bucket, name) {
  if (!/^[A-Za-z0-9_-]+$/.test(bucket)) {
    throw new Error("invalid_bucket");
  }

  const normalized = path.posix.normalize("/" + name).slice(1);
  if (
    !normalized ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new Error("invalid_path");
  }

  return path.join(ROOT, bucket, normalized);
}

function objectUrl(item) {
  const mode = item.bucket === "reembolsos"
    ? "authenticated"
    : "public";

  return (
    base +
    "/storage/v1/object/" +
    mode +
    "/" +
    encodeURIComponent(item.bucket) +
    "/" +
    encodeObjectName(item.name)
  );
}
async function downloadOnce(item, target) {
  const headers = { apikey: anon };

  if (item.bucket === "reembolsos") {
    headers.Authorization = "Bearer " + access;
  }

  const response = await fetch(objectUrl(item), {
    headers,
    signal: AbortSignal.timeout(15 * 60 * 1000),
  });

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => "");
    const error = new Error(
      "HTTP " + response.status + " " + body.slice(0, 180)
    );
    error.status = response.status;
    throw error;
  }

  await fsp.mkdir(path.dirname(target), { recursive: true });
  const part = target + ".part-" + process.pid;
  await fsp.rm(part, { force: true });
  try {
    await pipeline(
      Readable.fromWeb(response.body),
      fs.createWriteStream(part, { flags: "wx" })
    );

    const stat = await fsp.stat(part);

    if (stat.size !== item.expected) {
      throw new Error(
        "size_mismatch expected=" +
        item.expected +
        " got=" +
        stat.size
      );
    }

    await fsp.rename(part, target);
    return stat.size;
  } catch (error) {
    await fsp.rm(part, { force: true }).catch(() => {});
    throw error;
  }
}

const report = {
  startedAt: new Date().toISOString(),
  expectedObjects: items.length,
  expectedBytes: items.reduce((sum, item) => sum + item.expected, 0),
  downloaded: [],
  existing: [],
  replaced: [],
  failed: [],
};
let completed = 0;
let completedBytes = 0;

async function processItem(item) {
  const target = safeTarget(item.bucket, item.name);
  let existed = false;

  try {
    const stat = await fsp.stat(target);
    existed = true;

    if (stat.size === item.expected) {
      report.existing.push(item);
      completed++;
      completedBytes += item.expected;
      return;
    }
  } catch {}

  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const bytes = await downloadOnce(item, target);
      const entry = { ...item, bytes, attempt };

      if (existed) report.replaced.push(entry);
      else report.downloaded.push(entry);

      completed++;
      completedBytes += bytes;
      if (
        completed % 10 === 0 ||
        completed === items.length ||
        item.expected > 100 * 1024 * 1024
      ) {
        const pct = (
          (completedBytes / report.expectedBytes) * 100
        ).toFixed(1);

        console.log(
          "PROGRESS objects=" +
          completed +
          "/" +
          items.length +
          " bytes=" +
          completedBytes +
          "/" +
          report.expectedBytes +
          " pct=" +
          pct
        );
      }

      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) =>
        setTimeout(resolve, attempt * 1200)
      );
    }
  }

  report.failed.push({
    ...item,
    error: String(lastError?.message || lastError),
  });
  completed++;
  console.log(
    "FAILED " +
    item.bucket +
    "/" +
    item.name +
    " :: " +
    String(lastError?.message || lastError)
  );
}

let cursor = 0;
const concurrency = 4;

async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= items.length) return;
    await processItem(items[index]);
  }
}

console.log(
  "IMPORT_START objects=" +
  items.length +
  " bytes=" +
  report.expectedBytes +
  " concurrency=" +
  concurrency
);

await Promise.all(
  Array.from({ length: concurrency }, () => worker())
);
report.finishedAt = new Date().toISOString();
report.completedObjects =
  report.downloaded.length +
  report.existing.length +
  report.replaced.length;
report.completedBytes = completedBytes;

const reportPath = path.join(
  REPORT_DIR,
  "storage-import-report.json"
);

await fsp.writeFile(
  reportPath,
  JSON.stringify(report, null, 2)
);

console.log(
  JSON.stringify({
    ok: report.failed.length === 0,
    expectedObjects: report.expectedObjects,
    completedObjects: report.completedObjects,
    downloaded: report.downloaded.length,
    existing: report.existing.length,
    replaced: report.replaced.length,
    failed: report.failed.length,
    expectedBytes: report.expectedBytes,
    completedBytes: report.completedBytes,
    reportPath,
  })
);

if (report.failed.length) {
  process.exitCode = 2;
}
