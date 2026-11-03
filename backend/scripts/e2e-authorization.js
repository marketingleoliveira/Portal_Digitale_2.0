import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "../src/database.js";

const BASE = "http://127.0.0.1:8102";
const ids = {
  vendor1: crypto.randomUUID(),
  vendor2: crypto.randomUUID(),
  sdr: crypto.randomUUID(),
  marketing: crypto.randomUUID(),
  productVisible: crypto.randomUUID(),
  productHidden: crypto.randomUUID(),
  fileSp: crypto.randomUUID(),
  fileRj: crypto.randomUUID(),
  leadOwn: crypto.randomUUID(),
  leadOther: crypto.randomUUID(),
  timeOwn: crypto.randomUUID(),
  timeOther: crypto.randomUUID(),
  loc: crypto.randomUUID(),
  marketingLead: crypto.randomUUID(),
  creationCategory: crypto.randomUUID(),
  genericCategory: crypto.randomUUID(),
  activeMeeting: crypto.randomUUID(),
  inactiveMeeting: crypto.randomUUID(),
};

const password = crypto.randomBytes(16).toString("base64url");

function assert(ok, message, details = null) {
  if (!ok) {
    throw new Error(
      message + (details ? " " + JSON.stringify(details) : "")
    );
  }
}

async function api(path, options = {}) {
  const response = await fetch(BASE + path, options);
  let body = null;
  try { body = await response.json(); } catch {}
  return { response, body };
}

function headers(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function query(token, body) {
  return api("/api/data/query", {
    method: "POST",
    headers: token ? headers(token) : {"Content-Type":"application/json"},
    body: JSON.stringify(body),
  });
}

async function createUser(id, email, role, region = null) {
  const hash = await bcrypt.hash(password, 10);
  await db.execute(
    "INSERT INTO system_users (id,email,password_hash,created_at,updated_at) VALUES (?,?,?,NOW(6),NOW(6))",
    [id,email,hash]
  );
  await db.execute(
    `INSERT INTO profiles
     (id,full_name,email,is_active,region,created_at,updated_at)
     VALUES (?,?,?,1,?,NOW(6),NOW(6))`,
    [id,`E2E ${role}`,email,region]
  );
  await db.execute(
    "INSERT INTO user_roles (id,user_id,role) VALUES (UUID(),?,?)",
    [id,role]
  );
}

async function login(email) {
  const result = await api("/api/auth/login", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({email,password})
  });
  assert(result.response.status === 200, "login_failed", {email,status:result.response.status});
  return result.body.token;
}
try {
  const stamp = Date.now();
  const emails = {
    vendor1:`e2e-v1-${stamp}@example.invalid`,
    vendor2:`e2e-v2-${stamp}@example.invalid`,
    sdr:`e2e-sdr-${stamp}@example.invalid`,
    marketing:`e2e-mkt-${stamp}@example.invalid`,
  };

  await createUser(ids.vendor1, emails.vendor1, "vendedor", "SP");
  await createUser(ids.vendor2, emails.vendor2, "vendedor", "RJ");
  await createUser(ids.sdr, emails.sdr, "sdr");
  await createUser(ids.marketing, emails.marketing, "marketing");

  const vendorToken = await login(emails.vendor1);
  const sdrToken = await login(emails.sdr);
  const marketingToken = await login(emails.marketing);

  await db.execute(
    "INSERT INTO categories (id,name,description,created_at) VALUES (?,?,?,NOW(6))",
    [ids.genericCategory,"E2E Categoria","temporaria"]
  );

  await db.execute(
    "INSERT INTO products (id,name,category_id,created_by,created_at,updated_at) VALUES (?,?,?,?,NOW(6),NOW(6)),(?,?,?,?,NOW(6),NOW(6))",
    [
      ids.productVisible,"Produto Visível",ids.genericCategory,ids.sdr,
      ids.productHidden,"Produto Oculto",ids.genericCategory,ids.sdr
    ]
  );
  await db.execute(
    "INSERT INTO product_visibility (id,product_id,visible_to_role) VALUES (UUID(),?,'vendedor'),(UUID(),?,'criacao')",
    [ids.productVisible,ids.productHidden]
  );

  await db.execute(
    `INSERT INTO files
     (id,name,file_url,created_by,created_at,updated_at)
     VALUES (?,?,?, ?,NOW(6),NOW(6)),(?,?,?, ?,NOW(6),NOW(6))`,
    [
      ids.fileSp,"Arquivo SP","/e2e/sp",ids.sdr,
      ids.fileRj,"Arquivo RJ","/e2e/rj",ids.sdr
    ]
  );
  await db.execute(
    "INSERT INTO file_visibility (id,file_id,visible_to_role) VALUES (UUID(),?,'vendedor'),(UUID(),?,'vendedor')",
    [ids.fileSp,ids.fileRj]
  );
  await db.execute(
    "INSERT INTO file_region_visibility (id,file_id,region) VALUES (UUID(),?,'SP'),(UUID(),?,'RJ')",
    [ids.fileSp,ids.fileRj]
  );

  await db.execute(
    `INSERT INTO leads
     (id,company_name,status,assigned_to,created_by,created_at,updated_at)
     VALUES (?,?, 'novo',?,?,NOW(6),NOW(6)),(?,?, 'novo',?,?,NOW(6),NOW(6))`,
    [
      ids.leadOwn,"Lead Próprio",ids.vendor1,ids.sdr,
      ids.leadOther,"Lead Outro",ids.vendor2,ids.sdr
    ]
  );

  await db.execute(
    `INSERT INTO time_records
     (id,user_id,record_date,created_at,updated_at)
     VALUES (?,?,CURDATE(),NOW(6),NOW(6)),(?,?,CURDATE(),NOW(6),NOW(6))`,
    [ids.timeOwn,ids.vendor1,ids.timeOther,ids.vendor2]
  );

  await db.execute(
    `INSERT INTO user_location_history
     (id,user_id,recorded_at,location_source)
     VALUES (?,?,NOW(6),'e2e')`,
    [ids.loc,ids.vendor1]
  );

  await db.execute(
    `INSERT INTO marketing_leads
     (id,company_name,status,created_by,created_at,updated_at)
     VALUES (?,?,'novo',?,NOW(6),NOW(6))`,
    [ids.marketingLead,"Lead Marketing",ids.marketing]
  );

  await db.execute(
    `INSERT INTO creation_categories
     (id,name,created_by,created_at,updated_at)
     VALUES (?,?,?,NOW(6),NOW(6))`,
    [ids.creationCategory,"Criação E2E",ids.marketing]
  );

  await db.execute(
    `INSERT INTO meetings
     (id,title,meeting_code,host_user_id,is_active,created_at,updated_at)
     VALUES (?,?,?, ?,1,NOW(6),NOW(6)),(?,?,?, ?,0,NOW(6),NOW(6))`,
    [
      ids.activeMeeting,"Ativa E2E",`active-${stamp}`,ids.sdr,
      ids.inactiveMeeting,"Inativa E2E",`inactive-${stamp}`,ids.sdr
    ]
  );
  const products = await query(vendorToken,{table:"products",operation:"select"});
  assert(products.response.status===200,"vendor_products_http");
  const productIds=(products.body.data||[]).map(x=>x.id);
  assert(productIds.includes(ids.productVisible),"vendor_missing_visible_product");
  assert(!productIds.includes(ids.productHidden),"vendor_saw_hidden_product");

  const files = await query(vendorToken,{table:"files",operation:"select"});
  const fileIds=(files.body.data||[]).map(x=>x.id);
  assert(fileIds.includes(ids.fileSp),"vendor_missing_sp_file");
  assert(!fileIds.includes(ids.fileRj),"vendor_saw_rj_file");

  const leads = await query(vendorToken,{table:"leads",operation:"select"});
  const leadIds=(leads.body.data||[]).map(x=>x.id);
  assert(leadIds.includes(ids.leadOwn),"vendor_missing_own_lead");
  assert(!leadIds.includes(ids.leadOther),"vendor_saw_other_lead");

  const times = await query(vendorToken,{table:"time_records",operation:"select"});
  const timeIds=(times.body.data||[]).map(x=>x.id);
  assert(timeIds.includes(ids.timeOwn),"vendor_missing_own_time");
  assert(!timeIds.includes(ids.timeOther),"vendor_saw_other_time");

  const loc = await query(vendorToken,{table:"user_location_history",operation:"select"});
  assert(loc.response.status===200 && (loc.body.data||[]).length===0,"vendor_saw_location_history");

  const mktAsVendor = await query(vendorToken,{table:"marketing_leads",operation:"select"});
  assert((mktAsVendor.body.data||[]).length===0,"vendor_saw_marketing_leads");

  const creationAsVendor = await query(vendorToken,{table:"creation_categories",operation:"select"});
  assert((creationAsVendor.body.data||[]).length===0,"vendor_saw_creation_data");

  const creationAsMarketing = await query(marketingToken,{table:"creation_categories",operation:"select"});
  assert((creationAsMarketing.body.data||[]).some(x=>x.id===ids.creationCategory),"marketing_missing_creation_access");

  const marketingRows = await query(marketingToken,{table:"marketing_leads",operation:"select"});
  assert((marketingRows.body.data||[]).some(x=>x.id===ids.marketingLead),"marketing_missing_marketing_lead");

  const insertCategory = await query(vendorToken,{
    table:"categories",
    operation:"insert",
    payload:{name:"Não permitido"}
  });
  assert(insertCategory.response.status===403,"vendor_inserted_category",insertCategory.body);

  const otherProfileUpdate = await query(vendorToken,{
    table:"profiles",
    operation:"update",
    payload:{phone:"11999999999"},
    filters:[{type:"eq",column:"id",value:ids.vendor2}]
  });
  assert(otherProfileUpdate.response.status===200 && otherProfileUpdate.body.count===0,"vendor_updated_other_profile");

  const ownProfileUpdate = await query(vendorToken,{
    table:"profiles",
    operation:"update",
    payload:{phone:"11888888888"},
    filters:[{type:"eq",column:"id",value:ids.vendor1}]
  });
  assert(ownProfileUpdate.response.status===200 && ownProfileUpdate.body.count===1,"vendor_could_not_update_own_profile");

  const spoofNotification = await query(vendorToken,{
    table:"user_notifications",
    operation:"insert",
    payload:{
      title:"E2E",
      message:"E2E",
      target_user_id:ids.vendor2,
      created_by:ids.vendor2
    }
  });
  assert(spoofNotification.response.status===403,"vendor_spoofed_notification");

  const validNotification = await query(vendorToken,{
    table:"user_notifications",
    operation:"insert",
    payload:{
      title:"E2E valid",
      message:"E2E",
      target_user_id:ids.vendor2,
      created_by:ids.vendor1
    }
  });
  assert(validNotification.response.status===201,"vendor_valid_notification_failed",validNotification.body);
  const validNotificationId=validNotification.body.data.id;

  const sdrLeads=await query(sdrToken,{table:"leads",operation:"select"});
  assert((sdrLeads.body.data||[]).some(x=>x.id===ids.leadOther),"sdr_missing_all_leads");

  const activePublic=await query(null,{
    table:"meetings",operation:"select",
    filters:[{type:"eq",column:"id",value:ids.activeMeeting}],
    single:"maybeSingle"
  });
  assert(activePublic.body.data?.id===ids.activeMeeting,"public_active_meeting_hidden");

  const inactivePublic=await query(null,{
    table:"meetings",operation:"select",
    filters:[{type:"eq",column:"id",value:ids.inactiveMeeting}],
    single:"maybeSingle"
  });
  assert(inactivePublic.body.data===null,"public_inactive_meeting_exposed");

  const guestParticipantUpdate=await query(null,{
    table:"meeting_participants",
    operation:"update",
    payload:{is_muted:true},
    filters:[{type:"eq",column:"id",value:crypto.randomUUID()}]
  });
  assert(guestParticipantUpdate.response.status===200 && guestParticipantUpdate.body.count===0,"anonymous_participant_update_not_blocked");

  await db.execute("DELETE FROM user_notifications WHERE id=?", [validNotificationId]);

  console.log(JSON.stringify({
    ok:true,
    vendorProductVisibility:true,
    vendorFileRegion:true,
    vendorLeadScope:true,
    vendorTimeScope:true,
    locationHistoryProtected:true,
    marketingIsolation:true,
    creationIsolation:true,
    writeProtection:true,
    profileOwnership:true,
    notificationAntiSpoof:true,
    sdrLeadAccess:true,
    publicMeetingScope:true,
    anonymousUpdateBlocked:true
  }));
} finally {
  const cleanup=[
    ["user_notifications","created_by",[ids.vendor1,ids.vendor2,ids.sdr,ids.marketing]],
    ["meeting_messages","meeting_id",[ids.activeMeeting,ids.inactiveMeeting]],
    ["meeting_participants","meeting_id",[ids.activeMeeting,ids.inactiveMeeting]],
    ["meetings","id",[ids.activeMeeting,ids.inactiveMeeting]],
    ["creation_categories","id",[ids.creationCategory]],
    ["marketing_leads","id",[ids.marketingLead]],
    ["user_location_history","id",[ids.loc]],
    ["time_records","id",[ids.timeOwn,ids.timeOther]],
    ["leads","id",[ids.leadOwn,ids.leadOther]],
    ["file_region_visibility","file_id",[ids.fileSp,ids.fileRj]],
    ["file_visibility","file_id",[ids.fileSp,ids.fileRj]],
    ["files","id",[ids.fileSp,ids.fileRj]],
    ["product_visibility","product_id",[ids.productVisible,ids.productHidden]],
    ["products","id",[ids.productVisible,ids.productHidden]],
    ["categories","id",[ids.genericCategory]],
  ];

  for(const [table,column,values] of cleanup){
    if(!values.length) continue;
    const placeholders=values.map(()=>"?").join(",");
    await db.execute(
      `DELETE FROM \`${table}\` WHERE \`${column}\` IN (${placeholders})`,
      values
    ).catch(()=>{});
  }

  const userIds=[ids.vendor1,ids.vendor2,ids.sdr,ids.marketing];
  const ph=userIds.map(()=>"?").join(",");
  await db.execute(`DELETE FROM user_roles WHERE user_id IN (${ph})`,userIds).catch(()=>{});
  await db.execute(`DELETE FROM profiles WHERE id IN (${ph})`,userIds).catch(()=>{});
  await db.execute(`DELETE FROM system_users WHERE id IN (${ph})`,userIds).catch(()=>{});
  await db.end();
}
