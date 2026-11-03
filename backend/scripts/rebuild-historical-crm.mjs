import crypto from "node:crypto";
import mysql from "mysql2/promise";

/*
 * Registros históricos encontrados no backup original.
 *
 * Estes 56 registros estavam hoje em:
 *   scope = atendimento
 *
 * Eles representam as cópias de trabalho atribuídas
 * aos vendedores. Vamos recriar os registros-fonte
 * do CRM sem modificar os registros existentes.
 */

const HISTORICAL_IDS = [
  "4619e2a2-a0b8-4b58-ba3d-41e1b85e0ab3",
  "e85ca7fe-4c32-4a6d-bdbf-9b9ebb7fdd72",
  "924f3224-7ecc-4d3a-96fd-789a286c08e8",
  "12da7dbf-9341-492f-acf7-d69bd4782345",
  "dab965dc-0ee3-4df5-ba1a-cad5ee9071c8",
  "4dbe589b-424f-4da4-a4ba-0228f5c20031",
  "11125270-234a-47d4-aeb4-57965ce020fb",
  "850f6275-34b0-441f-b199-cc534229d035",
  "85638d59-c589-478b-ac91-43e1ed77688d",
  "086360da-e19b-49c1-8751-d069dfd05a4b",
  "1751c530-78b7-49e4-9035-1f3ab83a733b",
  "55ca44dc-df40-4157-be63-ca17a0224f84",
  "87a215ac-57ad-4b68-8579-3ec39f33cc06",
  "a7b06e41-69f2-4f03-ba2d-04e451b48008",
  "05fc07b9-4645-4fc7-ae9c-c329930a28d6",
  "81fc4d63-95ef-44c1-92e1-086334b72499",
  "2be543c1-d12a-442f-a848-011401c3d841",
  "bb6bf443-62b2-41cc-a542-8867082c2a95",
  "503d00df-332c-4e83-aafc-dba4cc1d6ce1",
  "a0a2fe7d-9aa0-475f-9893-1f26241700c9",
  "f9f048c9-8744-433f-991a-2d2936a6f59e",
  "380ba5a1-a31b-4fa3-839d-24ffbb4b2b4f",
  "7e854db1-42be-4623-83f0-cf0a12a6fe22",
  "a5bce51a-b473-4f43-93de-3ca2d12247d3",
  "5b24c8ac-7c50-48f6-9b89-3bb67c6f6e05",
  "a8741b92-359b-402a-a140-fe735f95477a",
  "d2b7cffe-3a57-4a3b-83ac-e4341a61994b",
  "58b81df4-d9c2-49d0-a6fb-db0625594e6b",
  "09f3151e-bc2c-4213-8468-52f06119eb83",
  "bfe61244-0064-4228-8d8c-d7924de265ce",
  "c4b23786-2e1a-4a1d-8142-2539bd282bbb",
  "27c8e779-48de-4808-9589-197b48540499",
  "926bc0b8-0b7a-4968-97b7-497729648d75",
  "8c6d39dc-038f-4b75-926d-90d7dcbb9797",
  "1ca321f8-ff03-4a5e-b335-885734ac5d0e",
  "9688c9e3-c9ce-4bb4-846d-5958582996ea",
  "62330fa9-9a0a-4e7e-9d7a-36e023192a9f",
  "38669a70-3725-43c7-8c30-9ff064a76744",
  "a701f5c5-b8be-4504-b40f-4529511d1f64",
  "f3c02add-62de-4f43-8220-2087b4a02a28",
  "effa475a-2e3f-425e-95fa-c6cc2b4a41cd",
  "8db52b74-9865-4d8c-99cf-da55720fb797",
  "fb888f6c-e5c2-4537-88d6-3d0c6f9bf07d",
  "ea00a771-373d-40bf-89d5-446039a6baa0",
  "08a03049-6b4c-4b7d-ae33-4dea13664ef2",
  "291d1c6d-d907-4a5e-a855-3ee743bf3e52",
  "c6ec68c4-a04d-4823-b627-93e87fa1602d",
  "8ba8574c-7f1f-4dde-9c45-65f844250481",
  "3878ca60-1f57-4180-acab-2de72425697a",
  "e37c8fa2-bc7d-4e44-b9c4-b2c5eb90f667",
  "26259190-7dec-440a-b097-5ca7d5682f6d",
  "d873e587-81bd-427c-a154-7dae46f04a76",
  "88e03dde-cdcb-4ff3-a7fd-07ed3321c66a",
  "c1f7290d-f4f8-461f-8528-342cdc4cc72f",
  "b07a1782-3634-41df-968e-b41710f6f10e",
  "f4f38104-229f-4981-b415-dfd2de26e342"
];

/*
 * Este registro já estava corretamente classificado
 * como CRM no backup recuperado.
 */
const EXISTING_CRM_ID =
  "390b8da0-6f09-4557-9409-683bc8a120fe";

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


/* ======================================================
   COLUNAS REAIS DA TABELA
   ====================================================== */

const [schemaRows] =
  await db.execute(`
    SELECT
      COLUMN_NAME,
      EXTRA
    FROM information_schema.COLUMNS
    WHERE
      TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'leads'
    ORDER BY ORDINAL_POSITION
  `);

const insertColumns =
  schemaRows
    .filter(
      column =>
        !/(VIRTUAL|STORED) GENERATED/i.test(
          String(column.EXTRA || "")
        )
    )
    .map(
      column =>
        column.COLUMN_NAME
    );


/* ======================================================
   RECONSTRUÇÃO
   ====================================================== */

let found = 0;
let created = 0;
let alreadyLinked = 0;
let linkedExisting = 0;
let wrongScope = 0;

const missing = [];

await db.beginTransaction();

try {

  for (
    const leadId of
    HISTORICAL_IDS
  ) {

    const [rows] =
      await db.execute(
        `
          SELECT *
          FROM leads
          WHERE id = ?
          LIMIT 1
        `,
        [leadId]
      );

    if (!rows.length) {
      missing.push(leadId);
      continue;
    }

    const original =
      rows[0];

    found++;

    if (
      String(
        original.scope ||
        ""
      ) !== "atendimento"
    ) {
      wrongScope++;
      continue;
    }


    /* Já reconstruído anteriormente */
    if (
      original.source_lead_id
    ) {

      const [sources] =
        await db.execute(
          `
            SELECT id
            FROM leads
            WHERE
              id = ?
              AND scope = 'crm'
            LIMIT 1
          `,
          [
            original.source_lead_id
          ]
        );

      if (sources.length) {
        alreadyLinked++;
        continue;
      }
    }


    /*
     * Evita duplicidade caso um CRM equivalente
     * já tenha sido recriado antes sem o vínculo.
     */
    const [existing] =
      await db.execute(
        `
          SELECT id
          FROM leads
          WHERE
            scope = 'crm'
            AND company_name <=> ?
            AND contact_name <=> ?
            AND contact_email <=> ?
            AND contact_phone <=> ?
            AND assigned_to <=> ?
            AND created_at <=> ?
          LIMIT 1
        `,
        [
          original.company_name,
          original.contact_name,
          original.contact_email,
          original.contact_phone,
          original.assigned_to,
          original.created_at
        ]
      );

    let sourceId;

    if (existing.length) {

      sourceId =
        existing[0].id;

      linkedExisting++;

    } else {

      sourceId =
        crypto.randomUUID();

      const clone = {
        ...original,

        id:
          sourceId,

        scope:
          "crm",

        source_lead_id:
          null
      };

      const columns =
        insertColumns.filter(
          column =>
            Object.prototype
              .hasOwnProperty
              .call(
                clone,
                column
              )
        );

      const values =
        columns.map(
          column =>
            clone[column]
        );

      const sql =
        `
          INSERT INTO leads
          (
            ${columns
              .map(
                column =>
                  `\`${column}\``
              )
              .join(",")}
          )
          VALUES
          (
            ${columns
              .map(() => "?")
              .join(",")}
          )
        `;

      await db.execute(
        sql,
        values
      );

      created++;
    }


    /*
     * O registro existente continua sendo
     * o Atendimento EAD e recebe apenas
     * o vínculo com o CRM fonte.
     */
    await db.execute(
      `
        UPDATE leads
        SET source_lead_id = ?
        WHERE
          id = ?
          AND (
            source_lead_id IS NULL
            OR source_lead_id = ''
          )
      `,
      [
        sourceId,
        leadId
      ]
    );
  }

  await db.commit();

} catch (error) {

  await db.rollback();

  console.error(
    "ROLLBACK=SIM"
  );

  throw error;
}


console.log(
  `HISTORICOS_ENCONTRADOS=${found}`
);

console.log(
  `CRM_CRIADOS=${created}`
);

console.log(
  `CRM_JA_VINCULADOS=${alreadyLinked}`
);

console.log(
  `CRM_EXISTENTES_RECONECTADOS=${linkedExisting}`
);

console.log(
  `ESCOPO_DIVERGENTE=${wrongScope}`
);

console.log(
  `HISTORICOS_AUSENTES=${missing.length}`
);

if (missing.length) {
  console.log(
    "IDS_AUSENTES=" +
    missing.join(",")
  );
}


/* ======================================================
   RESULTADO HISTÓRICO
   ====================================================== */

const placeholders =
  HISTORICAL_IDS
    .map(() => "?")
    .join(",");

const [historicalDistribution] =
  await db.execute(
    `
      SELECT
        COALESCE(
          p.full_name,
          'Sem responsável'
        ) AS vendedor,

        COALESCE(
          p.email,
          l.assigned_to,
          'sem-email'
        ) AS email,

        COUNT(*) AS quantidade

      FROM leads l

      LEFT JOIN profiles p
        ON p.id = l.assigned_to

      WHERE
        l.scope = 'crm'

        AND
        (
          l.id = ?

          OR l.id IN
          (
            SELECT
              source_lead_id

            FROM leads

            WHERE
              id IN (${placeholders})
              AND source_lead_id
                  IS NOT NULL
          )
        )

      GROUP BY
        p.id,
        p.full_name,
        p.email,
        l.assigned_to

      ORDER BY
        quantidade DESC
    `,
    [
      EXISTING_CRM_ID,
      ...HISTORICAL_IDS
    ]
  );


console.log(
  "CARTEIRA_CRM_HISTORICA="
  + JSON.stringify(
      historicalDistribution
    )
);


const [[historicalTotal]] =
  await db.execute(
    `
      SELECT
        COUNT(DISTINCT crm_id)
          AS total

      FROM
      (
        SELECT
          source_lead_id
            AS crm_id

        FROM leads

        WHERE
          id IN (${placeholders})
          AND source_lead_id
              IS NOT NULL

        UNION ALL

        SELECT
          id AS crm_id

        FROM leads

        WHERE
          id = ?
          AND scope = 'crm'
      ) x
    `,
    [
      ...HISTORICAL_IDS,
      EXISTING_CRM_ID
    ]
  );


const [[crmTotal]] =
  await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM leads
      WHERE scope = 'crm'
    `
  );


const [[atendimentoTotal]] =
  await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM leads
      WHERE scope = 'atendimento'
    `
  );


console.log(
  `CRM_HISTORICO_RECONSTRUIDO=${historicalTotal.total}`
);

console.log(
  `CRM_TOTAL_ATUAL=${crmTotal.total}`
);

console.log(
  `ATENDIMENTO_TOTAL_ATUAL=${atendimentoTotal.total}`
);


/* ======================================================
   VÍNCULOS
   ====================================================== */

const [[linked]] =
  await db.execute(
    `
      SELECT COUNT(*) AS total
      FROM leads
      WHERE
        id IN (${placeholders})
        AND source_lead_id
            IS NOT NULL
    `,
    HISTORICAL_IDS
  );

console.log(
  `ATENDIMENTOS_VINCULADOS_AO_CRM=${linked.total}`
);


await db.end();
