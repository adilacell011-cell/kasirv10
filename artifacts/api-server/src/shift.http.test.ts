import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { validateDatabaseTarget } from "./database-target";
import { getLogicalShiftDate } from "./business-date";

type QaRow = {
  id: string; status: string; totalSales: number; total: number;
  stocks: Record<string, number>; saleId: string;
};

// Opt-in only. Writes NEW retained QA fixtures, never deletes or modifies existing fixtures.
// No migration, seed, maintenance or arbitrary remote target.
test("shift/refund regression on isolated development PostgreSQL over HTTP", {
  skip: process.env.RUN_SHIFT_HTTP_TESTS !== "1",
}, async (t) => {
  const target = validateDatabaseTarget(process.env);
  assert.equal(target.environment, "development");
  const base = "http://localhost:80/api";
  const login = await fetch(`${base}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  });
  assert.equal(login.status, 200);
  const owner = (await login.json() as { token: string }).token;
  const tag = `QA-SHIFT-${Date.now()}-${randomUUID().slice(0, 6)}`;
  async function request(path: string, token: string, method = "GET", body?: unknown) {
    return fetch(`${base}${path}`, {
      method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  async function ok<T = QaRow>(path: string, token: string, method = "GET", body?: unknown): Promise<T> {
    const r = await request(path, token, method, body);
    assert.equal(r.status, 200, `${method} ${path}: expected success`);
    return await r.json() as T;
  }
  async function fixture(suffix: string) {
    const branch = await ok("/branches", owner, "POST", { name: `${tag}-${suffix}` });
    const username = `${tag}-${suffix}`.toLowerCase();
    const password = randomUUID();
    const user = await ok("/auth/register", owner, "POST", {
      username, password, name: "QA Pagi", alternativeNames: "QA Malam",
      branchId: branch.id, role: "CASHIER",
    });
    const r = await fetch(`${base}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    assert.equal(r.status, 200);
    return { branchId: branch.id, userId: user.id, token: (await r.json() as { token: string }).token };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const open = (f: Fixture, name = "QA Pagi") => ({
    branchId: f.branchId, cashierId: f.userId, initialCash: 0,
    shiftDate: getLogicalShiftDate(), shiftType: `Pagi - ${name}`,
  });
  const close = (f: Fixture, id: string, cash = 0) =>
    ok(`/shifts/${id}`, f.token, "PATCH", { status: "closed", actualCash: cash });
  async function product(f: Fixture) {
    const p = await ok("/products", owner, "POST", {
      name: `${tag}-product-${randomUUID().slice(0, 6)}`, buyingPrice: 10000,
      sellingPrice: 15000, commissionAmount: 1000, category: "QA", status: "ACTIVE",
    });
    await ok("/stocks/adjust", owner, "POST", {
      branchId: f.branchId, productId: p.id, qty: 10, type: "STOCK_IN", reason: tag,
    });
    return p.id as string;
  }
  const sale = (f: Fixture, productId: string) => ok("/transactions", f.token, "POST", {
    branchId: f.branchId, cashierId: f.userId, total: 15000, totalCommission: 1000,
    items: [{ productId, qty: 1, price: 15000, subtotal: 15000, commission: 1000 }],
  });

  await t.test("concurrent opening of same request returns one persisted shift", async () => {
    const f = await fixture("open");
    const responses = await Promise.all([1, 2].map(() => ok("/shifts", f.token, "POST", open(f))));
    assert.equal(responses[0].id, responses[1].id);
    const rows = await ok<QaRow[]>("/shifts", f.token);
    assert.equal(rows.filter((s: { status: string }) => s.status === "open").length, 1);
  });
  await t.test("new keeper cannot open while previous shift remains active; other branch isolated", async () => {
    const a = await fixture("branch-a");
    const b = await fixture("branch-b");
    const first = await ok("/shifts", a.token, "POST", open(a));
    assert.equal((await request("/shifts", a.token, "POST", open(a, "QA Malam"))).status, 409);
    assert.equal((await request(`/shifts/${first.id}`, b.token, "PATCH", { status: "closed", actualCash: 0 })).status, 403);
    await ok("/shifts", b.token, "POST", open(b));
    await close(a, first.id);
    const next = await ok("/shifts", a.token, "POST", open(a, "QA Malam"));
    assert.notEqual(next.id, first.id);
  });
  await t.test("cashier sale requires an open persisted shift and cannot pass after close", async () => {
    const f = await fixture("sale-shift-guard");
    const productId = await product(f);
    const salePayload = {
      branchId: f.branchId,
      cashierId: f.userId,
      total: 15000,
      totalCommission: 1000,
      items: [{ productId, qty: 1, price: 15000, subtotal: 15000, commission: 1000 }],
    };

    const beforeOpen = await request("/transactions", f.token, "POST", salePayload);
    assert.equal(beforeOpen.status, 409);
    assert.match((await beforeOpen.json() as { error: string }).error, /shift/i);
    assert.equal((await ok<QaRow[]>("/transactions", f.token)).length, 0);
    assert.equal((await ok<QaRow[]>("/products", f.token)).find((row) => row.id === productId)?.stocks[f.branchId], 10);
    assert.equal((await ok<Array<{ saleId: string }>>("/incentives", f.token)).length, 0);

    const shift = await ok("/shifts", f.token, "POST", open(f));
    const saleResponse = await request("/transactions", f.token, "POST", salePayload);
    assert.equal(saleResponse.status, 200);
    const savedSale = await saleResponse.json() as { id: string };
    await close(f, shift.id, 15000);

    const afterClose = await request("/transactions", f.token, "POST", salePayload);
    assert.equal(afterClose.status, 409);
    assert.match((await afterClose.json() as { error: string }).error, /shift/i);
    assert.equal((await ok<QaRow[]>("/transactions", f.token)).filter((row) => row.id === savedSale.id).length, 1);
    assert.equal((await ok<QaRow[]>("/products", f.token)).find((row) => row.id === productId)?.stocks[f.branchId], 9);
    const commissions = await ok<Array<{ saleId: string; status: string }>>("/incentives", f.token);
    assert.deepEqual(commissions.filter((commission) => commission.saleId === savedSale.id).map((commission) => commission.status), ["earned"]);
  });
  await t.test("cashier stock transfer requires an active shift and changes neither branch when locked", async () => {
    const f = await fixture("transfer-shift-guard");
    const target = await ok("/branches", owner, "POST", { name: `${tag}-transfer-target` });
    const productId = await product(f);
    const transfer = {
      productId, qty: 1, sourceBranchId: f.branchId, targetBranchId: target.id,
    };
    const allProducts = () => ok<Array<{ id: string; stocks: Record<string, number> }>>("/products", owner);
    const getStocks = async () => {
      const row = (await allProducts()).find((item) => item.id === productId);
      return {
        source: row?.stocks?.[f.branchId] ?? 0,
        target: row?.stocks?.[target.id] ?? 0,
      };
    };

    assert.equal((await request("/stocks/transfer", f.token, "POST", transfer)).status, 409);
    assert.deepEqual(await getStocks(), { source: 10, target: 0 });

    const shift = await ok("/shifts", f.token, "POST", open(f));
    assert.equal((await request("/stocks/transfer", f.token, "POST", transfer)).status, 200);
    assert.deepEqual(await getStocks(), { source: 9, target: 1 });

    await close(f, shift.id);
    assert.equal((await request("/stocks/transfer", f.token, "POST", transfer)).status, 409);
    assert.deepEqual(await getStocks(), { source: 9, target: 1 });
  });
  await t.test("cashier stock intake requires an active shift and does not write when locked", async () => {
    const f = await fixture("stock-intake-shift-guard");
    const productId = await product(f);
    const reason = `${tag}-cashier-stock-intake`;
    const payload = {
      productId, branchId: f.branchId, qty: 2, type: "STOCK_IN", reason,
    };
    const getStock = async () =>
      (await ok<QaRow[]>("/products", f.token)).find((row) => row.id === productId)?.stocks[f.branchId];
    const getIntakeLogs = async () =>
      (await ok<Array<{ productId: string; reason: string }>>("/adjustments", f.token))
        .filter((row) => row.productId === productId && row.reason === reason).length;

    assert.equal((await request("/stocks/adjust", f.token, "POST", payload)).status, 409);
    assert.equal(await getStock(), 10);
    assert.equal(await getIntakeLogs(), 0);

    const shift = await ok("/shifts", f.token, "POST", open(f));
    assert.equal((await request("/stocks/adjust", f.token, "POST", payload)).status, 200);
    assert.equal(await getStock(), 12);
    assert.equal(await getIntakeLogs(), 1);

    await close(f, shift.id);
    assert.equal((await request("/stocks/adjust", f.token, "POST", payload)).status, 409);
    assert.equal(await getStock(), 12);
    assert.equal(await getIntakeLogs(), 1);
  });
  await t.test("cashier refund is limited to a sale from the currently open shift", async () => {
    const f = await fixture("refund-shift-guard");
    const productId = await product(f);
    const firstShift = await ok("/shifts", f.token, "POST", open(f));
    const savedSale = await sale(f, productId);
    await close(f, firstShift.id, 15000);

    assert.equal((await request(`/transactions/${savedSale.id}/refund`, f.token, "POST")).status, 409);
    const nextShift = await ok("/shifts", f.token, "POST", open(f, "QA Malam"));
    assert.equal((await request(`/transactions/${savedSale.id}/refund`, f.token, "POST")).status, 409);
    assert.equal((await ok<QaRow[]>("/transactions", f.token)).find((row) => row.id === savedSale.id)?.status, "success");
    assert.equal((await ok<QaRow[]>("/products", f.token)).find((row) => row.id === productId)?.stocks[f.branchId], 9);
    assert.equal((await ok<Array<{ saleId: string; status: string }>>("/incentives", f.token))
      .find((row) => row.saleId === savedSale.id)?.status, "earned");
    await close(f, nextShift.id);
  });
  await t.test("owner cannot refund; cashier refund access and data remain intact", async () => {
    const f = await fixture("refund-owner-denied");
    const productId = await product(f);
    const shift = await ok("/shifts", f.token, "POST", open(f));
    const savedSale = await sale(f, productId);

    assert.equal((await request(`/transactions/${savedSale.id}/refund`, owner, "POST")).status, 403);
    assert.equal((await ok<QaRow[]>("/transactions", f.token))
      .find((row) => row.id === savedSale.id)?.status, "success");
    assert.equal((await ok<QaRow[]>("/products", f.token))
      .find((row) => row.id === productId)?.stocks[f.branchId], 9);
    assert.equal((await ok<Array<{ saleId: string; status: string }>>("/incentives", f.token))
      .find((row) => row.saleId === savedSale.id)?.status, "earned");

    assert.equal((await request(`/transactions/${savedSale.id}/refund`, f.token, "POST")).status, 200);
    assert.equal((await ok<QaRow[]>("/products", f.token))
      .find((row) => row.id === productId)?.stocks[f.branchId], 10);
    assert.equal((await ok<Array<{ saleId: string; status: string }>>("/incentives", f.token))
      .find((row) => row.saleId === savedSale.id)?.status, "refunded");
    assert.equal((await ok<QaRow[]>("/transactions", f.token))
      .find((row) => row.id === savedSale.id)?.status, "refunded");
    const closed = await close(f, shift.id);
    assert.equal(Number(closed.totalSales), 0);
    const summary = (await ok<Array<{
      branchId: string; revenue: number; profit: number; totalCommission: number; count: number;
    }>>("/daily-summaries", f.token)).find((row) => row.branchId === f.branchId);
    assert.ok(summary);
    assert.deepEqual({
      revenue: Number(summary.revenue),
      profit: Number(summary.profit),
      commission: Number(summary.totalCommission),
      count: Number(summary.count),
    }, { revenue: 0, profit: 0, commission: 0, count: 0 });
    assert.equal((await ok<{ total: number }>("/incentives/summary", f.token)).total, 0);
  });
  await t.test("repeated close never includes sales from next shift or replaces snapshot", async () => {
    const f = await fixture("snapshot");
    const p = await product(f);
    const first = await ok("/shifts", f.token, "POST", open(f));
    await sale(f, p);
    const closed = await close(f, first.id, 15000);
    assert.equal(closed.totalSales, 15000);
    await ok("/shifts", f.token, "POST", open(f, "QA Malam"));
    await sale(f, p);
    assert.deepEqual(await close(f, first.id, 99999), closed);
  });
  await t.test("parallel close requests return identical snapshot", async () => {
    const f = await fixture("close-parallel");
    const s = await ok("/shifts", f.token, "POST", open(f));
    const rows = await Promise.all([1, 2].map(() => close(f, s.id, 0)));
    assert.deepEqual(rows[0], rows[1]);
  });
  await t.test("parallel refund/retry restore stock and commission only once", async () => {
    const f = await fixture("refund");
    const p = await product(f);
    await ok("/shifts", f.token, "POST", open(f));
    const s = await sale(f, p);
    const refunds = await Promise.all([1, 2].map(() => request(`/transactions/${s.id}/refund`, f.token, "POST")));
    assert.deepEqual(refunds.map(r => r.status).sort(), [200, 409]);
    assert.equal((await request(`/transactions/${s.id}/refund`, f.token, "POST")).status, 409);
    const products = await ok<QaRow[]>("/products", f.token);
    assert.equal(products.find((r) => r.id === p)?.stocks[f.branchId], 10);
    assert.equal((await ok("/incentives/summary", f.token)).total, 0);
    const commissions = await ok<QaRow[]>("/incentives", f.token);
    assert.equal(commissions.filter((r: { saleId: string }) => r.saleId === s.id).length, 1);
    assert.equal(commissions.find((r) => r.saleId === s.id)?.status, "refunded");
  });
  await t.test("withdrawn commission remains withdrawn after refund", async () => {
    const f = await fixture("withdrawn");
    const p = await product(f);
    await ok("/shifts", f.token, "POST", open(f));
    const s = await sale(f, p);
    await ok("/incentives/withdraw", owner, "POST", { branchId: f.branchId });
    await ok(`/transactions/${s.id}/refund`, f.token, "POST");
    const rows = await ok<QaRow[]>("/incentives", f.token);
    assert.equal(rows.find((r) => r.saleId === s.id)?.status, "withdrawn");
    assert.equal((await ok("/incentives/summary", f.token)).total, 0);
  });
  console.info("QA fixtures retained under marker:", tag);
});
