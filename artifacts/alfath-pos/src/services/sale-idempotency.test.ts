import assert from "node:assert/strict";
import test from "node:test";
import {
  clearPendingSaleKey,
  getPendingSaleKey,
  type KeyValueStore,
} from "./sale-idempotency";

class MemoryStorage implements KeyValueStore {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test("same unresolved checkout reuses its key, but another account or branch gets a different key", () => {
  const storage = new MemoryStorage();
  let sequence = 0;
  const newKey = () => `qa-key-${++sequence}`;
  const request = { cashierId: "account-a", branchId: "branch-a", items: [{ productId: "p1", qty: 1 }] };
  const first = getPendingSaleKey(request, storage, newKey);
  const retry = getPendingSaleKey(request, storage, newKey);
  const differentRequest = getPendingSaleKey(
    { ...request, items: [{ productId: "p1", qty: 2 }] },
    storage,
    newKey,
  );
  const anotherBranch = getPendingSaleKey({ ...request, branchId: "branch-b" }, storage, newKey);
  const anotherAccount = getPendingSaleKey({ ...request, cashierId: "account-b" }, storage, newKey);

  assert.equal(retry.key, first.key);
  assert.notEqual(differentRequest.key, first.key);
  assert.equal(getPendingSaleKey(request, storage, newKey).key, first.key);
  assert.notEqual(anotherBranch.key, first.key);
  assert.notEqual(anotherAccount.key, first.key);
  assert.equal(sequence, 4);
});

test("success clears only the matching pending key so the next sale gets a new key", () => {
  const storage = new MemoryStorage();
  let sequence = 0;
  const newKey = () => `qa-key-${++sequence}`;
  const request = { cashierId: "account-a", branchId: "branch-a", items: [{ productId: "p1", qty: 1 }] };
  const first = getPendingSaleKey(request, storage, newKey);
  clearPendingSaleKey(storage, first.storageKey, "different-key");
  assert.equal(getPendingSaleKey(request, storage, newKey).key, first.key);
  clearPendingSaleKey(storage, first.storageKey, first.key);
  assert.notEqual(getPendingSaleKey(request, storage, newKey).key, first.key);
});
