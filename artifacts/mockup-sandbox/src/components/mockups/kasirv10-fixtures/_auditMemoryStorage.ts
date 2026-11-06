const memory = new Map<string, string>();

export const auditMemoryStorage = {
  getItem(key: string) {
    return memory.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    memory.set(key, String(value));
  },
  removeItem(key: string) {
    memory.delete(key);
  },
};
