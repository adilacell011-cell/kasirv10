export const SHOPPING_PLAN_PAGE_SIZE = 20;
const MAX_CURSOR_LENGTH = 512;

export type ShoppingPlanPageCursor = {
  id: string;
  createdAt: Date;
};

export function encodeShoppingPlanCursor(value: ShoppingPlanPageCursor): string {
  return Buffer.from(JSON.stringify({
    id: value.id,
    createdAt: value.createdAt.toISOString(),
  })).toString("base64url");
}

export function decodeShoppingPlanCursor(value: unknown): ShoppingPlanPageCursor | null {
  if (value === undefined) return null;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_CURSOR_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new Error("Invalid shopping plan cursor.");
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid cursor payload.");
    }

    const record = parsed as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      record.id.length === 0 ||
      record.id.length > 200 ||
      typeof record.createdAt !== "string"
    ) {
      throw new Error("Invalid cursor fields.");
    }

    const createdAt = new Date(record.createdAt);
    if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== record.createdAt) {
      throw new Error("Invalid cursor date.");
    }

    return { id: record.id, createdAt };
  } catch {
    throw new Error("Invalid shopping plan cursor.");
  }
}
