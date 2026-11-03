import * as devRecordingFs from "node:fs/promises";
import * as devRecordingPath from "node:path";
import { randomUUID as devRecordingUUID } from "node:crypto";
import express from "express";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";

import {
  EgressClient
} from "livekit-server-sdk";

import {
  db
} from "../database.js";

import {
  config
} from "../config.js";

const router =
  express.Router();

const ROOT =
  process.env.RECORDINGS_ROOT
  ||
  "/var/lib/portal-digitale/recordings";

const LIVEKIT_API =
  process.env.LIVEKIT_URL
  ||
  "http://127.0.0.1:7880";

const egress =
  new EgressClient(
    LIVEKIT_API,
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET
  );


function requireAuth(
  req,
  res,
  next
) {

  const auth =
    String(
      req.headers.authorization
      || ""
    );

  if (
    !auth.startsWith(
      "Bearer "
    )
  ) {
    return res
      .status(401)
      .json({
        error: {
          message:
            "Sessão inválida"
        }
      });
  }

  try {

    const token =
      auth.slice(7).trim();

    const payload =
      jwt.verify(
        token,
        config.jwtSecret
      );

    const id =
      typeof payload === "object"
        ? (
            payload.sub
            ||
            payload.user_id
            ||
            payload.userId
            ||
            payload.id
          )
        : null;

    if (!id) {
      throw new Error(
        "Sessão inválida"
      );
    }

    req.user = {
      id: String(id)
    };

    next();

  } catch {

    return res
      .status(401)
      .json({
        error: {
          message:
            "Sessão expirada"
        }
      });
  }
}


function numberValue(
  value
) {

  if (
    value === null
    ||
    value === undefined
  ) {
    return 0;
  }

  try {
    return Number(value);
  } catch {
    return 0;
  }
}


function durationSeconds(
  value
) {

  const raw =
    numberValue(value);

  if (!raw) {
    return null;
  }

  /*
   * LiveKit reporta duração em nanossegundos.
   */
  if (
    raw > 1000000
  ) {
    return Math.max(
      1,
      Math.round(
        raw / 1000000000
      )
    );
  }

  return Math.max(
    1,
    Math.round(raw)
  );
}


function statusName(
  value
) {

  const status =
    numberValue(value);

  switch (status) {
    case 0:
      return "starting";

    case 1:
      return "recording";

    case 2:
      return "processing";

    case 3:
      return "completed";

    case 4:
      return "failed";

    case 5:
      return "aborted";

    case 6:
      return "limit_reached";

    default:
      return "recording";
  }
}


async function syncRecording(
  row
) {

  if (
    !row.egress_id
    ||
    ![
      "starting",
      "recording",
      "processing"
    ].includes(
      String(
        row.status || ""
      )
    )
  ) {
    return row;
  }

  try {

    const list =
      await egress.listEgress({
        egressId:
          row.egress_id
      });

    if (!list.length) {
      return row;
    }

    const info =
      list[0];

    const status =
      statusName(
        info.status
      );

    const file =
      Array.isArray(
        info.fileResults
      )
        ? info.fileResults[0]
        : null;

    const duration =
      file
        ? durationSeconds(
            file.duration
          )
        : row.duration_seconds;

    const size =
      file
        ? numberValue(
            file.size
          )
        : row.size_bytes;

    const finalState =
      [
        "completed",
        "failed",
        "aborted",
        "limit_reached"
      ].includes(status);

    await db.execute(
      `
        UPDATE meeting_recordings
        SET
          status = ?,
          duration_seconds =
            COALESCE(?, duration_seconds),
          size_bytes =
            COALESCE(?, size_bytes),
          completed_at =
            CASE
              WHEN ? = 1
              THEN COALESCE(
                completed_at,
                NOW(6)
              )
              ELSE completed_at
            END,
          error_message =
            CASE
              WHEN ? IN
                (
                  'failed',
                  'aborted',
                  'limit_reached'
                )
              THEN ?
              ELSE error_message
            END
        WHERE id = ?
      `,
      [
        status,
        duration,
        size || null,
        finalState ? 1 : 0,
        status,
        info.error || null,
        row.id
      ]
    );

    if (
      finalState
      &&
      row.meeting_id
    ) {

      await db.execute(
        `
          UPDATE meetings
          SET recording_ref = NULL
          WHERE
            id = ?
            AND recording_ref = ?
            AND is_active = 1
        `,
        [
          row.meeting_id,
          row.id
        ]
      );
    }

    return {
      ...row,
      status,
      duration_seconds:
        duration,
      size_bytes:
        size || row.size_bytes
    };

  } catch (error) {

    console.error(
      "SYNC RECORDING:",
      error?.message ||
      error
    );

    return row;
  }
}


router.get(
  "/list",
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
              r.*,
              m.meeting_code
            FROM meeting_recordings r
            LEFT JOIN meetings m
              ON m.id =
                 r.meeting_id
            ORDER BY
              r.created_at DESC
          `
        );

      for (
        const row of rows
      ) {
        await syncRecording(
          row
        );
      }

      const [fresh] =
        await db.execute(
          `
            SELECT
              r.*,
              m.meeting_code
            FROM meeting_recordings r
            LEFT JOIN meetings m
              ON m.id =
                 r.meeting_id
            ORDER BY
              r.created_at DESC
          `
        );

      const data =
        fresh.map(
          row => {

            let playUrl =
              row.download_url
              || null;

            if (
              row.storage_path
              &&
              row.status ===
                "completed"
            ) {

              const sig =
                jwt.sign(
                  {
                    type:
                      "recording-file",

                    rid:
                      row.id
                  },

                  config.jwtSecret,

                  {
                    expiresIn:
                      "30m"
                  }
                );

              playUrl =
                `/api/recordings/${encodeURIComponent(
                  row.id
                )}/file?sig=${encodeURIComponent(
                  sig
                )}`;
            }

            return {
              ...row,

              play_url:
                playUrl,

              download_url:
                playUrl
                  ? (
                    playUrl
                    +
                    (
                      playUrl.includes("?")
                        ? "&"
                        : "?"
                    )
                    +
                    "download=1"
                  )
                  : null
            };
          }
        );

      return res.json({
        data
      });

    } catch (error) {

      console.error(
        "RECORDINGS LIST:",
        error
      );

      return res
        .status(500)
        .json({
          error: {
            message:
              "Erro ao carregar gravações"
          }
        });
    }
  }
);


router.get(
  "/:id/file",

  async (
    req,
    res
  ) => {

    try {

      const sig =
        String(
          req.query.sig || ""
        );

      const payload =
        jwt.verify(
          sig,
          config.jwtSecret
        );

      if (
        typeof payload !==
          "object"
        ||
        payload.type !==
          "recording-file"
        ||
        String(
          payload.rid
        ) !==
          String(
            req.params.id
          )
      ) {
        throw new Error(
          "Token inválido"
        );
      }

      const [rows] =
        await db.execute(
          `
            SELECT *
            FROM meeting_recordings
            WHERE id = ?
            LIMIT 1
          `,
          [
            String(
              req.params.id
            )
          ]
        );

      if (!rows.length) {
        return res
          .status(404)
          .send(
            "Gravação não encontrada"
          );
      }

      const recording =
        rows[0];

      if (
        recording.storage_path
      ) {

        const fileName =
          path.basename(
            String(
              recording.storage_path
            )
          );

        const fullPath =
          path.join(
            ROOT,
            fileName
          );

        if (
          !fs.existsSync(
            fullPath
          )
        ) {
          return res
            .status(404)
            .send(
              "Arquivo ainda não disponível"
            );
        }

        if (
          String(
            req.query.download
            || ""
          ) === "1"
        ) {

          const safeTitle =
            String(
              recording.meeting_title
              ||
              "reuniao"
            )
              .replace(
                /[^a-zA-Z0-9_-]/g,
                "_"
              )
              .slice(
                0,
                80
              );

          return res.download(
            fullPath,
            `${safeTitle}.mp4`
          );
        }

        res.type(
          "video/mp4"
        );

        return res.sendFile(
          fullPath
        );
      }

      if (
        recording.download_url
      ) {
        return res.redirect(
          recording.download_url
        );
      }

      return res
        .status(404)
        .send(
          "Arquivo indisponível"
        );

    } catch {

      return res
        .status(403)
        .send(
          "Link de gravação expirado"
        );
    }
  }
);


router.delete(
  "/:id",
  requireAuth,

  async (
    req,
    res
  ) => {

    try {

      const [roles] =
        await db.execute(
          `
            SELECT role
            FROM user_roles
            WHERE user_id = ?
          `,
          [
            req.user.id
          ]
        );

      const canDelete =
        roles.some(
          row =>
            [
              "dev",
              "admin"
            ].includes(
              String(
                row.role
              )
            )
        );

      if (!canDelete) {

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
            SELECT *
            FROM meeting_recordings
            WHERE id = ?
            LIMIT 1
          `,
          [
            String(
              req.params.id
            )
          ]
        );

      if (!rows.length) {
        return res
          .status(404)
          .json({
            error: {
              message:
                "Gravação não encontrada"
            }
          });
      }

      const recording =
        rows[0];

      if (
        [
          "starting",
          "recording",
          "processing"
        ].includes(
          recording.status
        )
      ) {
        return res
          .status(409)
          .json({
            error: {
              message:
                "A gravação ainda está em andamento"
            }
          });
      }

      if (
        recording.storage_path
      ) {

        const fullPath =
          path.join(
            ROOT,
            path.basename(
              recording.storage_path
            )
          );

        try {
          fs.unlinkSync(
            fullPath
          );
        } catch {}
      }

      await db.execute(
        `
          DELETE FROM meeting_recordings
          WHERE id = ?
        `,
        [
          recording.id
        ]
      );

      return res.json({
        ok: true
      });

    } catch (error) {

      console.error(
        "DELETE RECORDING:",
        error
      );

      return res
        .status(500)
        .json({
          error: {
            message:
              "Erro ao excluir gravação"
          }
        });
    }
  }
);



/* DEV_RECORDING_DELETE_V2 */

const devRecordingRoots = [
  "/var/lib/portal-digitale/recordings",
  "/var/lib/portal-digitale/uploads"
];

const devActiveRecordingStatuses =
  new Set([
    "starting",
    "recording",
    "running",
    "processing",
    "active",
    "in_progress"
  ]);


async function requireDevRecordingDelete(
  req,
  res,
  next
) {
  try {
    const userId =
      req.user?.id
      || req.user?.sub;

    if (!userId) {
      return res.status(401).json({
        error: {
          message: "Sessão inválida."
        }
      });
    }

    const [rows] =
      await db.execute(
        `
          SELECT role
          FROM user_roles
          WHERE user_id = ?
            AND LOWER(role) IN (
              'dev',
              'desenvolvedor'
            )
          LIMIT 1
        `,
        [userId]
      );

    if (!rows.length) {
      return res.status(403).json({
        error: {
          message:
            "Somente o Desenvolvedor pode excluir gravações."
        }
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}


router.get(
  "/developer/manage/list",
  requireAuth,
  requireDevRecordingDelete,
  async (_req, res, next) => {
    try {
      const [rows] =
        await db.query(
          `
            SELECT *
            FROM meeting_recordings
            ORDER BY
              COALESCE(
                completed_at,
                started_at
              ) DESC
            LIMIT 500
          `
        );

      return res.json({
        recordings: rows
      });
    } catch (error) {
      return next(error);
    }
  }
);


router.delete(
  "/developer/manage/:id",
  requireAuth,
  requireDevRecordingDelete,
  async (req, res, next) => {
    const id =
      String(
        req.params?.id || ""
      ).trim();

    if (
      !id
      || id.length > 128
    ) {
      return res.status(400).json({
        error: {
          message:
            "Identificador inválido."
        }
      });
    }

    const connection =
      await db.getConnection();

    let originalFile = null;
    let stagedFile = null;

    try {
      const [rows] =
        await connection.execute(
          `
            SELECT *
            FROM meeting_recordings
            WHERE id = ?
            LIMIT 1
          `,
          [id]
        );

      const recording =
        rows?.[0];

      if (!recording) {
        return res.status(404).json({
          error: {
            message:
              "Gravação não encontrada."
          }
        });
      }

      const status =
        String(
          recording.status || ""
        )
          .trim()
          .toLowerCase();

      if (
        devActiveRecordingStatuses
          .has(status)
      ) {
        return res.status(409).json({
          error: {
            message:
              "A gravação ainda está em andamento."
          }
        });
      }

      const storagePath =
        String(
          recording.storage_path || ""
        ).trim();

      if (storagePath) {
        const candidates =
          devRecordingRoots.map(
            root => {
              const resolvedRoot =
                devRecordingPath.resolve(root);

              const file =
                devRecordingPath.isAbsolute(
                  storagePath
                )
                  ? devRecordingPath.resolve(
                      storagePath
                    )
                  : devRecordingPath.resolve(
                      resolvedRoot,
                      storagePath
                    );

              return {
                root: resolvedRoot,
                file
              };
            }
          );

        const accepted =
          candidates.find(
            candidate =>
              candidate.file !== candidate.root
              &&
              candidate.file.startsWith(
                candidate.root
                + devRecordingPath.sep
              )
          );

        if (!accepted) {
          return res.status(409).json({
            error: {
              message:
                "Arquivo fora do diretório permitido."
            }
          });
        }

        originalFile =
          accepted.file;

        try {
          const stat =
            await devRecordingFs.lstat(
              originalFile
            );

          if (
            stat.isSymbolicLink()
            || !stat.isFile()
          ) {
            return res.status(409).json({
              error: {
                message:
                  "Arquivo de gravação inválido."
              }
            });
          }

          stagedFile =
            devRecordingPath.join(
              accepted.root,
              `.delete-${
                devRecordingUUID()
              }${
                devRecordingPath.extname(
                  originalFile
                )
              }`
            );

          await devRecordingFs.rename(
            originalFile,
            stagedFile
          );
        } catch (error) {
          if (
            error?.code !== "ENOENT"
          ) {
            throw error;
          }

          originalFile = null;
          stagedFile = null;
        }
      }

      await connection.beginTransaction();

      try {
        await connection.execute(
          `
            UPDATE meetings
            SET recording_ref = NULL
            WHERE recording_ref = ?
               OR recording_ref = ?
               OR recording_ref = ?
          `,
          [
            recording.id,
            recording.egress_id || null,
            recording.storage_path || null
          ]
        );
      } catch (referenceError) {
        if (
          referenceError?.code !==
            "ER_BAD_FIELD_ERROR"
          &&
          referenceError?.code !==
            "ER_NO_SUCH_TABLE"
        ) {
          throw referenceError;
        }
      }

      const [deleted] =
        await connection.execute(
          `
            DELETE FROM meeting_recordings
            WHERE id = ?
            LIMIT 1
          `,
          [id]
        );

      if (
        Number(
          deleted?.affectedRows || 0
        ) !== 1
      ) {
        throw new Error(
          "Registro não foi excluído."
        );
      }

      await connection.commit();

      if (stagedFile) {
        try {
          await devRecordingFs.unlink(
            stagedFile
          );
        } catch (error) {
          console.error(
            "RECORDING_DELETE_CLEANUP",
            error
          );
        }
      }

      return res.json({
        ok: true,
        id,
        fileDeleted:
          Boolean(stagedFile)
      });

    } catch (error) {
      try {
        await connection.rollback();
      } catch {}

      if (
        stagedFile
        && originalFile
      ) {
        try {
          await devRecordingFs.rename(
            stagedFile,
            originalFile
          );
        } catch (restoreError) {
          console.error(
            "RECORDING_DELETE_RESTORE",
            restoreError
          );
        }
      }

      return next(error);

    } finally {
      connection.release();
    }
  }
);


export default router;
