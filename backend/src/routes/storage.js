import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { requireAuth } from "../lib/auth.js";
import {
  hasRole,
  hasFullAccess,
} from "../lib/authorization.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 150 * 1024 * 1024,
  },
});

const KNOWN_BUCKETS = new Set([
  "files",
  "avatars",
  "price-files",
  "ticket-attachments",
  "creation-files",
  "marketing-requests",
  "meeting-recordings",
  "notification-images",
  "testimonial-files",
  "reembolsos",
]);

const PUBLIC_READ_BUCKETS = new Set([
  "files",
  "avatars",
  "price-files",
  "ticket-attachments",
  "creation-files",
  "marketing-requests",
  "meeting-recordings",
  "notification-images",
  "testimonial-files",
]);

const CREATION_ROLES = new Set([
  "criacao",
  "dev",
  "marketing",
  "diretoria",
  "gerente",
]);

function cleanBucket(bucket) {
  const value = String(bucket || "");

  if (
    !/^[A-Za-z0-9_-]{1,80}$/.test(value) ||
    !KNOWN_BUCKETS.has(value)
  ) {
    throw new Error("invalid_bucket");
  }

  return value;
}

function cleanPath(value) {
  const raw =
    String(value || "")
      .replaceAll("\\", "/");

  const normalized =
    path.posix
      .normalize("/" + raw)
      .slice(1);

  if (
    !normalized ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new Error("invalid_path");
  }

  return normalized;
}

function absolute(bucket, objectPath) {
  return path.join(
    config.uploadDir,
    cleanBucket(bucket),
    cleanPath(objectPath)
  );
}

function firstFolder(objectPath) {
  return cleanPath(objectPath)
    .split("/")[0] || "";
}

function role(user) {
  return String(user?.role || "");
}
function canUpload(user, bucket, objectPath) {
  const currentRole = role(user);

  switch (bucket) {
    case "files":
      return hasRole(user, "admin");

    case "avatars":
      return (
        firstFolder(objectPath) === String(user?.id || "") ||
        hasFullAccess(user)
      );

    case "price-files":
      return hasFullAccess(user);

    case "ticket-attachments":
      return (
        firstFolder(objectPath) === String(user?.id || "") ||
        hasFullAccess(user)
      );

    case "creation-files":
      return CREATION_ROLES.has(currentRole);

    case "marketing-requests":
      return (
        currentRole === "marketing" ||
        hasRole(user, "dev")
      );

    case "meeting-recordings":
      return Boolean(user);

    case "notification-images":
      return hasRole(user, "admin");

    case "testimonial-files":
      return (
        currentRole === "marketing" ||
        hasRole(user, "dev")
      );

    case "reembolsos":
      return firstFolder(objectPath) ===
        String(user?.id || "");

    default:
      return false;
  }
}

function canRemove(user, bucket, objectPath) {
  const currentRole = role(user);

  switch (bucket) {
    case "files":
      return hasRole(user, "admin");

    case "avatars":
      return (
        firstFolder(objectPath) === String(user?.id || "") ||
        hasFullAccess(user)
      );

    case "price-files":
      return hasFullAccess(user);

    case "ticket-attachments":
      return (
        firstFolder(objectPath) === String(user?.id || "") ||
        hasFullAccess(user)
      );

    case "creation-files":
      return CREATION_ROLES.has(currentRole);

    case "marketing-requests":
      return hasRole(user, "dev");

    case "meeting-recordings":
      return hasRole(user, "dev");

    case "notification-images":
      return hasRole(user, "admin");

    case "testimonial-files":
      return (
        currentRole === "marketing" ||
        hasRole(user, "dev")
      );

    case "reembolsos":
      return (
        firstFolder(objectPath) ===
          String(user?.id || "") ||
        hasFullAccess(user)
      );

    default:
      return false;
  }
}

function canReadPrivate(user, bucket, objectPath) {
  if (PUBLIC_READ_BUCKETS.has(bucket)) {
    return true;
  }

  if (bucket === "reembolsos") {
    return (
      firstFolder(objectPath) ===
        String(user?.id || "") ||
      hasFullAccess(user) ||
      role(user) === "financeiro"
    );
  }

  return false;
}

function signStorageUrl(user, bucket, objectPath, expiresIn) {
  const seconds =
    Math.max(
      60,
      Math.min(
        Number(expiresIn || 3600),
        60 * 60 * 24 * 365
      )
    );

  return jwt.sign(
    {
      scope: "storage-read",
      user_id: user.id,
      bucket,
      path: objectPath,
    },
    config.jwtSecret,
    {
      expiresIn: seconds,
    }
  );
}

function validStorageToken(token, bucket, objectPath) {
  try {
    const payload =
      jwt.verify(
        String(token || ""),
        config.jwtSecret
      );

    return (
      payload?.scope === "storage-read" &&
      String(payload.bucket) === bucket &&
      String(payload.path) === objectPath
    );
  } catch {
    return false;
  }
}
router.post(
  "/upload/:bucket",
  requireAuth,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: {
            message: "file_required",
          },
        });
      }

      const bucket =
        cleanBucket(req.params.bucket);
      const objectPath =
        cleanPath(req.query.path);

      if (
        !canUpload(
          req.user,
          bucket,
          objectPath
        )
      ) {
        return res.status(403).json({
          data: null,
          error: {
            message: "forbidden",
          },
        });
      }

      const target =
        absolute(bucket, objectPath);

      if (
        String(req.query.upsert) !== "true"
      ) {
        try {
          await fs.access(target);
          return res.status(409).json({
            error: {
              message:
                "The resource already exists",
            },
          });
        } catch {}
      }

      await fs.mkdir(
        path.dirname(target),
        {
          recursive: true,
        }
      );

      await fs.writeFile(
        target,
        req.file.buffer
      );

      return res.status(201).json({
        data: {
          path: objectPath,
          fullPath:
            `${bucket}/${objectPath}`,
        },
        error: null,
      });
    } catch (error) {
      return res.status(400).json({
        data: null,
        error: {
          message:
            error?.message ||
            "upload_failed",
        },
      });
    }
  }
);

router.post(
  "/remove/:bucket",
  requireAuth,
  async (req, res) => {
    try {
      const bucket =
        cleanBucket(req.params.bucket);
      const paths =
        Array.isArray(req.body?.paths)
          ? req.body.paths
          : [];

      const cleaned =
        paths.map(cleanPath);

      for (
        const objectPath
        of cleaned
      ) {
        if (
          !canRemove(
            req.user,
            bucket,
            objectPath
          )
        ) {
          return res.status(403).json({
            data: null,
            error: {
              message: "forbidden",
            },
          });
        }
      }

      const removed = [];

      for (
        const objectPath
        of cleaned
      ) {
        const target =
          absolute(
            bucket,
            objectPath
          );

        await fs.rm(
          target,
          {
            force: true,
          }
        );

        removed.push({
          name: objectPath,
        });
      }

      return res.json({
        data: removed,
        error: null,
      });
    } catch (error) {
      return res.status(400).json({
        data: null,
        error: {
          message:
            error?.message ||
            "remove_failed",
        },
      });
    }
  }
);
router.post(
  "/signed/:bucket",
  requireAuth,
  async (req, res) => {
    try {
      const bucket =
        cleanBucket(req.params.bucket);
      const objectPath =
        cleanPath(req.body?.path);

      if (
        !canReadPrivate(
          req.user,
          bucket,
          objectPath
        )
      ) {
        return res.status(403).json({
          data: null,
          error: {
            message: "forbidden",
          },
        });
      }

      if (
        PUBLIC_READ_BUCKETS.has(bucket)
      ) {
        const signedUrl =
          `/api/storage/public?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(objectPath)}`;

        return res.json({
          data: {
            signedUrl,
          },
          error: null,
        });
      }

      const token =
        signStorageUrl(
          req.user,
          bucket,
          objectPath,
          req.body?.expiresIn
        );

      const signedUrl =
        `/api/storage/public?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(objectPath)}&token=${encodeURIComponent(token)}`;

      return res.json({
        data: {
          signedUrl,
        },
        error: null,
      });
    } catch (error) {
      return res.status(400).json({
        data: null,
        error: {
          message:
            error?.message ||
            "signed_url_failed",
        },
      });
    }
  }
);

router.get(
  "/public",
  async (req, res) => {
    try {
      const bucket =
        cleanBucket(req.query.bucket);
      const objectPath =
        cleanPath(req.query.path);

      if (
        !PUBLIC_READ_BUCKETS.has(bucket) &&
        !validStorageToken(
          req.query.token,
          bucket,
          objectPath
        )
      ) {
        return res.status(403).end();
      }

      const target =
        absolute(
          bucket,
          objectPath
        );

      return res.sendFile(target);
    } catch {
      return res.status(404).end();
    }
  }
);
router.get(
  "/list/:bucket",
  requireAuth,
  async (req, res) => {
    try {
      const bucket =
        cleanBucket(req.params.bucket);

      let prefix =
        String(
          req.query.prefix || ""
        );

      if (
        bucket === "reembolsos" &&
        !hasFullAccess(req.user) &&
        role(req.user) !== "financeiro"
      ) {
        const own =
          String(req.user.id);

        if (!prefix) {
          prefix = own;
        } else {
          const cleanedPrefix =
            cleanPath(prefix);

          if (
            firstFolder(
              cleanedPrefix
            ) !== own
          ) {
            return res.status(403).json({
              data: null,
              error: {
                message: "forbidden",
              },
            });
          }

          prefix =
            cleanedPrefix;
        }
      }

      const dir =
        prefix
          ? absolute(
              bucket,
              cleanPath(prefix)
            )
          : path.join(
              config.uploadDir,
              bucket
            );

      await fs.mkdir(
        dir,
        {
          recursive: true,
        }
      );

      const entries =
        await fs.readdir(
          dir,
          {
            withFileTypes: true,
          }
        );

      const output = [];

      for (
        const entry
        of entries
      ) {
        const target =
          path.join(
            dir,
            entry.name
          );

        const stat =
          await fs.stat(target);

        output.push({
          name: entry.name,
          id:
            entry.isDirectory()
              ? null
              : `${bucket}/${prefix}/${entry.name}`,
          created_at:
            stat.birthtime
              .toISOString(),
          updated_at:
            stat.mtime
              .toISOString(),
          metadata:
            entry.isDirectory()
              ? null
              : {
                  size:
                    stat.size,
                },
        });
      }

      output.sort(
        (a, b) =>
          String(
            b.created_at
          ).localeCompare(
            String(
              a.created_at
            )
          )
      );

      const limit =
        Math.min(
          Number(
            req.query.limit ||
            100
          ),
          1000
        );

      return res.json({
        data:
          output.slice(
            0,
            limit
          ),
        error: null,
      });
    } catch (error) {
      return res.status(400).json({
        data: null,
        error: {
          message:
            error?.message ||
            "list_failed",
        },
      });
    }
  }
);

router.get(
  "/catalog",
  requireAuth,
  async (req, res) => {
    if (!hasFullAccess(req.user)) {
      return res.status(403).json({
        data: null,
        error: { message: "forbidden" },
      });
    }

    try {
      const output = [];

      const walk = async (
        bucket,
        dir,
        prefix = ""
      ) => {
        let entries = [];

        try {
          entries = await fs.readdir(
            dir,
            { withFileTypes: true }
          );
        } catch {
          return;
        }

        for (const entry of entries) {
          const relative = prefix
            ? `${prefix}/${entry.name}`
            : entry.name;
          const target = path.join(
            dir,
            entry.name
          );

          if (entry.isDirectory()) {
            await walk(
              bucket,
              target,
              relative
            );
            continue;
          }

          const stat = await fs.stat(target);
          const isPrivate =
            bucket === "reembolsos";

          let url;

          if (isPrivate) {
            const token = signStorageUrl(
              req.user,
              bucket,
              relative,
              3600
            );

            url =
              `/api/storage/public?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(relative)}&token=${encodeURIComponent(token)}`;
          } else {
            url =
              `/api/storage/public?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(relative)}`;
          }

          output.push({
            bucket,
            path: relative,
            name: entry.name,
            size: stat.size,
            updated_at:
              stat.mtime.toISOString(),
            private: isPrivate,
            url,
          });
        }
      };

      for (const bucket of KNOWN_BUCKETS) {
        await walk(
          bucket,
          path.join(
            config.uploadDir,
            bucket
          )
        );
      }

      output.sort(
        (a, b) =>
          a.bucket.localeCompare(b.bucket) ||
          a.path.localeCompare(b.path)
      );

      const summary = {};

      for (const item of output) {
        if (!summary[item.bucket]) {
          summary[item.bucket] = {
            files: 0,
            bytes: 0,
          };
        }

        summary[item.bucket].files += 1;
        summary[item.bucket].bytes +=
          Number(item.size || 0);
      }

      return res.json({
        data: output,
        summary,
        total: output.length,
        error: null,
      });
    } catch (error) {
      return res.status(500).json({
        data: null,
        error: {
          message:
            error?.message ||
            "catalog_failed",
        },
      });
    }
  }
);

export default router;
