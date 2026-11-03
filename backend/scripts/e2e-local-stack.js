import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import WebSocket from "ws";
import { db } from "../src/database.js";

const BASE = "http://127.0.0.1:8102";
const id = crypto.randomUUID();
const categoryId = crypto.randomUUID();
const productId = crypto.randomUUID();
const email = `portal-e2e-${Date.now()}@example.invalid`;
const password = crypto.randomBytes(18).toString("base64url");
const roleId = crypto.randomUUID();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(path, options = {}) {
  const response = await fetch(BASE + path, options);
  let body;
  try { body = await response.json(); } catch { body = null; }
  return { response, body };
}

let token = null;
let ws = null;

try {
  const hash = await bcrypt.hash(password, 10);
  await db.execute(
    "INSERT INTO system_users (id,email,password_hash,created_at,updated_at) VALUES (?,?,?,NOW(6),NOW(6))",
    [id,email,hash]
  );
  await db.execute(
    "INSERT INTO profiles (id,full_name,email,is_active,created_at,updated_at) VALUES (?,?,?,1,NOW(6),NOW(6))",
    [id,"Portal E2E",email]
  );
  await db.execute(
    "INSERT INTO user_roles (id,user_id,role) VALUES (?,?,?)",
    [roleId,id,"dev"]
  );

  const login = await api("/api/auth/login", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({email,password})
  });
  assert(login.response.status === 200, "login_failed");
  token = login.body?.token;
  assert(token, "token_missing");

  const unauth = await api("/api/data/query", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({table:"profiles",operation:"select",limit:1})
  });
  assert(unauth.response.status === 401, "protected_read_not_protected");

  const publicMeeting = await api("/api/data/query", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({table:"meetings",operation:"select",limit:1})
  });
  assert(publicMeeting.response.status === 200, "guest_meeting_read_failed");
  const headers = {
    "Content-Type":"application/json",
    "Authorization":`Bearer ${token}`
  };

  const profile = await api("/api/data/query", {
    method:"POST", headers,
    body:JSON.stringify({
      table:"profiles",operation:"select",
      filters:[{type:"eq",column:"id",value:id}],
      single:"single"
    })
  });
  assert(profile.response.status === 200 && profile.body?.data?.email === email, "profile_read_failed");

  const realtimePromise = new Promise((resolve,reject) => {
    const timer = setTimeout(() => reject(new Error("realtime_timeout")), 6000);
    ws = new WebSocket(
      `ws://127.0.0.1:8102/api/realtime?token=${encodeURIComponent(token)}`
    );
    ws.on("open", () => {
      ws.send(JSON.stringify({type:"subscribe",channel:"e2e"}));
    });
    ws.on("message", data => {
      const msg = JSON.parse(String(data));
      if (msg.type === "postgres_changes" && msg.table === "categories" && msg.event === "INSERT") {
        clearTimeout(timer);
        resolve(msg);
      }
    });
    ws.on("error", reject);
  });

  const insertCategory = await api("/api/data/query", {
    method:"POST", headers,
    body:JSON.stringify({
      table:"categories",operation:"insert",
      payload:{id:categoryId,name:"E2E Categoria",description:"temporario"}
    })
  });
  assert(insertCategory.response.status === 201, "category_insert_failed");
  await realtimePromise;

  const insertProduct = await api("/api/data/query", {
    method:"POST", headers,
    body:JSON.stringify({
      table:"products",operation:"insert",
      payload:{
        id:productId,
        name:"E2E Produto",
        price:12.34,
        category_id:categoryId,
        created_by:id
      }
    })
  });
  assert(insertProduct.response.status === 201, "product_insert_failed");
  const relation = await api("/api/data/query", {
    method:"POST", headers,
    body:JSON.stringify({
      table:"products",
      operation:"select",
      columns:"*, category:categories(*)",
      filters:[{type:"eq",column:"id",value:productId}],
      single:"single"
    })
  });
  assert(relation.response.status === 200, "relation_query_http_failed");
  assert(relation.body?.data?.category?.id === categoryId, "relation_hydration_failed");

  const nestedFilter = await api("/api/data/query", {
    method:"POST", headers,
    body:JSON.stringify({
      table:"products",
      operation:"select",
      columns:"*, category:categories(*)",
      filters:[{type:"eq",column:"category.name",value:"E2E Categoria"}]
    })
  });
  assert(
    nestedFilter.response.status === 200 &&
    nestedFilter.body?.data?.some?.(row => row.id === productId),
    "nested_relation_filter_failed"
  );

  const update = await api("/api/data/query", {
    method:"POST", headers,
    body:JSON.stringify({
      table:"categories",operation:"update",
      payload:{description:"atualizado"},
      filters:[{type:"eq",column:"id",value:categoryId}]
    })
  });
  assert(update.response.status === 200, "category_update_failed");

  const fileData = new FormData();
  fileData.append("file", new Blob(["portal-local-storage-ok"], {type:"text/plain"}), "probe.txt");
  const uploadResponse = await fetch(
    BASE + "/api/storage/upload/meeting-recordings?path=e2e/probe.txt&upsert=true",
    {
      method:"POST",
      headers:{Authorization:`Bearer ${token}`},
      body:fileData
    }
  );
  const upload = await uploadResponse.json();
  assert(uploadResponse.status === 201 && !upload.error, "storage_upload_failed");
  const publicFile = await fetch(
    BASE + "/api/storage/public?bucket=meeting-recordings&path=e2e%2Fprobe.txt"
  );
  assert(publicFile.status === 200, "storage_public_failed");
  assert((await publicFile.text()) === "portal-local-storage-ok", "storage_content_mismatch");

  const list = await api("/api/storage/list/meeting-recordings?prefix=e2e&limit=10", {
    headers:{Authorization:`Bearer ${token}`}
  });
  assert(
    list.response.status === 200 &&
    list.body?.data?.some?.(item => item.name === "probe.txt"),
    "storage_list_failed"
  );

  const remove = await api("/api/storage/remove/meeting-recordings", {
    method:"POST",
    headers,
    body:JSON.stringify({paths:["e2e/probe.txt"]})
  });
  assert(remove.response.status === 200, "storage_remove_failed");

  const delProduct = await api("/api/data/query", {
    method:"POST",headers,
    body:JSON.stringify({
      table:"products",operation:"delete",
      filters:[{type:"eq",column:"id",value:productId}]
    })
  });
  assert(delProduct.response.status === 200, "product_delete_failed");

  const delCategory = await api("/api/data/query", {
    method:"POST",headers,
    body:JSON.stringify({
      table:"categories",operation:"delete",
      filters:[{type:"eq",column:"id",value:categoryId}]
    })
  });
  assert(delCategory.response.status === 200, "category_delete_failed");

  console.log(JSON.stringify({
    ok:true,
    login:true,
    protectedRead:true,
    guestMeetingRead:true,
    crud:true,
    relation:true,
    nestedFilter:true,
    storage:true,
    realtime:true
  }));
} finally {
  try { ws?.close(); } catch {}
  await db.execute("DELETE FROM products WHERE id=?", [productId]).catch(()=>{});
  await db.execute("DELETE FROM categories WHERE id=?", [categoryId]).catch(()=>{});
  await db.execute("DELETE FROM user_roles WHERE user_id=?", [id]).catch(()=>{});
  await db.execute("DELETE FROM profiles WHERE id=?", [id]).catch(()=>{});
  await db.execute("DELETE FROM system_users WHERE id=?", [id]).catch(()=>{});
  await db.end();
}
