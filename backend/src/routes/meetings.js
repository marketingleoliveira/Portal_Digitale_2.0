import express from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";

import {
  AccessToken,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  RoomServiceClient
} from "livekit-server-sdk";

import {
  db
} from "../database.js";

import {
  config
} from "../config.js";

const router =
  express.Router();

const LIVEKIT_API =
  process.env.LIVEKIT_URL
  ||
  "http://127.0.0.1:7880";

const roomService =
  new RoomServiceClient(
    LIVEKIT_API,
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET
  );

const egress =
  new EgressClient(
    LIVEKIT_API,
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET
  );


function cleanCode(value) {
  return String(
    value || ""
  )
    .trim()
    .toLowerCase();
}


function roomName(id) {
  return (
    "digitale-" +
    String(id)
      .replace(
        /[^a-zA-Z0-9]/g,
        ""
      )
  );
}


function generateMeetingCode() {

  const chars =
    "abcdefghijklmnopqrstuvwxyz";

  const part =
    size => {

      let value = "";

      for (
        let i = 0;
        i < size;
        i++
      ) {
        value +=
          chars[
            crypto.randomInt(
              0,
              chars.length
            )
          ];
      }

      return value;
    };

  return (
    part(3) +
    "-" +
    part(4) +
    "-" +
    part(3)
  );
}


async function uniqueMeetingCode() {

  for (
    let i = 0;
    i < 30;
    i++
  ) {

    const code =
      generateMeetingCode();

    const [rows] =
      await db.execute(
        `
          SELECT id
          FROM meetings
          WHERE meeting_code = ?
          LIMIT 1
        `,
        [code]
      );

    if (!rows.length) {
      return code;
    }
  }

  throw new Error(
    "Falha ao gerar código"
  );
}


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
      throw new Error();
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


async function getRoles(
  userId
) {

  const [rows] =
    await db.execute(
      `
        SELECT role
        FROM user_roles
        WHERE user_id = ?
      `,
      [userId]
    );

  return rows.map(
    row =>
      String(
        row.role || ""
      )
  );
}


async function canModerate(
  userId
) {

  const roles =
    await getRoles(
      userId
    );

  return roles.some(
    role =>
      [
        "dev",
        "admin",
        "gerente",
        "diretoria"
      ].includes(role)
  );
}


async function ensureLiveKitRoom(
  meetingId
) {

  const lkRoom =
    roomName(
      meetingId
    );

  const rooms =
    await roomService
      .listRooms(
        [lkRoom]
      );

  if (!rooms.length) {

    await roomService
      .createRoom({
        name:
          lkRoom,

        emptyTimeout:
          3600,

        departureTimeout:
          300,

        maxParticipants:
          50
      });
  }

  return lkRoom;
}


/*
 * GARANTIA:
 * nenhuma pessoa recebe token para entrar
 * antes de a gravação automática estar iniciada.
 */
async function ensureAutomaticRecording(
  meeting
) {

  if (
    meeting.recording_ref
  ) {

    const [existing] =
      await db.execute(
        `
          SELECT *
          FROM meeting_recordings
          WHERE id = ?
          LIMIT 1
        `,
        [
          meeting.recording_ref
        ]
      );

    if (
      existing.length
      &&
      ![
        "failed",
        "aborted",
        "limit_reached"
      ].includes(
        String(
          existing[0].status
        )
      )
    ) {
      return existing[0];
    }

    await db.execute(
      `
        UPDATE meetings
        SET recording_ref = NULL
        WHERE
          id = ?
          AND recording_ref = ?
      `,
      [
        meeting.id,
        meeting.recording_ref
      ]
    );
  }


  const recordingId =
    crypto.randomUUID();

  const pendingId =
    `pending_${recordingId}`;

  await db.execute(
    `
      INSERT INTO meeting_recordings
      (
        id,
        meeting_id,
        meeting_title,
        meeting_date,
        recording_id,
        download_url,
        duration_seconds,
        created_at,
        status,
        storage_path,
        started_at
      )
      VALUES
      (
        ?,
        ?,
        ?,
        NOW(6),
        ?,
        NULL,
        NULL,
        NOW(6),
        'starting',
        ?,
        NOW(6)
      )
    `,
    [
      recordingId,
      meeting.id,
      meeting.title,
      pendingId,
      `${recordingId}.mp4`
    ]
  );


  const [claim] =
    await db.execute(
      `
        UPDATE meetings
        SET recording_ref = ?
        WHERE
          id = ?
          AND
          (
            recording_ref IS NULL
            OR recording_ref = ''
          )
      `,
      [
        recordingId,
        meeting.id
      ]
    );


  if (
    claim.affectedRows !== 1
  ) {

    await db.execute(
      `
        DELETE FROM meeting_recordings
        WHERE id = ?
      `,
      [
        recordingId
      ]
    );

    const [current] =
      await db.execute(
        `
          SELECT
            r.*
          FROM meetings m
          JOIN meeting_recordings r
            ON r.id =
               m.recording_ref
          WHERE m.id = ?
          LIMIT 1
        `,
        [
          meeting.id
        ]
      );

    if (current.length) {
      return current[0];
    }

    throw new Error(
      "Não foi possível reservar a gravação"
    );
  }


  try {

    const lkRoom =
      await ensureLiveKitRoom(
        meeting.id
      );

    const output =
      new EncodedFileOutput({
        fileType:
          EncodedFileType.MP4,

        filepath:
          `${recordingId}.mp4`,

        disableManifest:
          true
      });

    const info =
      await egress
        .startRoomCompositeEgress(
          lkRoom,
          output,
          {
            layout:
              "grid",

            audioOnly:
              false,

            videoOnly:
              false
          }
        );

    const egressId =
      String(
        info.egressId
      );

    await db.execute(
      `
        UPDATE meeting_recordings
        SET
          recording_id = ?,
          egress_id = ?,
          status = 'recording'
        WHERE id = ?
      `,
      [
        egressId,
        egressId,
        recordingId
      ]
    );

    return {
      id:
        recordingId,

      meeting_id:
        meeting.id,

      recording_id:
        egressId,

      egress_id:
        egressId,

      status:
        "recording"
    };

  } catch (error) {

    console.error(
      "AUTO RECORD START:",
      error
    );

    await db.execute(
      `
        UPDATE meeting_recordings
        SET
          status = 'failed',
          completed_at = NOW(6),
          error_message = ?
        WHERE id = ?
      `,
      [
        String(
          error?.message
          ||
          error
        ).slice(
          0,
          2000
        ),

        recordingId
      ]
    );

    await db.execute(
      `
        UPDATE meetings
        SET recording_ref = NULL
        WHERE
          id = ?
          AND recording_ref = ?
      `,
      [
        meeting.id,
        recordingId
      ]
    );

    throw new Error(
      "A gravação automática não pôde ser iniciada. A reunião não foi aberta para evitar uma chamada sem gravação."
    );
  }
}


async function stopMeetingRecording(
  meeting
) {

  if (
    !meeting.recording_ref
  ) {
    return;
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
        meeting.recording_ref
      ]
    );

  if (!rows.length) {
    return;
  }

  const recording =
    rows[0];

  if (
    recording.egress_id
    &&
    [
      "starting",
      "recording",
      "processing"
    ].includes(
      String(
        recording.status
      )
    )
  ) {

    try {

      await egress.stopEgress(
        recording.egress_id
      );

      await db.execute(
        `
          UPDATE meeting_recordings
          SET status = 'processing'
          WHERE id = ?
        `,
        [
          recording.id
        ]
      );

    } catch (error) {

      console.error(
        "STOP EGRESS:",
        error?.message
        ||
        error
      );
    }
  }
}


async function createMeetingToken({
  identity,
  name,
  meetingId,
  moderator = false
}) {

  const token =
    new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      {
        identity,
        name,
        ttl: "24h"
      }
    );

  token.addGrant({
    roomJoin:
      true,

    room:
      roomName(
        meetingId
      ),

    canPublish:
      true,

    canSubscribe:
      true,

    canPublishData:
      true,

    roomAdmin:
      moderator
  });

  return {
    token:
      await token.toJwt(),

    roomName:
      roomName(
        meetingId
      ),

    serverUrl:
      process.env.LIVEKIT_PUBLIC_URL
      ||
      "wss://portal.digitaletextil.com.br"
  };
}


/* ==================================================
   INFO PUBLICA
   ================================================== */

router.get(
  "/public/:code",

  async (
    req,
    res
  ) => {

    try {

      const code =
        cleanCode(
          req.params.code
        );

      const [rows] =
        await db.execute(
          `
            SELECT
              title,
              meeting_code,
              is_active,
              ended_at,
              CASE
                WHEN
                  password IS NULL
                  OR password = ''
                THEN 0
                ELSE 1
              END AS has_password
            FROM meetings
            WHERE meeting_code = ?
            LIMIT 1
          `,
          [code]
        );

      if (!rows.length) {

        return res
          .status(404)
          .json({
            error: {
              message:
                "Reunião não encontrada"
            }
          });
      }

      const meeting =
        rows[0];

      return res.json({
        title:
          meeting.title,

        meeting_code:
          meeting.meeting_code,

        is_active:
          Number(
            meeting.is_active
          ) === 1
          &&
          !meeting.ended_at,

        has_password:
          Number(
            meeting.has_password
          ) === 1,

        automatic_recording:
          true
      });

    } catch (error) {

      console.error(error);

      return res
        .status(500)
        .json({
          error: {
            message:
              "Erro ao carregar reunião"
          }
        });
    }
  }
);


/* ==================================================
   CONVIDADO
   ================================================== */

router.post(
  "/public/:code/join",

  async (
    req,
    res
  ) => {

    try {

      const code =
        cleanCode(
          req.params.code
        );

      const guestName =
        String(
          req.body?.name
          ||
          ""
        ).trim();

      const password =
        String(
          req.body?.password
          ||
          ""
        );

      if (
        !guestName
        ||
        guestName.length >
          100
      ) {

        return res
          .status(400)
          .json({
            error: {
              message:
                "Informe seu nome"
            }
          });
      }

      const [rows] =
        await db.execute(
          `
            SELECT *
            FROM meetings
            WHERE meeting_code = ?
            LIMIT 1
          `,
          [code]
        );

      if (!rows.length) {

        return res
          .status(404)
          .json({
            error: {
              message:
                "Reunião não encontrada"
            }
          });
      }

      const meeting =
        rows[0];

      if (
        Number(
          meeting.is_active
        ) !== 1
        ||
        meeting.ended_at
      ) {

        return res
          .status(410)
          .json({
            error: {
              message:
                "Esta reunião já foi encerrada"
            }
          });
      }

      if (
        meeting.password
        &&
        String(
          meeting.password
        ) !== password
      ) {

        return res
          .status(403)
          .json({
            error: {
              message:
                "Senha incorreta"
            }
          });
      }


      /*
       * Antes de liberar o convidado,
       * inicia a gravação.
       */
      await ensureAutomaticRecording(
        meeting
      );


      const access =
        await createMeetingToken({
          identity:
            "guest-"
            +
            crypto.randomUUID(),

          name:
            guestName,

          meetingId:
            meeting.id,

          moderator:
            false
        });

      return res.json({
        ok:
          true,

        meetingId:
          meeting.id,

        meetingCode:
          meeting.meeting_code,

        title:
          meeting.title,

        recording:
          true,

        ...access
      });

    } catch (error) {

      console.error(
        "GUEST JOIN:",
        error
      );

      return res
        .status(503)
        .json({
          error: {
            message:
              error?.message
              ||
              "Erro ao entrar na reunião"
          }
        });
    }
  }
);


/* ==================================================
   LISTAR
   ================================================== */

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
              m.*,
              p.full_name
                AS host_full_name,
              p.avatar_url
                AS host_avatar_url
            FROM meetings m
            LEFT JOIN profiles p
              ON p.id =
                 m.host_user_id
            WHERE
              m.ended_at IS NULL
              AND
              (
                m.host_user_id = ?
                OR m.is_active = 1
              )
            ORDER BY
              m.created_at DESC
            LIMIT 20
          `,
          [
            req.user.id
          ]
        );

      const data =
        rows.map(
          row => {

            const {
              host_full_name,
              host_avatar_url,
              password,
              ...meeting
            } = row;

            return {
              ...meeting,

              has_password:
                !!password,

              automatic_recording:
                true,

              host_profile:
                host_full_name
                  ? {
                      full_name:
                        host_full_name,

                      avatar_url:
                        host_avatar_url
                    }
                  : null
            };
          }
        );

      return res.json({
        data
      });

    } catch (error) {

      console.error(error);

      return res
        .status(500)
        .json({
          error: {
            message:
              "Erro ao carregar reuniões"
          }
        });
    }
  }
);


/* ==================================================
   CRIAR
   ================================================== */

router.post(
  "/create",

  requireAuth,

  async (
    req,
    res
  ) => {

    try {

      const title =
        String(
          req.body?.title
          ||
          ""
        ).trim();

      const password =
        String(
          req.body?.password
          ||
          ""
        ).trim();

      if (!title) {

        return res
          .status(400)
          .json({
            error: {
              message:
                "Informe o nome da reunião"
            }
          });
      }

      const id =
        crypto.randomUUID();

      const code =
        await uniqueMeetingCode();

      await db.execute(
        `
          INSERT INTO meetings
          (
            id,
            title,
            meeting_code,
            host_user_id,
            is_active,
            started_at,
            password,
            created_at,
            updated_at
          )
          VALUES
          (
            ?,
            ?,
            ?,
            ?,
            1,
            NOW(6),
            ?,
            NOW(6),
            NOW(6)
          )
        `,
        [
          id,
          title,
          code,
          req.user.id,
          password || null
        ]
      );

      /*
       * Cria antecipadamente a sala WebRTC.
       * A gravação efetiva começa
       * automaticamente no primeiro acesso.
       */
      await ensureLiveKitRoom(
        id
      );

      return res
        .status(201)
        .json({
          id,
          title,

          meeting_code:
            code,

          automatic_recording:
            true
        });

    } catch (error) {

      console.error(
        "CREATE MEETING:",
        error
      );

      return res
        .status(500)
        .json({
          error: {
            message:
              "Erro ao criar reunião"
          }
        });
    }
  }
);


/* ==================================================
   USUARIO INTERNO
   ================================================== */

router.post(
  "/member/:code/join",

  requireAuth,

  async (
    req,
    res
  ) => {

    try {

      const code =
        cleanCode(
          req.params.code
        );

      const password =
        String(
          req.body?.password
          ||
          ""
        );

      const [rows] =
        await db.execute(
          `
            SELECT *
            FROM meetings
            WHERE meeting_code = ?
            LIMIT 1
          `,
          [code]
        );

      if (!rows.length) {

        return res
          .status(404)
          .json({
            error: {
              message:
                "Reunião não encontrada"
            }
          });
      }

      const meeting =
        rows[0];

      if (
        Number(
          meeting.is_active
        ) !== 1
        ||
        meeting.ended_at
      ) {

        return res
          .status(410)
          .json({
            error: {
              message:
                "Esta reunião já foi encerrada"
            }
          });
      }

      const isHost =
        String(
          meeting.host_user_id
        )
        ===
        String(
          req.user.id
        );

      if (
        !isHost
        &&
        meeting.password
        &&
        String(
          meeting.password
        ) !== password
      ) {

        return res
          .status(403)
          .json({
            password_required:
              true,

            title:
              meeting.title,

            error: {
              message:
                password
                  ? "Senha incorreta"
                  : "Esta reunião possui senha"
            }
          });
      }


      /*
       * GRAVAÇÃO OBRIGATÓRIA.
       * Se o servidor de gravação não iniciar,
       * a entrada não é liberada.
       */
      await ensureAutomaticRecording(
        meeting
      );


      const [profiles] =
        await db.execute(
          `
            SELECT
              full_name,
              email
            FROM profiles
            WHERE id = ?
            LIMIT 1
          `,
          [
            req.user.id
          ]
        );

      const profile =
        profiles[0] || {};

      const moderator =
        isHost
        ||
        await canModerate(
          req.user.id
        );

      const access =
        await createMeetingToken({
          identity:
            req.user.id,

          name:
            profile.full_name
            ||
            profile.email
            ||
            "Participante",

          meetingId:
            meeting.id,

          moderator
        });

      return res.json({
        ok:
          true,

        meetingId:
          meeting.id,

        title:
          meeting.title,

        meetingCode:
          meeting.meeting_code,

        isHost,

        moderator,

        recording:
          true,

        ...access
      });

    } catch (error) {

      console.error(
        "MEMBER JOIN:",
        error
      );

      return res
        .status(503)
        .json({
          error: {
            message:
              error?.message
              ||
              "Erro ao entrar na reunião"
          }
        });
    }
  }
);


/* ==================================================
   ENCERRAR
   ================================================== */

router.post(
  "/:id/end",

  requireAuth,

  async (
    req,
    res
  ) => {

    try {

      const [rows] =
        await db.execute(
          `
            SELECT *
            FROM meetings
            WHERE id = ?
            LIMIT 1
          `,
          [
            req.params.id
          ]
        );

      if (!rows.length) {

        return res
          .status(404)
          .json({
            error: {
              message:
                "Reunião não encontrada"
            }
          });
      }

      const meeting =
        rows[0];

      const host =
        String(
          meeting.host_user_id
        )
        ===
        String(
          req.user.id
        );

      const moderator =
        await canModerate(
          req.user.id
        );

      if (
        !host
        &&
        !moderator
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


      await stopMeetingRecording(
        meeting
      );


      try {

        await roomService.deleteRoom(
          roomName(
            meeting.id
          )
        );

      } catch {}


      await db.execute(
        `
          UPDATE meetings
          SET
            is_active = 0,
            ended_at = NOW(6),
            updated_at = NOW(6)
          WHERE id = ?
        `,
        [
          meeting.id
        ]
      );

      return res.json({
        ok:
          true,

        recording_finalizing:
          true
      });

    } catch (error) {

      console.error(
        "END MEETING:",
        error
      );

      return res
        .status(500)
        .json({
          error: {
            message:
              "Erro ao encerrar reunião"
          }
        });
    }
  }
);


/* ==================================================
   ENCERRAR TODAS
   ================================================== */

router.post(
  "/end-all",

  requireAuth,

  async (
    req,
    res
  ) => {

    try {

      if (
        !await canModerate(
          req.user.id
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

      const [meetings] =
        await db.execute(
          `
            SELECT *
            FROM meetings
            WHERE
              is_active = 1
              AND ended_at IS NULL
          `
        );

      for (
        const meeting of
        meetings
      ) {

        await stopMeetingRecording(
          meeting
        );

        try {
          await roomService.deleteRoom(
            roomName(
              meeting.id
            )
          );
        } catch {}
      }

      const [result] =
        await db.execute(
          `
            UPDATE meetings
            SET
              is_active = 0,
              ended_at = NOW(6),
              updated_at = NOW(6)
            WHERE
              is_active = 1
              AND ended_at IS NULL
          `
        );

      return res.json({
        ok:
          true,

        count:
          result.affectedRows
          || 0
      });

    } catch (error) {

      console.error(
        "END ALL:",
        error
      );

      return res
        .status(500)
        .json({
          error: {
            message:
              "Erro ao encerrar reuniões"
          }
        });
    }
  }
);

export default router;
