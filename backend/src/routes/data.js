import {enrichDealClients} from '../services/deal-clients.mjs';
import express from "express";
import crypto from "crypto";

import { db } from "../database.js";
import { userFromToken, tokenFrom } from "../lib/auth.js";
import { decodeRows } from "../lib/rows.js";
import { hydrateRows, getNestedValue } from "../lib/relations.js";
import { emitTableChange } from "../lib/realtime.js";
import {
  canInsertRow,
  canUpdateRow,
  canDeleteRow,
  filterReadableRows
} from "../lib/authorization.js";

const router =
  express.Router();

const PUBLIC_READ_TABLES = new Set([
  "meetings",
  "development_updates"
]);

const PUBLIC_WRITE_TABLES = new Set([]);

function validIdentifier(value) {
  return /^[A-Za-z_][A-Za-z0-9_]{0,63}$/
    .test(
      String(value || "")
    );
}

function quote(value) {

  if (
    !validIdentifier(value)
  ) {
    throw new Error(
      "invalid_identifier"
    );
  }

  return `\`${value}\``;
}

async function tableAllowed(
  table
) {

  if (
    !validIdentifier(table)
  ) {
    return false;
  }

  const [rows] =
    await db.execute(
      `
        SELECT 1
        FROM system_columns
        WHERE table_name = ?
        LIMIT 1
      `,
      [table]
    );

  return rows.length > 0;
}

async function schemaFor(
  table
) {

  const [rows] =
    await db.execute(
      `
        SELECT
          COLUMN_NAME AS name,
          DATA_TYPE AS type
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = ?
      `,
      [table]
    );

  return new Map(
    rows.map(
      row => [
        row.name,
        row.type
      ]
    )
  );
}

async function primaryKeyFor(table) {
  const [rows] = await db.execute(
    `SELECT COLUMN_NAME AS name
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND CONSTRAINT_NAME = 'PRIMARY'
     ORDER BY ORDINAL_POSITION`,
    [table]
  );

  return rows.map((row) => row.name);
}

async function auth(req) {
  return userFromToken(
    tokenFrom(req)
  );
}

function parsedData(value) {

  if (
    !value
  ) {
    return {};
  }

  if (
    typeof value === "object"
  ) {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function normalizeRow(row) {

  const legacy =
    parsedData(
      row.data
    );

  const native = {};

  for (
    const [key, value]
    of Object.entries(row)
  ) {

    if (
      key === "data"
    ) {
      continue;
    }

    if (
      value !== null
      && value !== undefined
    ) {
      native[key] =
        value;
    }
  }

  return {
    ...legacy,
    ...native
  };
}

/*
 * RANKING_DATE_COMPARISON_FIX
 *
 * O cliente compatível com Supabase envia
 * filtros de data como strings ISO.
 *
 * Antes, gt/gte/lt/lte convertiam tudo
 * diretamente com Number(), fazendo uma
 * data ISO virar NaN e eliminando todos
 * os registros do resultado.
 */
function orderedComparisonValue(
  value
) {

  if (
    value instanceof Date
  ) {

    const timestamp =
      value.getTime();

    return Number.isFinite(
      timestamp
    )
      ? timestamp
      : null;
  }


  if (
    typeof value === "number"
  ) {

    return Number.isFinite(
      value
    )
      ? value
      : null;
  }


  if (
    typeof value === "boolean"
  ) {
    return value
      ? 1
      : 0;
  }


  const text =
    String(
      value ?? ""
    ).trim();


  if (!text) {
    return null;
  }


  const numeric =
    Number(text);

  if (
    Number.isFinite(
      numeric
    )
  ) {
    return numeric;
  }


  /*
   * Aceita ISO:
   * 2026-09-30T17:54:00.000Z
   *
   * E formato MySQL:
   * 2026-09-30 17:54:00
   */
  if (
    /^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/
      .test(text)
  ) {

    const timestamp =
      Date.parse(text);

    if (
      !Number.isNaN(
        timestamp
      )
    ) {
      return timestamp;
    }
  }


  return null;
}


function compare(
  value,
  operator,
  expected
) {

  switch (operator) {

    case "eq":
      return value == expected;

    case "neq":
      return value != expected;

    case "gt": {

      const left =
        orderedComparisonValue(
          value
        );

      const right =
        orderedComparisonValue(
          expected
        );

      return (
        left !== null
        &&
        right !== null
        &&
        left > right
      );
    }


    case "gte": {

      const left =
        orderedComparisonValue(
          value
        );

      const right =
        orderedComparisonValue(
          expected
        );

      return (
        left !== null
        &&
        right !== null
        &&
        left >= right
      );
    }


    case "lt": {

      const left =
        orderedComparisonValue(
          value
        );

      const right =
        orderedComparisonValue(
          expected
        );

      return (
        left !== null
        &&
        right !== null
        &&
        left < right
      );
    }


    case "lte": {

      const left =
        orderedComparisonValue(
          value
        );

      const right =
        orderedComparisonValue(
          expected
        );

      return (
        left !== null
        &&
        right !== null
        &&
        left <= right
      );
    }

    case "is":

      if (
        expected === null
        || expected === "null"
      ) {
        return value == null;
      }

      if (
        expected === true
        || expected === "true"
      ) {
        return value === true
          || value === 1;
      }

      if (
        expected === false
        || expected === "false"
      ) {
        return value === false
          || value === 0;
      }

      return value == expected;

    case "in":

      return (
        Array.isArray(expected)
        && expected.some(
          item =>
            item == value
        )
      );

    case "like":
    case "ilike": {

      const source =
        String(expected ?? "")
          .replace(
            /[.+?^${}()|[\]\\]/g,
            "\\$&"
          )
          .replaceAll(
            "%",
            ".*"
          )
          .replaceAll(
            "_",
            "."
          );

      const regex =
        new RegExp(
          "^" +
          source +
          "$",
          operator === "ilike"
            ? "i"
            : undefined
        );

      return regex.test(
        String(value ?? "")
      );
    }

    case "contains":

      if (
        Array.isArray(value)
        && Array.isArray(expected)
      ) {
        return expected.every(
          wanted =>
            value.some(
              current =>
                current == wanted
            )
        );
      }

      if (
        value
        && expected
        && typeof value === "object"
        && typeof expected === "object"
      ) {
        return Object
          .entries(expected)
          .every(
            ([key, val]) =>
              value[key] == val
          );
      }

      return String(
        value ?? ""
      ).includes(
        String(
          expected ?? ""
        )
      );

    default:
      return true;
  }
}

function matchesFilters(
  record,
  filters
) {

  for (
    const filter
    of filters || []
  ) {

    if (
      filter.type === "match"
    ) {

      for (
        const [key, value]
        of Object.entries(
          filter.value || {}
        )
      ) {

        if (
          record[key] != value
        ) {
          return false;
        }
      }

      continue;
    }

    if (
      filter.type === "or"
    ) {

      const clauses =
        String(
          filter.expression || ""
        ).split(",");

      const ok =
        clauses.some(
          clause => {

            const parts =
              clause.split(".");

            if (
              parts.length < 3
            ) {
              return false;
            }

            const column =
              parts.shift();

            const operator =
              parts.shift();

            const value =
              parts.join(".");

            return compare(
              record[column],
              operator,
              value
            );
          }
        );

      if (!ok)
        return false;

      continue;
    }

    if (
      filter.type === "not"
    ) {

      if (
        compare(
          record[
            filter.column
          ],
          filter.operator,
          filter.value
        )
      ) {
        return false;
      }

      continue;
    }

    const currentValue =
      String(filter.column || "").includes(".")
        ? getNestedValue(record, filter.column)
        : record[filter.column];

    if (
      !compare(
        currentValue,
        filter.type,
        filter.value
      )
    ) {
      return false;
    }
  }

  return true;
}

function nativeValue(
  value,
  type
) {

  if (
    value === undefined
    || value === null
  ) {
    return null;
  }

  if (
    type === "json"
  ) {
    return JSON.stringify(
      value
    );
  }

  if (
    type === "tinyint"
  ) {
    return value
      ? 1
      : 0;
  }

  if (
    [
      "int",
      "bigint",
      "smallint",
      "double",
      "float",
      "decimal"
    ].includes(type)
  ) {

    const number =
      Number(value);

    return Number.isFinite(
      number
    )
      ? number
      : null;
  }

  if (
    [
      "timestamp",
      "datetime"
    ].includes(type)
    && typeof value === "string"
  ) {

    return value
      .replace("T", " ")
      .replace(
        /\.\d{3}Z$/,
        ""
      )
      .replace(
        /Z$/,
        ""
      );
  }

  if (
    typeof value === "object"
  ) {
    return JSON.stringify(
      value
    );
  }

  return String(value);
}

async function allRows(
  table
) {

  const [rows] =
    await db.query(
      `SELECT * FROM ${quote(table)}`
    );

  return decodeRows(
    table,
    rows
  );
}

router.post(
  "/query",
  async (req, res) => {

    try {

      const {
        table,
        operation = "select",
        payload = null,
        filters = [],
        columns = "*",
        orders = [],
        limit = null,
        range = null,
        single = null,
        head = false
      } = req.body || {};

      if (
        !await tableAllowed(
          table
        )
      ) {

        return res
          .status(400)
          .json({
            data: null,
            error: {
              message:
                "unknown_table"
            }
          });
      }

      const schema =
        await schemaFor(
          table
        );

      const loggedUser =
        await auth(req);

      if (
        operation === "select"
        && !loggedUser
        && !PUBLIC_READ_TABLES.has(table)
      ) {
        return res
          .status(401)
          .json({
            data: null,
            error: {
              message:
                "unauthorized"
            }
          });
      }

      if (
        [
          "insert",
          "update",
          "delete",
          "upsert"
        ].includes(
          operation
        )
        && !loggedUser
        && !PUBLIC_WRITE_TABLES.has(table)
      ) {

        return res
          .status(401)
          .json({
            data: null,
            error: {
              message:
                "unauthorized"
            }
          });
      }

      if (
        operation === "select"
      ) {

        let rows =
          await allRows(
            table
          );

        rows =
          await filterReadableRows(
            loggedUser,
            table,
            rows
          );

        if (
          columns
          && String(columns).includes("(")
        ) {
          rows =
            await hydrateRows(
              table,
              rows,
              columns
            );
        }

        if (table === 'crm_deals') rows = await enrichDealClients(db, rows);

        rows =
          rows.filter(
            row =>
              matchesFilters(
                row,
                filters
              )
          );

        for (
          const order
          of orders || []
        ) {

          rows.sort(
            (a, b) => {

              const av =
                a[
                  order.column
                ];

              const bv =
                b[
                  order.column
                ];

              if (av == bv)
                return 0;

              const direction =
                order.ascending ===
                false
                  ? -1
                  : 1;

              return av > bv
                ? direction
                : -direction;
            }
          );
        }

        const count =
          rows.length;

        if (
          Array.isArray(range)
          && range.length === 2
        ) {

          rows =
            rows.slice(
              Number(range[0]),
              Number(range[1]) +
                1
            );
        }

        if (
          limit !== null
          && limit !== undefined
        ) {

          rows =
            rows.slice(
              0,
              Number(limit)
            );
        }

        if (
          columns
          && columns !== "*"
          && !String(columns)
            .includes("(")
        ) {

          const wanted =
            String(columns)
              .split(",")
              .map(
                item =>
                  item
                    .trim()
                    .split(":")
                    .pop()
                    .trim()
              );

          rows =
            rows.map(
              row => {

                const output = {};

                for (
                  const column
                  of wanted
                ) {

                  if (
                    column in row
                  ) {
                    output[column] =
                      row[column];
                  }
                }

                return output;
              }
            );
        }

        if (head) {

          return res.json({
            data: null,
            error: null,
            count
          });
        }

        if (
          single === "single"
        ) {

          if (
            rows.length !== 1
          ) {

            return res
              .status(406)
              .json({
                data: null,
                error: {
                  message:
                    "single_row_expected"
                },
                count
              });
          }

          return res.json({
            data:
              rows[0],
            error: null,
            count
          });
        }

        if (
          single ===
          "maybeSingle"
        ) {

          return res.json({
            data:
              rows[0] || null,
            error: null,
            count
          });
        }

        return res.json({
          data: rows,
          error: null,
          count
        });
      }

      if (
        operation === "insert"
        || operation === "upsert"
      ) {

        const records =
          Array.isArray(
            payload
          )
            ? payload
            : [payload];

        const output = [];

        for (
          const original
          of records
        ) {

          const item = {
            ...(original || {})
          };

          if (
            schema.has("id")
            && !item.id
          ) {
            item.id =
              crypto.randomUUID();
          }

          if (
            !await canInsertRow(
              loggedUser,
              table,
              item
            )
          ) {
            return res
              .status(403)
              .json({
                data: null,
                error: {
                  message:
                    "forbidden"
                }
              });
          }

          const fields = [];
          const placeholders = [];
          const values = [];

          for (
            const [key, value]
            of Object.entries(item)
          ) {

            if (
              key === "data"
              || !schema.has(key)
            ) {
              continue;
            }

            fields.push(
              quote(key)
            );

            placeholders.push(
              "?"
            );

            values.push(
              nativeValue(
                value,
                schema.get(key)
              )
            );
          }

          /*
           * Mantemos JSON sincronizado enquanto
           * retiramos a antiga camada genérica.
           */
          if (
            schema.has("data")
          ) {

            fields.push(
              "`data`"
            );

            placeholders.push(
              "?"
            );

            values.push(
              JSON.stringify(item)
            );
          }

          if (!fields.length) {

            return res
              .status(400)
              .json({
                data: null,
                error: {
                  message:
                    "no_valid_columns"
                }
              });
          }

          if (
            operation ===
            "upsert"
          ) {

            const updates =
              fields
                .filter(
                  field =>
                    field !== "`id`"
                )
                .map(
                  field =>
                    `${field}=VALUES(${field})`
                );

            await db.execute(
              `
                INSERT INTO ${quote(table)}
                  (${fields.join(",")})
                VALUES
                  (${placeholders.join(",")})

                ON DUPLICATE KEY UPDATE
                  ${updates.join(",")}
              `,
              values
            );

          } else {

            await db.execute(
              `
                INSERT INTO ${quote(table)}
                  (${fields.join(",")})
                VALUES
                  (${placeholders.join(",")})
              `,
              values
            );
          }

          emitTableChange(
            table,
            operation === "insert"
              ? "INSERT"
              : "UPDATE",
            item,
            null
          );

          output.push(item);
        }

        return res
          .status(
            operation === "insert"
              ? 201
              : 200
          )
          .json({
            data:
              Array.isArray(payload)
                ? output
                : output[0],
            error: null,
            count:
              output.length
          });
      }

      if (
        operation === "update"
      ) {

        let records =
          await allRows(
            table
          );

        records =
          records.filter(
            row =>
              matchesFilters(
                row,
                filters
              )
          );

        const output = [];
        const primaryKeys =
          await primaryKeyFor(table);

        if (!primaryKeys.length) {
          return res.status(400).json({
            data: null,
            error: { message: "table_without_primary_key" }
          });
        }

        for (
          const current
          of records
        ) {

          if (
            primaryKeys.some(
              key => current[key] === undefined
            )
          ) {
            continue;
          }

          const next = {
            ...current,
            ...(payload || {})
          };

          if (
            !await canUpdateRow(
              loggedUser,
              table,
              current,
              payload || {}
            )
          ) {
            continue;
          }

          const sets = [];
          const values = [];

          for (
            const [key, value]
            of Object.entries(
              payload || {}
            )
          ) {

            if (
              primaryKeys.includes(key)
              || key === "data"
              || !schema.has(key)
            ) {
              continue;
            }

            sets.push(
              `${quote(key)} = ?`
            );

            values.push(
              nativeValue(
                value,
                schema.get(key)
              )
            );
          }

          if (
            schema.has("data")
          ) {
            sets.push(
              "`data` = ?"
            );

            values.push(
              JSON.stringify(next)
            );
          }

          if (
            schema.has(
              "updated_at"
            )
          ) {
            sets.push(
              "`updated_at` = CURRENT_TIMESTAMP"
            );
          }

          if (sets.length) {

            const where =
              primaryKeys
                .map(key => `${quote(key)} <=> ?`)
                .join(" AND ");

            for (const key of primaryKeys) {
              values.push(current[key]);
            }

            await db.execute(
              `
                UPDATE ${quote(table)}
                SET ${sets.join(", ")}
                WHERE ${where}
              `,
              values
            );

            emitTableChange(
              table,
              "UPDATE",
              next,
              current
            );
          }

          output.push(next);
        }

        return res.json({
          data: output,
          error: null,
          count:
            output.length
        });
      }

      if (
        operation === "delete"
      ) {

        let records =
          await allRows(
            table
          );

        records =
          records.filter(
            row =>
              matchesFilters(
                row,
                filters
              )
          );

        const primaryKeys =
          await primaryKeyFor(table);

        if (!primaryKeys.length) {
          return res.status(400).json({
            data: null,
            error: { message: "table_without_primary_key" }
          });
        }

        for (
          const record
          of records
        ) {

          if (
            primaryKeys.some(
              key => record[key] === undefined
            )
          ) {
            continue;
          }

          if (
            !await canDeleteRow(
              loggedUser,
              table,
              record
            )
          ) {
            continue;
          }

          const where =
            primaryKeys
              .map(key => `${quote(key)} <=> ?`)
              .join(" AND ");

          await db.execute(
            `
              DELETE
              FROM ${quote(table)}
              WHERE ${where}
            `,
            primaryKeys.map(
              key => record[key]
            )
          );

          emitTableChange(
            table,
            "DELETE",
            null,
            record
          );
        }

        return res.json({
          data: records,
          error: null,
          count:
            records.length
        });
      }

      return res
        .status(400)
        .json({
          data: null,
          error: {
            message:
              "unsupported_operation"
          }
        });

    } catch (error) {

      console.error(
        "DATA API:",
        error
      );

      return res
        .status(500)
        .json({
          data: null,
          error: {
            message:
              error?.message ||
              "internal_error"
          }
        });
    }
  }
);

export default router;
