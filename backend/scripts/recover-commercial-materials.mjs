import fs from "node:fs";
import path from "node:path";
import {
  spawnSync
} from "node:child_process";
import mysql from "mysql2/promise";

const STORAGE =
  "/var/lib/portal-digitale/uploads";

const BUCKET =
  path.join(
    STORAGE,
    "files"
  );

const ARCHIVE =
  "/var/backups/portal-digitale/" +
  "storage-import-20260925-192910/" +
  "storage-after-import.tar";

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
      "portal_digitale",

    charset:
      "utf8mb4",
  });

function walk(directory) {
  const result = [];

  if (
    !fs.existsSync(directory)
  ) {
    return result;
  }

  for (
    const entry of
    fs.readdirSync(
      directory,
      {
        withFileTypes: true
      }
    )
  ) {
    const full =
      path.join(
        directory,
        entry.name
      );

    if (
      entry.isDirectory()
    ) {
      result.push(
        ...walk(full)
      );
    } else {
      result.push(full);
    }
  }

  return result;
}

function getStoragePath(
  fileUrl
) {
  if (!fileUrl) {
    return null;
  }

  const value =
    String(fileUrl);

  if (
    value.startsWith(
      "/api/storage/public"
    )
  ) {
    try {
      const url =
        new URL(
          value,
          "http://portal.local"
        );

      return (
        url.searchParams.get(
          "path"
        ) || null
      );
    } catch {
      return null;
    }
  }

  const marker =
    "/storage/v1/object/public/files/";

  const position =
    value.indexOf(marker);

  if (
    position !== -1
  ) {
    let objectPath =
      value.slice(
        position +
        marker.length
      );

    objectPath =
      objectPath.split("?")[0];

    try {
      objectPath =
        decodeURIComponent(
          objectPath
        );
    } catch {}

    return objectPath;
  }

  return null;
}

function localUrl(
  objectPath
) {
  return (
    "/api/storage/public" +
    "?bucket=files" +
    "&path=" +
    encodeURIComponent(
      objectPath
    )
  );
}

fs.mkdirSync(
  BUCKET,
  {
    recursive: true
  }
);

const allStorageFiles =
  walk(STORAGE);

const byName =
  new Map();

for (
  const file of
  allStorageFiles
) {
  const name =
    path.basename(file);

  if (
    !byName.has(name)
  ) {
    byName.set(
      name,
      file
    );
  }
}

const [files] =
  await db.execute(`
    SELECT
      id,
      name,
      file_url,
      is_external_link
    FROM files
    ORDER BY created_at
  `);

let archiveEntries = null;

function loadArchiveEntries() {
  if (
    archiveEntries !== null
  ) {
    return archiveEntries;
  }

  archiveEntries = [];

  if (
    !fs.existsSync(
      ARCHIVE
    )
  ) {
    return archiveEntries;
  }

  const result =
    spawnSync(
      "tar",
      [
        "-tf",
        ARCHIVE
      ],
      {
        encoding:
          "utf8",
        maxBuffer:
          30 * 1024 * 1024
      }
    );

  if (
    result.status !== 0
  ) {
    return [];
  }

  archiveEntries =
    result.stdout
      .split(/\r?\n/)
      .filter(Boolean);

  return archiveEntries;
}

function restoreFromArchive(
  objectPath,
  destination
) {
  if (
    !fs.existsSync(
      ARCHIVE
    )
  ) {
    return false;
  }

  const entries =
    loadArchiveEntries();

  const basename =
    path.basename(
      objectPath
    );

  let entry =
    entries.find(
      value =>
        value.endsWith(
          "/files/" +
          objectPath
        )
    );

  if (!entry) {
    entry =
      entries.find(
        value =>
          value.endsWith(
            "/files/" +
            basename
          )
      );
  }

  if (!entry) {
    entry =
      entries.find(
        value =>
          path.basename(
            value
          ) === basename
      );
  }

  if (!entry) {
    return false;
  }

  fs.mkdirSync(
    path.dirname(
      destination
    ),
    {
      recursive: true
    }
  );

  const fd =
    fs.openSync(
      destination,
      "w"
    );

  const result =
    spawnSync(
      "tar",
      [
        "-xOf",
        ARCHIVE,
        entry
      ],
      {
        stdio: [
          "ignore",
          fd,
          "pipe"
        ]
      }
    );

  fs.closeSync(fd);

  if (
    result.status !== 0
  ) {
    try {
      fs.unlinkSync(
        destination
      );
    } catch {}

    return false;
  }

  return (
    fs.existsSync(
      destination
    ) &&
    fs.statSync(
      destination
    ).size > 0
  );
}

let external = 0;
let physical = 0;
let alreadyOk = 0;
let copied = 0;
let restored = 0;
let missing = 0;
let urlsUpdated = 0;

const missingList = [];

for (
  const file of
  files
) {
  if (
    Number(
      file.is_external_link
    ) === 1
  ) {
    external++;
    continue;
  }

  physical++;

  const objectPath =
    getStoragePath(
      file.file_url
    );

  if (!objectPath) {
    missing++;

    missingList.push({
      id: file.id,
      name: file.name,
      reason:
        "CAMINHO_INVALIDO"
    });

    continue;
  }

  const destination =
    path.join(
      BUCKET,
      objectPath
    );

  if (
    fs.existsSync(
      destination
    ) &&
    fs.statSync(
      destination
    ).size > 0
  ) {
    alreadyOk++;
  } else {

    const basename =
      path.basename(
        objectPath
      );

    const source =
      byName.get(
        basename
      );

    if (
      source &&
      source !== destination &&
      fs.existsSync(source)
    ) {
      fs.mkdirSync(
        path.dirname(
          destination
        ),
        {
          recursive: true
        }
      );

      fs.copyFileSync(
        source,
        destination
      );

      copied++;
    } else {

      const ok =
        restoreFromArchive(
          objectPath,
          destination
        );

      if (ok) {
        restored++;
      } else {
        missing++;

        missingList.push({
          id: file.id,
          name: file.name,
          path:
            objectPath,
          reason:
            "ARQUIVO_NAO_LOCALIZADO"
        });

        continue;
      }
    }
  }

  const newUrl =
    localUrl(
      objectPath
    );

  if (
    file.file_url !==
    newUrl
  ) {
    await db.execute(
      `
        UPDATE files
        SET
          file_url = ?,
          updated_at =
            NOW(6)
        WHERE id = ?
      `,
      [
        newUrl,
        file.id
      ]
    );

    urlsUpdated++;
  }
}

if (
  missingList.length
) {
  const report =
    "/var/backups/" +
    "portal-digitale/" +
    "material-commercial-" +
    "missing.json";

  fs.writeFileSync(
    report,
    JSON.stringify(
      missingList,
      null,
      2
    )
  );

  console.log(
    `RELATORIO_AUSENTES=${report}`
  );
}

const [[counts]] =
  await db.execute(`
    SELECT
      COUNT(*) AS files,
      SUM(
        CASE
          WHEN is_external_link = 1
          THEN 1 ELSE 0
        END
      ) AS links_externos
    FROM files
  `);

const [[visibility]] =
  await db.execute(`
    SELECT
      COUNT(*) AS total
    FROM file_visibility
  `);

const [[categories]] =
  await db.execute(`
    SELECT
      COUNT(*) AS total
    FROM categories
  `);

const [[subcategories]] =
  await db.execute(`
    SELECT
      COUNT(*) AS total
    FROM subcategories
  `);

console.log(
  `MATERIAIS_TOTAL=${counts.files}`
);

console.log(
  `LINKS_EXTERNOS=${counts.links_externos}`
);

console.log(
  `ARQUIVOS_FISICOS=${physical}`
);

console.log(
  `ARQUIVOS_JA_OK=${alreadyOk}`
);

console.log(
  `ARQUIVOS_COPIADOS=${copied}`
);

console.log(
  `ARQUIVOS_RESTAURADOS=${restored}`
);

console.log(
  `URLS_LOCALIZADAS=${urlsUpdated}`
);

console.log(
  `ARQUIVOS_AUSENTES=${missing}`
);

console.log(
  `REGRAS_VISIBILIDADE=${visibility.total}`
);

console.log(
  `CATEGORIAS=${categories.total}`
);

console.log(
  `SUBCATEGORIAS=${subcategories.total}`
);

await db.end();

if (missing > 0) {
  process.exitCode = 2;
}
