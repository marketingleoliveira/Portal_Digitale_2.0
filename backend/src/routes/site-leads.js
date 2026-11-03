import express from "express";
import crypto from "node:crypto";

import { db } from "../database.js";
import { config } from "../config.js";

const router =
  express.Router();

const SOURCE_SYSTEM =
  "site-digitale";

const DEAL_SOURCE =
  "SITE";


function clean(
  value,
  max = 500
) {

  if (
    value === undefined
    ||
    value === null
  ) {
    return null;
  }

  return (
    String(value)
      .trim()
      .slice(0, max)
    || null
  );
}


function onlyDigits(
  value
) {

  return String(
    value || ""
  ).replace(
    /\D+/g,
    ""
  );
}


function safeSecretEqual(
  received,
  expected
) {

  const a =
    Buffer.from(
      String(
        received || ""
      )
    );

  const b =
    Buffer.from(
      String(
        expected || ""
      )
    );

  if (
    !a.length
    ||
    !b.length
    ||
    a.length !== b.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    a,
    b
  );
}


router.use(
  (req, res, next) => {

    if (
      !config.siteLeadSecret
    ) {
      return res.status(503).json({
        ok: false,
        error:
          "site_lead_integration_not_configured"
      });
    }

    const received =
      req.get(
        "x-site-lead-secret"
      );

    if (
      !safeSecretEqual(
        received,
        config.siteLeadSecret
      )
    ) {
      return res.status(403).json({
        ok: false,
        error:
          "invalid_integration_secret"
      });
    }

    next();
  }
);


async function resolveContext(
  connection
) {

  let [pipelines] =
    await connection.execute(`
      SELECT
        id,
        name
      FROM crm_pipelines
      WHERE is_default = 1
      ORDER BY
        sort_order ASC
      LIMIT 1
    `);

  if (!pipelines.length) {

    [pipelines] =
      await connection.execute(`
        SELECT
          id,
          name
        FROM crm_pipelines
        ORDER BY
          sort_order ASC
        LIMIT 1
      `);
  }

  const pipeline =
    pipelines[0];

  if (!pipeline) {
    throw new Error(
      "crm_pipeline_not_found"
    );
  }


  const [stages] =
    await connection.execute(
      `
        SELECT
          id,
          name
        FROM crm_stages
        WHERE
          pipeline_id = ?
          AND (
            name = 'Prospecção'
            OR LOWER(name)
              LIKE '%prospec%'
          )
        ORDER BY
          sort_order ASC
        LIMIT 1
      `,
      [
        pipeline.id
      ]
    );

  const stage =
    stages[0];

  if (!stage) {
    throw new Error(
      "crm_prospecting_stage_not_found"
    );
  }


  if (
    !config.siteLeadOwnerId
  ) {
    throw new Error(
      "site_lead_owner_not_configured"
    );
  }


  const [owners] =
    await connection.execute(
      `
        SELECT
          id,
          full_name
        FROM profiles
        WHERE id = ?
        LIMIT 1
      `,
      [
        config.siteLeadOwnerId
      ]
    );

  const owner =
    owners[0];

  if (!owner) {
    throw new Error(
      "site_lead_owner_not_found"
    );
  }


  return {
    pipeline,
    stage,
    owner
  };
}


router.get(
  "/health",
  async (_req, res) => {

    let connection;

    try {

      connection =
        await db.getConnection();

      const context =
        await resolveContext(
          connection
        );

      return res.json({
        ok: true,
        source:
          DEAL_SOURCE,
        sourceSystem:
          SOURCE_SYSTEM,
        pipeline:
          context.pipeline.name,
        stage:
          context.stage.name,
        owner:
          context.owner.full_name
      });

    } catch (error) {

      console.error(
        "SITE LEAD HEALTH:",
        error?.message || error
      );

      return res
        .status(500)
        .json({
          ok: false,
          error:
            error?.message
            ||
            "integration_unavailable"
        });

    } finally {

      connection?.release();
    }
  }
);


router.post(
  "/",
  async (req, res) => {

    const visitorKey =
      clean(
        req.body?.visitor_key,
        80
      );

    if (
      !visitorKey
      ||
      !/^[A-Za-z0-9_-]{10,80}$/
        .test(
          visitorKey
        )
    ) {
      return res
        .status(400)
        .json({
          ok: false,
          error:
            "invalid_visitor_key"
        });
    }


    const name =
      clean(
        req.body?.name,
        180
      );

    const email =
      clean(
        req.body?.email,
        254
      )?.toLowerCase()
      || null;

    const phone =
      clean(
        req.body?.phone,
        60
      );

    const company =
      clean(
        req.body?.company,
        180
      );

    const cnpj =
      clean(
        req.body?.cnpj,
        30
      );

    const originalSource =
      clean(
        req.body?.source,
        120
      );

    const medium =
      clean(
        req.body?.medium,
        120
      );

    const campaign =
      clean(
        req.body?.campaign,
        180
      );

    const path =
      clean(
        req.body?.path,
        500
      );

    const identifiedAt =
      clean(
        req.body?.identified_at,
        80
      );

    const scoreNumber =
      Number(
        req.body?.score || 0
      );

    const score =
      Number.isFinite(
        scoreNumber
      )
        ? Math.round(
            scoreNumber
          )
        : 0;


    const cnpjDigits =
      onlyDigits(
        cnpj
      );

    const phoneDigits =
      onlyDigits(
        phone
      );


    if (
      !email
      &&
      !phoneDigits
      &&
      !cnpjDigits
    ) {
      return res
        .status(400)
        .json({
          ok: false,
          error:
            "identified_lead_required"
        });
    }


    const dedupeKey =
      crypto
        .createHash(
          "sha256"
        )
        .update(
          SOURCE_SYSTEM
          + ":"
          + visitorKey
        )
        .digest(
          "hex"
        );


    const identityKey =
      cnpjDigits
      ||
      email
      ||
      phoneDigits
      ||
      visitorKey;


    const identityLock =
      "sitelead:"
      +
      crypto
        .createHash(
          "sha256"
        )
        .update(
          identityKey
        )
        .digest(
          "hex"
        )
        .slice(
          0,
          48
        );


    const rawPayload = {
      visitor_key:
        visitorKey,
      name,
      email,
      phone,
      company,
      cnpj,
      source:
        originalSource,
      medium,
      campaign,
      path,
      identified_at:
        identifiedAt,
      score
    };


    let connection;
    let lockAcquired =
      false;

    try {

      connection =
        await db.getConnection();


      const [[lock]] =
        await connection.query(
          "SELECT GET_LOCK(?, 10) AS acquired",
          [
            'digitale:crm-import'
          ]
        );

      if (
        Number(
          lock?.acquired
        ) !== 1
      ) {
        throw new Error(
          "site_lead_lock_timeout"
        );
      }

      lockAcquired =
        true;


      await connection
        .beginTransaction();


      const context =
        await resolveContext(
          connection
        );


      const [importRows] =
        await connection.execute(
          `
            SELECT *
            FROM crm_external_lead_imports
            WHERE
              dedupe_key = ?
              OR (
                source_system = ?
                AND external_lead_id = ?
              )
            LIMIT 1
            FOR UPDATE
          `,
          [
            dedupeKey,
            SOURCE_SYSTEM,
            visitorKey
          ]
        );

      const existingImport =
        importRows[0]
        || null;


      let organizationId =
        existingImport
          ?.organization_id
        || null;


      if (organizationId) {

        const [rows] =
          await connection.execute(
            `
              SELECT id
              FROM crm_organizations
              WHERE id = ?
              LIMIT 1
            `,
            [
              organizationId
            ]
          );

        if (!rows.length) {
          organizationId =
            null;
        }
      }


      if (
        !organizationId
        &&
        cnpjDigits
      ) {

        const [rows] =
          await connection.execute(
            `
              SELECT id
              FROM crm_organizations
              WHERE
                REGEXP_REPLACE(
                  COALESCE(cnpj, ''),
                  '[^0-9]',
                  ''
                ) = ?
              LIMIT 1
            `,
            [
              cnpjDigits
            ]
          );

        organizationId =
          rows[0]?.id
          || null;
      }


      if (
        !organizationId
        &&
        company
      ) {

        const [rows] =
          await connection.execute(
            `
              SELECT id
              FROM crm_organizations
              WHERE
                LOWER(
                  TRIM(name)
                )
                =
                LOWER(
                  TRIM(?)
                )
              LIMIT 1
            `,
            [
              company
            ]
          );

        organizationId =
          rows[0]?.id
          || null;
      }


      if (!organizationId) {

        organizationId =
          crypto.randomUUID();

        await connection.execute(
          `
            INSERT INTO
              crm_organizations
            (
              id,
              name,
              cnpj,
              email,
              phone,
              notes,
              owner_user_id,
              created_by
            )
            VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?
            )
          `,
          [
            organizationId,
            company
              || name
              || "Lead do Site",
            cnpj,
            email,
            phone,
            "Origem automática: SITE",
            context.owner.id,
            context.owner.id
          ]
        );

      } else {

        await connection.execute(
          `
            UPDATE crm_organizations
            SET
              name =
                CASE
                  WHEN (
                    name IS NULL
                    OR TRIM(name) = ''
                  )
                  THEN COALESCE(?, name)
                  ELSE name
                END,

              cnpj =
                CASE
                  WHEN (
                    cnpj IS NULL
                    OR TRIM(cnpj) = ''
                  )
                  THEN COALESCE(?, cnpj)
                  ELSE cnpj
                END,

              email =
                CASE
                  WHEN (
                    email IS NULL
                    OR TRIM(email) = ''
                  )
                  THEN COALESCE(?, email)
                  ELSE email
                END,

              phone =
                CASE
                  WHEN (
                    phone IS NULL
                    OR TRIM(phone) = ''
                  )
                  THEN COALESCE(?, phone)
                  ELSE phone
                END,

              owner_user_id =
                COALESCE(
                  owner_user_id,
                  ?
                ),

              updated_at =
                CURRENT_TIMESTAMP(6)

            WHERE id = ?
          `,
          [
            company,
            cnpj,
            email,
            phone,
            context.owner.id,
            organizationId
          ]
        );
      }


      let personId =
        existingImport
          ?.person_id
        || null;


      if (personId) {

        const [rows] =
          await connection.execute(
            `
              SELECT id
              FROM crm_people
              WHERE id = ?
              LIMIT 1
            `,
            [
              personId
            ]
          );

        if (!rows.length) {
          personId =
            null;
        }
      }


      if (
        !personId
        &&
        email
      ) {

        const [rows] =
          await connection.execute(
            `
              SELECT id
              FROM crm_people
              WHERE
                LOWER(
                  TRIM(
                    COALESCE(
                      email,
                      ''
                    )
                  )
                ) = ?
              LIMIT 1
            `,
            [
              email
            ]
          );

        personId =
          rows[0]?.id
          || null;
      }


      if (
        !personId
        &&
        phoneDigits
      ) {

        const [rows] =
          await connection.execute(
            `
              SELECT id
              FROM crm_people
              WHERE
                REGEXP_REPLACE(
                  COALESCE(
                    NULLIF(
                      whatsapp,
                      ''
                    ),
                    phone,
                    ''
                  ),
                  '[^0-9]',
                  ''
                ) = ?
              LIMIT 1
            `,
            [
              phoneDigits
            ]
          );

        personId =
          rows[0]?.id
          || null;
      }


      if (!personId) {

        personId =
          crypto.randomUUID();

        await connection.execute(
          `
            INSERT INTO
              crm_people
            (
              id,
              organization_id,
              name,
              email,
              phone,
              whatsapp,
              is_primary,
              notes,
              owner_user_id,
              created_by
            )
            VALUES (
              ?, ?, ?, ?, ?, ?, 1, ?, ?, ?
            )
          `,
          [
            personId,
            organizationId,
            name
              || email
              || phone
              || "Contato do Site",
            email,
            phone,
            phone,
            "Origem automática: SITE",
            context.owner.id,
            context.owner.id
          ]
        );

      } else {

        await connection.execute(
          `
            UPDATE crm_people
            SET
              organization_id =
                COALESCE(
                  organization_id,
                  ?
                ),

              name =
                CASE
                  WHEN (
                    name IS NULL
                    OR TRIM(name) = ''
                  )
                  THEN COALESCE(?, name)
                  ELSE name
                END,

              email =
                CASE
                  WHEN (
                    email IS NULL
                    OR TRIM(email) = ''
                  )
                  THEN COALESCE(?, email)
                  ELSE email
                END,

              phone =
                CASE
                  WHEN (
                    phone IS NULL
                    OR TRIM(phone) = ''
                  )
                  THEN COALESCE(?, phone)
                  ELSE phone
                END,

              whatsapp =
                CASE
                  WHEN (
                    whatsapp IS NULL
                    OR TRIM(whatsapp) = ''
                  )
                  THEN COALESCE(?, whatsapp)
                  ELSE whatsapp
                END,

              owner_user_id =
                COALESCE(
                  owner_user_id,
                  ?
                ),

              updated_at =
                CURRENT_TIMESTAMP(6)

            WHERE id = ?
          `,
          [
            organizationId,
            name,
            email,
            phone,
            phone,
            context.owner.id,
            personId
          ]
        );
      }


      let dealId =
        existingImport
          ?.deal_id
        || null;

      let createdDeal =
        false;


      if (dealId) {

        const [rows] =
          await connection.execute(
            `
              SELECT id
              FROM crm_deals
              WHERE id = ?
              LIMIT 1
            `,
            [
              dealId
            ]
          );

        if (!rows.length) {
          dealId =
            null;
        }
      }


      /*
       * Proteção adicional:
       * se outro visitor_key representar
       * o mesmo contato/empresa e já houver
       * negócio SITE aberto, reutiliza o card.
       */
      if (!dealId) {

        if (personId) {

          const [rows] =
            await connection.execute(
              `
                SELECT id
                FROM crm_deals
                WHERE
                  source IN ('SITE', 'IA')
                  AND status = 'aberto'
                  AND person_id = ?
                ORDER BY
                  created_at DESC
                LIMIT 1
                FOR UPDATE
              `,
              [
                personId
              ]
            );

          dealId =
            rows[0]?.id
            || null;
        }


        if (
          !dealId
          &&
          organizationId
        ) {

          const [rows] =
            await connection.execute(
              `
                SELECT id
                FROM crm_deals
                WHERE
                  source IN ('SITE', 'IA')
                  AND status = 'aberto'
                  AND organization_id = ?
                ORDER BY
                  created_at DESC
                LIMIT 1
                FOR UPDATE
              `,
              [
                organizationId
              ]
            );

          dealId =
            rows[0]?.id
            || null;
        }
      }


      const traffic =
        [
          originalSource,
          medium,
          campaign
        ]
          .filter(Boolean)
          .join(" / ");


      const description =
        [
          "Lead identificado automaticamente no site institucional Digitale Têxtil.",
          traffic
            ? `Tráfego: ${traffic}`
            : null,
          path
            ? `Página: ${path}`
            : null,
          identifiedAt
            ? `Identificado em: ${identifiedAt}`
            : null
        ]
          .filter(Boolean)
          .join("\n");


      if (!dealId) {

        dealId =
          crypto.randomUUID();

        const titleBase =
          company
          || name
          || email
          || phone
          || "Lead";


        await connection.execute(
          `
            INSERT INTO crm_deals
            (
              id,
              title,
              description,
              value,
              status,
              pipeline_id,
              stage_id,
              organization_id,
              person_id,
              source,
              owner_user_id,
              created_by,
              last_activity_at
            )
            VALUES (
              ?, ?, ?, 0, 'aberto',
              ?, ?, ?, ?, 'SITE',
              ?, ?, CURRENT_TIMESTAMP(6)
            )
          `,
          [
            dealId,
            titleBase,
            description,
            context.pipeline.id,
            context.stage.id,
            organizationId,
            personId,
            context.owner.id,
            context.owner.id
          ]
        );

        createdDeal =
          true;

      } else {

        /*
         * Não volta o negócio para Prospecção
         * caso a equipe já o tenha movido para
         * uma etapa posterior.
         */
        await connection.execute(
          `
            UPDATE crm_deals
            SET
              source = CASE WHEN UPPER(COALESCE(source, '')) = 'IA' THEN 'IA' ELSE 'SITE' END,

              organization_id =
                COALESCE(
                  organization_id,
                  ?
                ),

              person_id =
                COALESCE(
                  person_id,
                  ?
                ),

              owner_user_id =
                COALESCE(
                  owner_user_id,
                  ?
                ),

              description =
                CASE
                  WHEN (
                    description IS NULL
                    OR TRIM(description) = ''
                  )
                  THEN ?
                  ELSE description
                END,

              updated_at =
                CURRENT_TIMESTAMP(6)

            WHERE id = ?
          `,
          [
            organizationId,
            personId,
            context.owner.id,
            description,
            dealId
          ]
        );
      }


      const payloadJson =
        JSON.stringify(
          rawPayload
        );


      if (existingImport) {

        await connection.execute(
          `
            UPDATE crm_external_lead_imports
            SET
              dedupe_key = ?,
              qualification_status =
                'identified',
              qualification_score = ?,
              organization_id = ?,
              person_id = ?,
              deal_id = ?,
              owner_user_id = ?,
              payload = ?,
              updated_at =
                CURRENT_TIMESTAMP(6)
            WHERE id = ?
          `,
          [
            dedupeKey,
            score,
            organizationId,
            personId,
            dealId,
            context.owner.id,
            payloadJson,
            existingImport.id
          ]
        );

      } else {

        await connection.execute(
          `
            INSERT INTO
              crm_external_lead_imports
            (
              id,
              source_system,
              external_lead_id,
              dedupe_key,
              qualification_status,
              qualification_score,
              organization_id,
              person_id,
              deal_id,
              owner_user_id,
              payload
            )
            VALUES (
              ?, ?, ?, ?,
              'identified',
              ?, ?, ?, ?, ?, ?
            )
          `,
          [
            crypto.randomUUID(),
            SOURCE_SYSTEM,
            visitorKey,
            dedupeKey,
            score,
            organizationId,
            personId,
            dealId,
            context.owner.id,
            payloadJson
          ]
        );
      }


      await connection
        .commit();


      return res
        .status(
          createdDeal
            ? 201
            : 200
        )
        .json({
          ok: true,
          created:
            createdDeal,
          deal_id:
            dealId,
          pipeline:
            context.pipeline.name,
          stage:
            context.stage.name,
          source:
            DEAL_SOURCE
        });

    } catch (error) {

      try {
        await connection
          ?.rollback();
      } catch {}


      console.error(
        "SITE LEAD INGEST:",
        error?.message || error
      );


      return res
        .status(500)
        .json({
          ok: false,
          error:
            error?.message
            ||
            "site_lead_ingest_failed"
        });

    } finally {

      if (
        connection
        &&
        lockAcquired
      ) {
        try {
          await connection.query(
            "SELECT RELEASE_LOCK(?)",
            [
              'digitale:crm-import'
            ]
          );
        } catch {}
      }

      connection?.release();
    }
  }
);


export default router;
