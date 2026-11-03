import express from "express";
import crypto from "crypto";

import {
  db
} from "../database.js";

import {
  requireAuth
} from "../lib/auth.js";

const router =
  express.Router();


function clientIp(req) {

  const forwarded =
    String(
      req.headers[
        "x-forwarded-for"
      ] || ""
    )
      .split(",")[0]
      .trim();

  return (
    forwarded
    ||
    req.socket
      ?.remoteAddress
    ||
    null
  );
}


function distanceMeters(
  lat1,
  lon1,
  lat2,
  lon2
) {

  const R = 6371000;

  const rad =
    value =>
      value *
      Math.PI /
      180;

  const dLat =
    rad(
      lat2 - lat1
    );

  const dLon =
    rad(
      lon2 - lon1
    );

  const a =
    Math.sin(
      dLat / 2
    ) ** 2
    +
    Math.cos(
      rad(lat1)
    )
    *
    Math.cos(
      rad(lat2)
    )
    *
    Math.sin(
      dLon / 2
    ) ** 2;

  return (
    R
    *
    2
    *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )
  );
}


async function rolesForUser(
  userId
) {

  const [rows] =
    await db.execute(
      `
        SELECT role
        FROM user_roles
        WHERE user_id = ?
      `,
      [
        userId
      ]
    );

  return rows.map(
    row =>
      String(
        row.role || ""
      )
  );
}


async function canViewAll(
  userId
) {

  const roles =
    await rolesForUser(
      userId
    );

  return roles.some(
    role =>
      [
        "dev",
        "admin",
        "diretoria",
        "gerente"
      ].includes(role)
  );
}


/* ===================================================
   RECEBER LOCALIZACAO DO USUARIO
   =================================================== */

router.post(
  "/update",

  requireAuth,

  async (
    req,
    res
  ) => {

    try {

      const userId =
        String(
          req.user.id
        );

      const latitude =
        Number(
          req.body?.latitude
        );

      const longitude =
        Number(
          req.body?.longitude
        );

      const accuracy =
        req.body?.accuracy == null
          ? null
          : Number(
              req.body.accuracy
            );

      if (
        !Number.isFinite(
          latitude
        )
        ||
        !Number.isFinite(
          longitude
        )
        ||
        latitude < -90
        ||
        latitude > 90
        ||
        longitude < -180
        ||
        longitude > 180
      ) {

        return res
          .status(400)
          .json({
            error: {
              message:
                "Coordenadas inválidas"
            }
          });
      }


      const ip =
        clientIp(req);


      /*
       * Localização atual.
       */
      await db.execute(
        `
          INSERT INTO user_locations
          (
            id,
            user_id,
            ip_address,
            latitude,
            longitude,
            location_source,
            last_updated,
            created_at
          )
          VALUES
          (
            ?,
            ?,
            ?,
            ?,
            ?,
            'gps',
            NOW(6),
            NOW(6)
          )

          ON DUPLICATE KEY UPDATE

            ip_address =
              VALUES(ip_address),

            latitude =
              VALUES(latitude),

            longitude =
              VALUES(longitude),

            location_source =
              'gps',

            last_updated =
              NOW(6)
        `,
        [
          crypto.randomUUID(),
          userId,
          ip,
          latitude,
          longitude
        ]
      );


      /*
       * A localização passa a ser requisito
       * operacional do Portal.
       */
      await db.execute(
        `
          UPDATE profiles
          SET
            location_sharing_enabled = 1,
            updated_at = NOW(6)
          WHERE id = ?
        `,
        [
          userId
        ]
      );


      /*
       * Histórico:
       * grava se houve deslocamento relevante
       * ou se já passaram 5 minutos.
       */
      const [last] =
        await db.execute(
          `
            SELECT
              latitude,
              longitude,
              recorded_at

            FROM user_location_history

            WHERE user_id = ?

            ORDER BY
              recorded_at DESC

            LIMIT 1
          `,
          [
            userId
          ]
        );


      let saveHistory =
        last.length === 0;


      if (
        last.length > 0
      ) {

        const previous =
          last[0];

        const moved =
          distanceMeters(
            Number(
              previous.latitude
            ),
            Number(
              previous.longitude
            ),
            latitude,
            longitude
          );

        const elapsed =
          Date.now()
          -
          new Date(
            previous.recorded_at
          ).getTime();

        if (
          moved >= 25
          ||
          elapsed >=
            5 * 60 * 1000
        ) {
          saveHistory = true;
        }
      }


      if (saveHistory) {

        await db.execute(
          `
            INSERT INTO user_location_history
            (
              id,
              user_id,
              ip_address,
              latitude,
              longitude,
              location_source,
              recorded_at
            )
            VALUES
            (
              ?,
              ?,
              ?,
              ?,
              ?,
              'gps',
              NOW(6)
            )
          `,
          [
            crypto.randomUUID(),
            userId,
            ip,
            latitude,
            longitude
          ]
        );
      }


      return res.json({
        ok:
          true,

        latitude,

        longitude,

        accuracy,

        history_saved:
          saveHistory,

        updated_at:
          new Date()
            .toISOString()
      });

    } catch (error) {

      console.error(
        "LOCATION UPDATE:",
        error
      );

      return res
        .status(500)
        .json({
          error: {
            message:
              "Erro ao registrar localização"
          }
        });
    }
  }
);


/* ===================================================
   STATUS DO PROPRIO USUARIO
   =================================================== */

router.get(
  "/status",

  requireAuth,

  async (
    req,
    res
  ) => {

    try {

      const [rows] =
        await db.execute(
          `
            SELECT
              latitude,
              longitude,
              location_source,
              last_updated

            FROM user_locations

            WHERE user_id = ?

            LIMIT 1
          `,
          [
            String(
              req.user.id
            )
          ]
        );

      return res.json({
        required:
          true,

        location:
          rows[0] || null
      });

    } catch (error) {

      console.error(
        "LOCATION STATUS:",
        error
      );

      return res
        .status(500)
        .json({
          error: {
            message:
              "Erro ao consultar localização"
          }
        });
    }
  }
);


/* ===================================================
   TODOS OS USUARIOS
   =================================================== */

router.get(
  "/users",

  requireAuth,

  async (
    req,
    res
  ) => {

    try {

      if (
        !await canViewAll(
          String(
            req.user.id
          )
        )
      ) {

        return res
          .status(403)
          .json({
            error: {
              message:
                "Sem permissão"
            }
          });
      }


      const [rows] =
        await db.execute(
          `
            SELECT

              p.id AS user_id,

              p.full_name,

              p.email,

              p.avatar_url,

              p.location_sharing_enabled,

              ul.latitude,

              ul.longitude,

              ul.city,

              ul.region,

              ul.country,

              ul.neighborhood,

              ul.street,

              ul.location_source,

              ul.last_updated

            FROM profiles p

            LEFT JOIN user_locations ul
              ON ul.user_id =
                 p.id

            WHERE
              COALESCE(
                p.is_active,
                1
              ) = 1

            ORDER BY
              CASE
                WHEN
                  ul.last_updated
                  IS NULL
                THEN 1
                ELSE 0
              END,

              ul.last_updated DESC,

              p.full_name ASC
          `
        );


      const data =
        rows.map(
          row => ({
            user_id:
              row.user_id,

            latitude:
              row.latitude,

            longitude:
              row.longitude,

            city:
              row.city,

            region:
              row.region,

            country:
              row.country,

            neighborhood:
              row.neighborhood,

            street:
              row.street,

            location_source:
              row.location_source,

            last_updated:
              row.last_updated,

            profile: {
              full_name:
                row.full_name,

              email:
                row.email,

              avatar_url:
                row.avatar_url,

              location_sharing_enabled:
                row
                  .location_sharing_enabled
            }
          })
        );


      return res.json({
        data
      });

    } catch (error) {

      console.error(
        "LOCATION USERS:",
        error
      );

      return res
        .status(500)
        .json({
          error: {
            message:
              "Erro ao carregar localizações"
          }
        });
    }
  }
);


export default router;
