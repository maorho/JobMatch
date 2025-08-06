// lib/finalUrlCache.ts
const finalUrlCache = new Map<string, string>();

export async function prefetchFinalUrl(url: string): Promise<void> {
  if (finalUrlCache.has(url)) return;
  try {
    const res = await fetch(`http://localhost:4000/api/open-job?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    if (data.finalUrl) {
      finalUrlCache.set(url, data.finalUrl);
    }
  } catch (err) {
    console.warn("Failed to prefetch final URL", err);
  }
}

export function getFinalUrlFromCache(url: string): string | null {
  return finalUrlCache.get(url) || null;
}
