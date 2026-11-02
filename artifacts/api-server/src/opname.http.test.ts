import assert from "node:assert/strict";
import test from "node:test";

// Explicit opt-in: mutates retained QA data on the local development API only.
// No cleanup/delete, direct SQL, schema change, or remote URL is supported.
test("development HTTP opname isolation, validation, stale snapshots and concurrent saves", {
  skip: process.env.RUN_OPNAME_HTTP_TESTS !== "1",
}, async () => {
  const base = "http://localhost:80/api";
  const login = await fetch(`${base}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  });
  assert.equal(login.status, 200);
  const { token } = await login.json() as any;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const productId = "ccdef441-cd3d-4f18-b9fd-864f881ac402";
  const a = "541464ae-2c72-484c-9e39-ae844b59813d";
  const b = "abc07d1b-642c-41a2-93c0-05383d4a4b92";
  const read = async () => {
    const response = await fetch(`${base}/products`, { headers });
    assert.equal(response.status, 200);
    const products = await response.json() as any[];
    const product = products.find(p => p.id === productId);
    assert.ok(product?.name?.includes("QA-MULTI-C9F8BD2"));
    return product.stocks as Record<string, number>;
  };
  const branchResponse = await fetch(`${base}/branches`, { headers });
  const branches = await branchResponse.json() as any[];
  for (const id of [a, b]) assert.ok(branches.find(r => r.id === id)?.name?.includes("qa-multi-c9f8bd2"));
  const reason = `QA opname regression ${Date.now()}`;
  const save = (branchId: string, oldQty: unknown, newQty: unknown) => fetch(`${base}/stocks/adjust`, {
    method: "POST", headers,
    body: JSON.stringify({ productId, branchId, oldQty, newQty, reason, type: "STOCK_IN" }),
  });
  const initial = await read();
  console.log("Initial QA stock", initial);
  assert.equal((await save(a, initial[a], initial[a]! + 1)).status, 200);
  assert.equal((await read())[b], initial[b]);
  assert.equal((await save(b, initial[b], initial[b]! + 2)).status, 200);
  assert.equal((await read())[a], initial[a]! + 1);
  const beforeConflict = await read();
  assert.equal((await save(b, initial[b], initial[b]! + 3)).status, 409);
  assert.deepEqual(await read(), beforeConflict);
  for (const oldQty of [undefined, null, "invalid", 1.5]) {
    assert.equal((await save(a, oldQty, 10)).status, 400);
  }
  for (const newQty of [-1, 1.5, "invalid"]) {
    assert.equal((await save(a, beforeConflict[a], newQty)).status, 400);
  }
  const old = beforeConflict[a]!;
  const concurrent = await Promise.all([old + 1, old + 2].map(q => save(a, old, q)));
  assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409]);
  const winner = await concurrent.find(r => r.status === 200)!.json() as any;
  const final = await read();
  assert.equal(final[a], winner.qty);
  assert.equal(final[b], beforeConflict[b]);
  const adjustments = await (await fetch(`${base}/adjustments`, { headers })).json() as any[];
  const logs = adjustments.filter(row => row.reason === reason);
  assert.equal(logs.length, 3, "only successful writes create adjustment records");
  assert.ok(logs.every(row => row.productId === productId && [a, b].includes(row.branchId)));
  console.log("Final QA stock", final, "HTTP concurrency", concurrent.map(r => r.status), "adjustments", logs.length);
});
