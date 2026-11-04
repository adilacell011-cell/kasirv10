export type CatalogPricing = {
  sellingPrice: number | string;
  discountPrice?: number | string | null;
  buyingPrice?: number | string | null;
  commissionAmount?: number | string | null;
  masterSN?: string | null;
};

export type SaleLineInput = {
  productId: string;
  qty: number;
  price?: unknown;
  subtotal?: unknown;
  commission?: unknown;
  sn?: string | null;
};

export type TrustedSaleLine = {
  productId: string;
  qty: number;
  price: number;
  subtotal: number;
  commission: number;
  costPrice: number;
  profit: number;
  sn: string | null;
};

export class SaleAmountMismatch extends Error {
  constructor(readonly field: string) {
    super(`Nilai ${field} tidak sesuai dengan harga produk saat ini.`);
    this.name = "SaleAmountMismatch";
  }
}

function catalogNumber(value: number | string | null | undefined, field: string): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Nilai katalog ${field} tidak valid.`);
  }
  return parsed;
}

function assertProvidedAmount(field: string, provided: unknown, expected: number): void {
  if (provided === undefined || provided === null || provided === "") return;
  const parsed = typeof provided === "number" || typeof provided === "string"
    ? Number(provided)
    : Number.NaN;
  if (!Number.isFinite(parsed) || Math.abs(parsed - expected) > 1e-9) {
    throw new SaleAmountMismatch(field);
  }
}

/**
 * Reproduces the existing POS formula using values read from the database:
 * discount price when positive, otherwise selling price; commission is the
 * product commission amount multiplied by quantity; profit subtracts cost and
 * commission from the sale subtotal.
 */
export function deriveTrustedSaleLine(input: SaleLineInput, product: CatalogPricing): TrustedSaleLine {
  const sellingPrice = catalogNumber(product.sellingPrice, "sellingPrice");
  const discountPrice = catalogNumber(product.discountPrice, "discountPrice");
  const price = discountPrice > 0 ? discountPrice : sellingPrice;
  const costPrice = catalogNumber(product.buyingPrice, "buyingPrice");
  const commissionRate = catalogNumber(product.commissionAmount, "commissionAmount");
  const subtotal = price * input.qty;
  const commission = commissionRate * input.qty;
  const profit = subtotal - (costPrice * input.qty) - commission;

  assertProvidedAmount("price", input.price, price);
  assertProvidedAmount("subtotal", input.subtotal, subtotal);
  assertProvidedAmount("commission", input.commission, commission);

  return {
    productId: input.productId,
    qty: input.qty,
    price,
    subtotal,
    commission,
    costPrice,
    profit,
    sn: input.sn || product.masterSN || null,
  };
}

export function assertSaleTotalsMatch(
  providedTotal: unknown,
  providedCommission: unknown,
  total: number,
  commission: number,
): void {
  assertProvidedAmount("total", providedTotal, total);
  assertProvidedAmount("totalCommission", providedCommission, commission);
}

type DataRecord = Record<string, unknown>;

function isDataRecord(value: unknown): value is DataRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function redactProductCost<T extends DataRecord>(product: T): DataRecord {
  const safeProduct = { ...product };
  delete safeProduct.buyingPrice;
  delete safeProduct.purchasePrice;
  delete safeProduct.costPrice;
  return safeProduct;
}

export function redactSaleCosts<T extends DataRecord>(sale: T, role: string): T | DataRecord {
  const safeSale: DataRecord = { ...sale };
  delete safeSale.idempotencyKeyHash;
  delete safeSale.idempotencyPayloadHash;
  if (role !== "CASHIER") return safeSale;
  if (Array.isArray(sale.items)) {
    safeSale.items = sale.items.map((value) => {
      if (!isDataRecord(value)) return value;
      const safeItem = { ...value };
      delete safeItem.costPrice;
      if (isDataRecord(value.product)) safeItem.product = redactProductCost(value.product);
      return safeItem;
    });
  }
  return safeSale;
}

export function redactCommissionProductCosts<T extends DataRecord>(
  commission: T,
  role: string,
): T | DataRecord {
  const safeCommission: DataRecord = { ...commission };
  if (isDataRecord(commission.sale)) {
    safeCommission.sale = redactSaleCosts(commission.sale, role);
  }
  if (role === "CASHIER" && isDataRecord(commission.product)) {
    safeCommission.product = redactProductCost(commission.product);
  }
  return safeCommission;
}

export function productUpdatedPayload(product: { id: string }): { id: string } {
  return { id: product.id };
}
