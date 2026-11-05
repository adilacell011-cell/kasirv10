export type ShiftReadRange =
  | { ok: true; where: Record<string, unknown> }
  | { ok: false };

function isLogicalDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Shift reports already filter by YYYY-MM-DD shiftDate in the UI.
 * Push the same optional bounds into PostgreSQL before rows reach Node.
 */
export function parseShiftReadRange(fromValue: unknown, toValue: unknown): ShiftReadRange {
  if (fromValue === undefined && toValue === undefined) return { ok: true, where: {} };
  if (fromValue !== undefined && !isLogicalDate(fromValue)) return { ok: false };
  if (toValue !== undefined && !isLogicalDate(toValue)) return { ok: false };
  if (typeof fromValue === "string" && typeof toValue === "string" && fromValue > toValue) {
    return { ok: false };
  }

  return {
    ok: true,
    where: {
      shiftDate: {
        ...(typeof fromValue === "string" ? { gte: fromValue } : {}),
        ...(typeof toValue === "string" ? { lte: toValue } : {}),
      },
    },
  };
}
