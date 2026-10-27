/**
 * Small in-memory TTL cache. Lives per server instance, so on Vercel each
 * warm function has its own copy. Good enough to stop repeat calls for the
 * same search; swap for Supabase/Redis later if we need a shared cache.
 */
export class TtlCache<V> {
  private store = new Map<string, { value: V; expiresAt: number }>();

  constructor(
    private ttlMs: number,
    private maxEntries = 500,
    private now: () => number = Date.now,
  ) {}

  get(key: string): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: V): void {
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      // Drop the oldest entry (Map keeps insertion order).
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  get size(): number {
    return this.store.size;
  }
}
