import type { CacheEntry } from "./types.js";

interface Item {
  value: CacheEntry;
  expiresAt: number;
}

export class VerificationCache {
  private readonly items = new Map<string, Item>();

  constructor(
    private readonly ttlMs = 30_000,
    private readonly maxSize = 2_000,
    private readonly now: () => number = Date.now
  ) {}

  get(key: string): CacheEntry | null {
    const item = this.items.get(key);
    if (!item) return null;
    if (item.expiresAt <= this.now()) {
      this.items.delete(key);
      return null;
    }
    this.items.delete(key);
    this.items.set(key, item);
    return item.value;
  }

  set(key: string, value: CacheEntry): void {
    this.items.delete(key);
    this.items.set(key, { value, expiresAt: this.now() + this.ttlMs });
    if (this.items.size > this.maxSize) {
      const oldest = this.items.keys().next().value as string | undefined;
      if (oldest) this.items.delete(oldest);
    }
  }

  invalidateDocument(documentId: string): void {
    for (const [key, item] of this.items) {
      if (item.value.documentId === documentId) this.items.delete(key);
    }
  }

  invalidateNumberHash(numberHash: string): void {
    for (const [key, item] of this.items) {
      if (item.value.numberHash === numberHash) this.items.delete(key);
    }
  }

  clear(): void {
    this.items.clear();
  }
}
