export const SALE_READ_PAGE_SIZE = 100;

export type SaleCursor = {
  id: string;
  createdAt: Date;
};

export type SalePageInput =
  | { ok: true; limit: number; cursor?: SaleCursor }
  | { ok: false; error: string };

export const SALE_READ_SELECT = {
  id: true,
  branchId: true,
  cashierId: true,
  customerName: true,
  total: true,
  totalCommission: true,
  totalProfit: true,
  status: true,
  createdAt: true,
  cashier: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  items: {
    select: {
      id: true,
      saleId: true,
      productId: true,
      qty: true,
      price: true,
      costPrice: true,
      subtotal: true,
      sn: true,
      product: { select: { id: true, name: true, buyingPrice: true } },
    },
  },
} as const;

type CursorWhere = {
  OR: [
    { createdAt: { lt: Date } },
    { createdAt: Date; id: { lt: string } },
  ];
};

export function parseSalePageInput(limitValue: unknown, cursorValue: unknown): SalePageInput {
  let limit = SALE_READ_PAGE_SIZE;
  if (limitValue !== undefined) {
    if (typeof limitValue !== "string" || !/^\d+$/.test(limitValue)) {
      return { ok: false, error: "limit harus berupa bilangan bulat positif." };
    }
    limit = Number(limitValue);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > SALE_READ_PAGE_SIZE) {
      return { ok: false, error: `limit harus antara 1 dan ${SALE_READ_PAGE_SIZE}.` };
    }
  }

  if (cursorValue === undefined) return { ok: true, limit };
  if (typeof cursorValue !== "string" || cursorValue.length > 512) {
    return { ok: false, error: "Cursor transaksi tidak valid." };
  }

  try {
    const decoded = JSON.parse(Buffer.from(cursorValue, "base64url").toString("utf8")) as {
      id?: unknown;
      createdAt?: unknown;
    };
    if (typeof decoded.id !== "string" || decoded.id.length === 0 || decoded.id.length > 128 ||
        typeof decoded.createdAt !== "string") {
      return { ok: false, error: "Cursor transaksi tidak valid." };
    }
    const createdAt = new Date(decoded.createdAt);
    if (!Number.isFinite(createdAt.getTime())) return { ok: false, error: "Cursor transaksi tidak valid." };
    return { ok: true, limit, cursor: { id: decoded.id, createdAt } };
  } catch {
    return { ok: false, error: "Cursor transaksi tidak valid." };
  }
}

export function buildSalePageWhere(
  baseWhere: Record<string, unknown>,
  cursor?: SaleCursor,
): Record<string, unknown> {
  if (!cursor) return baseWhere;
  const cursorWhere: CursorWhere = {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
  return Object.keys(baseWhere).length
    ? { AND: [baseWhere, cursorWhere] }
    : cursorWhere;
}

export function buildSaleReadQuery(
  baseWhere: Record<string, unknown>,
  input: Extract<SalePageInput, { ok: true }>,
) {
  return {
    where: buildSalePageWhere(baseWhere, input.cursor),
    select: SALE_READ_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
  };
}

export function finishSalePage<T extends { id: string; createdAt: Date | string }>(
  rows: T[],
  limit: number,
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last
      ? Buffer.from(JSON.stringify({
          id: last.id,
          createdAt: new Date(last.createdAt).toISOString(),
        })).toString("base64url")
      : null,
  };
}
