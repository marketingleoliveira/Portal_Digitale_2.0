export function normalizeCrmRow(row) {
  if (!row) return row;

  let legacy = {};

  if (row.data && typeof row.data === "object") {
    legacy = row.data;
  } else if (typeof row.data === "string") {
    try {
      const parsed = JSON.parse(row.data);
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        legacy = parsed;
      }
    } catch {
      legacy = {};
    }
  }

  const native = {};

  for (const [key, value] of Object.entries(row)) {
    if (key === "data") continue;

    if (value !== null && value !== undefined) {
      native[key] = value;
    }
  }

  return {
    ...legacy,
    ...native
  };
}
