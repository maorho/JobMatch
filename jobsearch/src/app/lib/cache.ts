/**
 * Tiny in-process TTL cache for read-mostly catalog data (facets, company
 * list, anonymous search pages). Per server instance: on Vercel each warm
 * lambda keeps its own, which is exactly where repeated anonymous requests
 * land. Never used for anything personal — callers key by the public URL.
 */
type Entry<T> = { value: T; expiresAt: number; inflight?: Promise<T> };
const store = new Map<string, Entry<unknown>>();
const MAX_ENTRIES = 500;

/** Get-or-compute with a TTL; concurrent callers share one in-flight promise. */
export async function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;
  if (hit?.inflight) return hit.inflight;
  const inflight = fn().then(
    (value) => {
      if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value as string);
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    },
    (err) => {
      store.delete(key);
      throw err;
    }
  );
  store.set(key, { value: hit?.value as T, expiresAt: 0, inflight });
  return inflight;
}

/** Route TTLs: off under test so every request sees the fixtures it just wrote (memo itself is unit-tested). */
export const ttl = (ms: number) => (process.env.NODE_ENV === "test" ? 0 : ms);

export function invalidate(prefix = ""): number {
  let n = 0;
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k), n++;
  return n;
}

export const cacheSize = () => store.size;

/** Response headers: anonymous catalog data may sit on the CDN briefly; anything personal must not. */
export const PUBLIC_CACHE = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } as const;
export const PRIVATE_CACHE = { "Cache-Control": "private, no-store" } as const;

/** Shorten a posting's description for list views (cards clamp to 3 lines anyway). */
export const SNIPPET_LEN = 480;
export function snippet(text: unknown, max = SNIPPET_LEN): string {
  const s = typeof text === "string" ? text : "";
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40)) + "…";
}
