import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSaleTotalsMatch,
  deriveTrustedSaleLine,
  productUpdatedPayload,
  redactCommissionProductCosts,
  redactSaleCosts,
} from "./sale-security";

test("sale values use the stored discount, cost, and commission formula", () => {
  const line = deriveTrustedSaleLine(
    { productId: "p1", qty: 2, price: 90, subtotal: 180, commission: 10 },
    { sellingPrice: 100, discountPrice: 90, buyingPrice: 60, commissionAmount: 5 },
  );
  assert.deepEqual(line, {
    productId: "p1",
    qty: 2,
    price: 90,
    subtotal: 180,
    commission: 10,
    costPrice: 60,
    profit: 50,
    sn: null,
  });
  assertSaleTotalsMatch(180, 10, line.subtotal, line.commission);
});

test("sale values reject client-supplied price, subtotal, commission, or totals that differ", () => {
  const product = { sellingPrice: 100, discountPrice: 0, buyingPrice: 60, commissionAmount: 5 };
  assert.throws(
    () => deriveTrustedSaleLine({ productId: "p1", qty: 1, price: 1 }, product),
    /price/,
  );
  assert.throws(
    () => deriveTrustedSaleLine({ productId: "p1", qty: 1, price: 100, subtotal: 1 }, product),
    /subtotal/,
  );
  assert.throws(
    () => deriveTrustedSaleLine({ productId: "p1", qty: 1, price: 100, commission: 0 }, product),
    /commission/,
  );
  assert.throws(() => assertSaleTotalsMatch(1, 5, 100, 5), /total/);
  assert.throws(() => assertSaleTotalsMatch(100, 0, 100, 5), /totalCommission/);
});

test("cashier sale responses omit cost fields but preserve response structure", () => {
  const sale = {
    id: "sale1",
    items: [{ id: "item1", costPrice: 60, price: 100, product: { id: "p1", buyingPrice: 60, name: "Item" } }],
  };
  const safe = redactSaleCosts(sale, "CASHIER") as typeof sale;
  assert.equal(safe.items[0].costPrice, undefined);
  assert.equal(safe.items[0].product.buyingPrice, undefined);
  assert.equal(safe.items[0].product.name, "Item");
  assert.equal((redactSaleCosts(sale, "ADMIN") as typeof sale).items[0].costPrice, 60);
});

test("cashier commission responses omit product cost fields", () => {
  const commission = {
    amount: 5,
    product: { id: "p1", buyingPrice: 60, name: "Item" },
    sale: { id: "sale-1", idempotencyKeyHash: "private", idempotencyPayloadHash: "private" },
  };
  const safe = redactCommissionProductCosts(commission, "CASHIER") as typeof commission;
  assert.equal(safe.product.buyingPrice, undefined);
  assert.equal(safe.product.name, "Item");
  assert.equal(safe.sale.idempotencyKeyHash, undefined);
  const adminSafe = redactCommissionProductCosts(commission, "ADMIN") as typeof commission;
  assert.equal(adminSafe.product.buyingPrice, 60);
  assert.equal(adminSafe.sale.idempotencyKeyHash, undefined);
});

test("sale response redaction removes internal idempotency hashes for every role", () => {
  const result = redactSaleCosts({
    id: "sale-1",
    idempotencyKeyHash: "private",
    idempotencyPayloadHash: "private",
    total: 15,
  }, "ADMIN") as Record<string, unknown>;
  assert.deepEqual(result, { id: "sale-1", total: 15 });
});

test("product update socket payload contains only the product id", () => {
  assert.deepEqual(
    productUpdatedPayload({ id: "p1" }),
    { id: "p1" },
  );
});
