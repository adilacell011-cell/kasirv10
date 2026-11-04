type SaleRequestIdentity = {
  branchId?: unknown;
  cashierId?: unknown;
};

export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type PendingSaleKey = {
  key: string;
  storageKey: string | null;
};

function payloadFingerprint(data: unknown): string {
  const serialized = JSON.stringify(data);
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

export function getPendingSaleKey(
  data: SaleRequestIdentity,
  store: KeyValueStore,
  createKey: () => string,
  providedKey?: string,
): PendingSaleKey {
  if (providedKey) return { key: providedKey, storageKey: null };
  const accountId = encodeURIComponent(String(data.cashierId || "unknown"));
  const branchId = encodeURIComponent(String(data.branchId || "unknown"));
  const fingerprint = payloadFingerprint(data);
  const storageKey = `alfath.pending-sale:${accountId}:${branchId}:${fingerprint}`;

  try {
    const stored = store.getItem(storageKey);
    if (stored) {
      const pending = JSON.parse(stored) as { key?: string; fingerprint?: string };
      if (pending.key && pending.fingerprint === fingerprint) {
        return { key: pending.key, storageKey };
      }
    }
    const key = createKey();
    store.setItem(storageKey, JSON.stringify({ key, fingerprint }));
    return { key, storageKey };
  } catch {
    return { key: createKey(), storageKey: null };
  }
}

export function clearPendingSaleKey(
  store: KeyValueStore,
  storageKey: string | null,
  key: string,
): void {
  if (!storageKey) return;
  try {
    const stored = store.getItem(storageKey);
    if (stored && (JSON.parse(stored) as { key?: string }).key === key) {
      store.removeItem(storageKey);
    }
  } catch {
    store.removeItem(storageKey);
  }
}
