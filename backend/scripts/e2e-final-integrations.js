import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "../src/database.js";

const BASE = "http://127.0.0.1:8102";
const userId = crypto.randomUUID();
const email = "final-e2e-" + Date.now() + "@example.invalid";
const password = crypto.randomBytes(16).toString("base64url");
const sacId = "e2e-sac-" + Date.now();
const meetingId = crypto.randomUUID();
const meetingCode = "e2e-" + Date.now();

function assert(ok, message, details = null) {
  if (!ok) {
    throw new Error(
      message +
      (details ? " " + JSON.stringify(details) : "")
    );
  }
}

async function api(path, options = {}) {
  const response = await fetch(BASE + path, options);
  let body = null;
  try {
    body = await response.json();
  } catch {}
  return { response, body };
}

let token = null;

try {
  const hash = await bcrypt.hash(password, 10);

  await db.execute(
    "INSERT INTO system_users (id,email,password_hash,created_at,updated_at) VALUES (?,?,?,NOW(6),NOW(6))",
    [userId,email,hash]
  );

  await db.execute(
    "INSERT INTO profiles (id,full_name,email,is_active,created_at,updated_at) VALUES (?,?,?,1,NOW(6),NOW(6))",
    [userId,"Final E2E",email]
  );

  await db.execute(
    "INSERT INTO user_roles (id,user_id,role) VALUES (UUID(),?,'dev')",
    [userId]
  );

  const login = await api("/api/auth/login", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({email,password})
  });

  assert(login.response.status === 200, "login_failed");
  token = login.body?.token;
  assert(token, "token_missing");

  const headers = {
    "Content-Type":"application/json",
    Authorization:"Bearer " + token
  };
  const unauthGeo = await api(
    "/api/functions/reverse-geocode",
    {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        lat:-23.5505,
        lng:-46.6333
      })
    }
  );
  assert(
    unauthGeo.response.status === 401,
    "reverse_geocode_not_protected"
  );

  const geo = await api(
    "/api/functions/reverse-geocode",
    {
      method:"POST",
      headers,
      body:JSON.stringify({
        lat:-23.5505,
        lng:-46.6333
      })
    }
  );

  assert(
    geo.response.status === 200 &&
    geo.body?.data?.city,
    "reverse_geocode_failed",
    geo.body
  );

  await db.execute(
    `INSERT INTO sac_records
     (id,protocol,client_name,client_email,complaint_type,status,message,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,NOW(6),NOW(6))`,
    [
      sacId,
      "E2E-001",
      "Cliente Teste",
      "cliente@example.invalid",
      "Teste",
      "aberto",
      "Mensagem de teste"
    ]
  );

  await db.execute(
    `INSERT INTO sac_comments
     (id,sac_id,author,message,created_at)
     VALUES (UUID(),?,?,?,NOW(6))`,
    [sacId,"Equipe","Comentário"]
  );

  await db.execute(
    `INSERT INTO sac_attachments
     (id,sac_id,name,url,created_at)
     VALUES (UUID(),?,?,?,NOW(6))`,
    [sacId,"anexo.txt","/anexo.txt"]
  );

  await db.execute(
    `INSERT INTO sac_reports
     (id,sac_id,name,url,created_at)
     VALUES (UUID(),?,?,?,NOW(6))`,
    [sacId,"laudo.pdf","/laudo.pdf"]
  );

  const sacList = await api(
    "/api/functions/sac-proxy",
    {
      method:"POST",
      headers,
      body:"{}"
    }
  );

  assert(
    sacList.response.status === 200 &&
    sacList.body?.data?.sacs?.some(
      item => item.id === sacId
    ),
    "sac_list_failed",
    sacList.body
  );

  const sacDetail = await api(
    "/api/functions/sac-proxy",
    {
      method:"POST",
      headers,
      body:JSON.stringify({id:sacId})
    }
  );

  assert(
    sacDetail.response.status === 200 &&
    sacDetail.body?.data?.sac?.tickets?.length === 1 &&
    sacDetail.body?.data?.sac?.attachments?.length === 1 &&
    sacDetail.body?.data?.sac?.laudos?.length === 1,
    "sac_detail_failed",
    sacDetail.body
  );
  const ownPath = userId + "/probe.txt";
  const form = new FormData();
  form.append(
    "file",
    new Blob(
      ["private-storage-ok"],
      {type:"text/plain"}
    ),
    "probe.txt"
  );

  const upload = await fetch(
    BASE +
      "/api/storage/upload/reembolsos?path=" +
      encodeURIComponent(ownPath),
    {
      method:"POST",
      headers:{
        Authorization:"Bearer " + token
      },
      body:form
    }
  );

  assert(
    upload.status === 201,
    "private_upload_failed",
    await upload.text()
  );

  const publicWithoutToken = await fetch(
    BASE +
      "/api/storage/public?bucket=reembolsos&path=" +
      encodeURIComponent(ownPath)
  );

  assert(
    publicWithoutToken.status === 403,
    "private_file_exposed_without_token"
  );

  const signed = await api(
    "/api/storage/signed/reembolsos",
    {
      method:"POST",
      headers,
      body:JSON.stringify({
        path:ownPath,
        expiresIn:300
      })
    }
  );

  assert(
    signed.response.status === 200 &&
    signed.body?.data?.signedUrl,
    "signed_url_failed",
    signed.body
  );

  const privateFile = await fetch(
    BASE + signed.body.data.signedUrl
  );

  assert(
    privateFile.status === 200 &&
    (await privateFile.text()) ===
      "private-storage-ok",
    "signed_private_file_failed"
  );

  const badForm = new FormData();
  badForm.append(
    "file",
    new Blob(["bad"]),
    "bad.txt"
  );

  const badUpload = await fetch(
    BASE +
      "/api/storage/upload/reembolsos?path=" +
      encodeURIComponent(
        crypto.randomUUID() + "/bad.txt"
      ),
    {
      method:"POST",
      headers:{
        Authorization:"Bearer " + token
      },
      body:badForm
    }
  );

  assert(
    badUpload.status === 403,
    "cross_user_receipt_upload_allowed"
  );
  await db.execute(
    `INSERT INTO meetings
     (id,title,meeting_code,host_user_id,is_active,created_at,updated_at)
     VALUES (?,?,?,?,1,NOW(6),NOW(6))`,
    [
      meetingId,
      "Daily E2E",
      meetingCode,
      userId
    ]
  );

  const daily = await api(
    "/api/functions/daily-room",
    {
      method:"POST",
      headers,
      body:JSON.stringify({
        action:"get",
        meetingCode
      })
    }
  );

  assert(
    daily.response.status === 503 &&
    daily.body?.error?.code ===
      "daily_not_configured",
    "daily_missing_key_not_graceful",
    daily.body
  );

  const remove = await api(
    "/api/storage/remove/reembolsos",
    {
      method:"POST",
      headers,
      body:JSON.stringify({
        paths:[ownPath]
      })
    }
  );

  assert(
    remove.response.status === 200,
    "private_remove_failed"
  );

  console.log(JSON.stringify({
    ok:true,
    reverseGeocode:true,
    sacLocal:true,
    privateStorage:true,
    signedUrl:true,
    crossUserStorageBlocked:true,
    dailyGraceful503:true
  }));
} finally {
  await db.execute(
    "DELETE FROM meeting_messages WHERE meeting_id=?",
    [meetingId]
  ).catch(()=>{});
  await db.execute(
    "DELETE FROM meeting_participants WHERE meeting_id=?",
    [meetingId]
  ).catch(()=>{});
  await db.execute(
    "DELETE FROM meetings WHERE id=?",
    [meetingId]
  ).catch(()=>{});

  await db.execute(
    "DELETE FROM sac_comments WHERE sac_id=?",
    [sacId]
  ).catch(()=>{});
  await db.execute(
    "DELETE FROM sac_attachments WHERE sac_id=?",
    [sacId]
  ).catch(()=>{});
  await db.execute(
    "DELETE FROM sac_reports WHERE sac_id=?",
    [sacId]
  ).catch(()=>{});
  await db.execute(
    "DELETE FROM sac_records WHERE id=?",
    [sacId]
  ).catch(()=>{});

  await db.execute(
    "DELETE FROM user_roles WHERE user_id=?",
    [userId]
  ).catch(()=>{});
  await db.execute(
    "DELETE FROM profiles WHERE id=?",
    [userId]
  ).catch(()=>{});
  await db.execute(
    "DELETE FROM system_users WHERE id=?",
    [userId]
  ).catch(()=>{});

  await db.end();
}
