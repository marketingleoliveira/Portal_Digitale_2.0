import fs from "fs";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const work = process.argv[2];
const backup = process.argv[3];

function loadEnv(path) {
  const env = {};

  for (
    const raw of
    fs.readFileSync(path, "utf8")
      .split(/\r?\n/)
  ) {
    const line = raw.trim();

    if (
      !line ||
      line.startsWith("#") ||
      !line.includes("=")
    ) continue;

    const pos = line.indexOf("=");

    let value =
      line.slice(pos + 1).trim();

    if (
      (value.startsWith('"') &&
       value.endsWith('"')) ||
      (value.startsWith("'") &&
       value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[
      line.slice(0, pos).trim()
    ] = value;
  }

  return env;
}

const env = loadEnv(
  "/etc/portal-digitale/backend.env"
);

const conn =
  await mysql.createConnection({
    host: env.DB_HOST || "127.0.0.1",
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database:
      env.DB_NAME || "portal_digitale",
    charset: "utf8mb4",
  });

const legacyRoles =
  JSON.parse(
    fs.readFileSync(
      `${work}/user-roles.json`,
      "utf8"
    )
  );

const rolesByUser = new Map();

for (const row of legacyRoles) {
  const userId =
    String(row.user_id || "").trim();

  const role =
    String(row.role || "").trim();

  if (!userId || !role) continue;

  if (!rolesByUser.has(userId)) {
    rolesByUser.set(userId, []);
  }

  if (
    !rolesByUser
      .get(userId)
      .includes(role)
  ) {
    rolesByUser
      .get(userId)
      .push(role);
  }
}

const [profiles] =
  await conn.execute(`
    SELECT
      id,
      full_name,
      email,
      is_active,
      created_at
    FROM profiles
    WHERE email IS NOT NULL
      AND TRIM(email) <> ''
    ORDER BY email
  `);

const [existingUsers] =
  await conn.execute(`
    SELECT
      id,
      LOWER(email) AS email
    FROM system_users
  `);

const existingIds =
  new Set(
    existingUsers.map(
      x => String(x.id)
    )
  );

const existingEmails =
  new Set(
    existingUsers.map(
      x => String(x.email)
        .toLowerCase()
    )
  );

const credentials = [];

let created = 0;
let alreadyExists = 0;
let disabledCreated = 0;
let rolesImported = 0;
let accountsWithoutRole = 0;

await conn.beginTransaction();

try {
  for (const profile of profiles) {
    const id =
      String(profile.id);

    const email =
      String(profile.email)
        .trim()
        .toLowerCase();

    if (
      existingIds.has(id) ||
      existingEmails.has(email)
    ) {
      alreadyExists++;
      continue;
    }

    const password =
      "Tmp!" +
      crypto
        .randomBytes(15)
        .toString("hex");

    const passwordHash =
      await bcrypt.hash(
        password,
        10
      );

    const disabled =
      Number(profile.is_active) === 1
        ? 0
        : 1;

    await conn.execute(
      `
        INSERT INTO system_users
        (
          id,
          email,
          password_hash,
          created_at,
          updated_at,
          disabled,
          token_version
        )
        VALUES (?, ?, ?, ?, NOW(6), ?, 0)
      `,
      [
        id,
        email,
        passwordHash,
        profile.created_at ||
          new Date(),
        disabled
      ]
    );

    created++;

    if (disabled) {
      disabledCreated++;
    }

    const roles =
      rolesByUser.get(id) || [];

    if (roles.length === 0) {
      accountsWithoutRole++;
    }

    for (const role of roles) {
      await conn.execute(
        `
          INSERT IGNORE INTO user_roles
          (
            id,
            user_id,
            role
          )
          VALUES (?, ?, ?)
        `,
        [
          crypto.randomUUID(),
          id,
          role
        ]
      );

      rolesImported++;
    }

    credentials.push({
      id,
      name:
        profile.full_name || "",
      email,
      password,
      active:
        disabled ? "NAO" : "SIM",
      roles:
        roles.join("|")
    });

    existingIds.add(id);
    existingEmails.add(email);
  }

  await conn.commit();
} catch (error) {
  await conn.rollback();

  console.error(
    "IMPORT_ROLLBACK=SIM"
  );

  console.error(error);

  process.exit(1);
}

function csv(value) {
  const s = String(
    value ?? ""
  );

  return (
    '"' +
    s.replaceAll('"', '""') +
    '"'
  );
}

const credentialsPath =
  `${backup}/credenciais-temporarias.csv`;

const lines = [
  [
    "id",
    "nome",
    "email",
    "senha_temporaria",
    "ativo",
    "roles"
  ].map(csv).join(",")
];

for (const row of credentials) {
  lines.push(
    [
      row.id,
      row.name,
      row.email,
      row.password,
      row.active,
      row.roles
    ].map(csv).join(",")
  );
}

fs.writeFileSync(
  credentialsPath,
  lines.join("\n") + "\n",
  {
    mode: 0o600
  }
);

const [[u]] =
  await conn.execute(`
    SELECT COUNT(*) AS total
    FROM system_users
  `);

const [[r]] =
  await conn.execute(`
    SELECT COUNT(*) AS total
    FROM user_roles
  `);

const [[p]] =
  await conn.execute(`
    SELECT COUNT(*) AS total
    FROM profiles
  `);

console.log(
  `ACCOUNTS_CREATED=${created}`
);

console.log(
  `ALREADY_EXISTED=${alreadyExists}`
);

console.log(
  `DISABLED_CREATED=${disabledCreated}`
);

console.log(
  `ROLES_IMPORTED=${rolesImported}`
);

console.log(
  `ACCOUNTS_WITHOUT_ROLE=${accountsWithoutRole}`
);

console.log(
  `PROFILES_FINAL=${p.total}`
);

console.log(
  `SYSTEM_USERS_FINAL=${u.total}`
);

console.log(
  `USER_ROLES_FINAL=${r.total}`
);

console.log(
  `CREDENTIALS_FILE=${credentialsPath}`
);

await conn.end();
