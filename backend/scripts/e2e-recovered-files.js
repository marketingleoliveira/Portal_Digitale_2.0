import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "../src/database.js";

const BASE = "http://127.0.0.1:8102";
const id = crypto.randomUUID();
const email = "recovered-e2e-" + Date.now() + "@example.invalid";
const password = crypto.randomBytes(16).toString("base64url");

function assert(ok, message, details = null) {
  if (!ok) {
    throw new Error(
      message +
      (details ? " " + JSON.stringify(details) : "")
    );
  }
}

try {
  const hash = await bcrypt.hash(password, 10);

  await db.execute(
    "INSERT INTO system_users (id,email,password_hash,created_at,updated_at) VALUES (?,?,?,NOW(6),NOW(6))",
    [id,email,hash]
  );

  await db.execute(
    "INSERT INTO profiles (id,full_name,email,is_active,created_at,updated_at) VALUES (?,?,?,1,NOW(6),NOW(6))",
    [id,"Recovered E2E",email]
  );

  await db.execute(
    "INSERT INTO user_roles (id,user_id,role) VALUES (UUID(),?,'dev')",
    [id]
  );
  const loginResponse = await fetch(
    BASE + "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    }
  );

  const login = await loginResponse.json();

  assert(
    loginResponse.status === 200 &&
    login.token,
    "login_failed",
    login
  );

  const catalogResponse = await fetch(
    BASE + "/api/storage/catalog",
    {
      headers: {
        Authorization: "Bearer " + login.token
      }
    }
  );

  const catalog = await catalogResponse.json();

  assert(
    catalogResponse.status === 200,
    "catalog_http_failed",
    catalog
  );

  assert(
    catalog.total === 343,
    "catalog_count_mismatch",
    { total: catalog.total }
  );

  const publicFile = catalog.data.find(
    (item) => item.bucket === "avatars"
  );
  const privateFile = catalog.data.find(
    (item) => item.bucket === "reembolsos"
  );

  assert(publicFile?.url, "public_file_missing");
  assert(privateFile?.url, "private_file_missing");
  const publicResponse = await fetch(
    BASE + publicFile.url
  );

  assert(
    publicResponse.status === 200,
    "public_file_open_failed"
  );

  const privateResponse = await fetch(
    BASE + privateFile.url
  );

  assert(
    privateResponse.status === 200,
    "private_file_open_failed"
  );

  console.log(
    JSON.stringify({
      ok: true,
      total: catalog.total,
      buckets:
        Object.keys(catalog.summary || {}).length,
      publicFile: true,
      privateFile: true
    })
  );
} finally {
  await db.execute(
    "DELETE FROM user_roles WHERE user_id=?",
    [id]
  ).catch(() => {});

  await db.execute(
    "DELETE FROM profiles WHERE id=?",
    [id]
  ).catch(() => {});

  await db.execute(
    "DELETE FROM system_users WHERE id=?",
    [id]
  ).catch(() => {});

  await db.end();
}
