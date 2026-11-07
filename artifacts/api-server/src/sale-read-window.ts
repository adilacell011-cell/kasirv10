export type SaleReadShiftWindow = {
  status: string;
  openTime: Date | string;
  closeTime: Date | string | null;
};

export type PosSaleReadWindowInput = {
  shift?: SaleReadShiftWindow | null;
  fallbackStart?: Date | string | null;
  serverNow: Date | string;
};

export type PosSaleReadWindow = {
  start: Date;
  end: Date;
};

function toValidDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/**
 * Resolve POS read bounds using persisted shift timestamps and server time.
 * Client dates are only a fallback for the no-open-shift "today" view.
 */
export function resolvePosSaleReadWindow(
  input: PosSaleReadWindowInput,
): PosSaleReadWindow | null {
  const serverNow = toValidDate(input.serverNow);
  if (!serverNow) return null;

  let start: Date | null;
  let end: Date | null;

  if (input.shift) {
    start = toValidDate(input.shift.openTime);
    if (input.shift.status === "open") {
      end = serverNow;
    } else if (input.shift.status === "closed") {
      end = toValidDate(input.shift.closeTime);
    } else {
      return null;
    }
  } else {
    start = toValidDate(input.fallbackStart);
    end = serverNow;
  }

  if (!start || !end || end.getTime() < start.getTime()) return null;
  return { start, end };
}
