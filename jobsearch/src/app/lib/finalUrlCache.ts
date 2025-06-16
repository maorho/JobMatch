// lib/finalUrlCache.ts
const finalUrlCache = new Map<string, string>();

export async function prefetchFinalUrl(url: string): Promise<string | null> {
  if (finalUrlCache.has(url)) {
    return finalUrlCache.get(url)!;
  }
  try {
    const res = await fetch(
      `http://localhost:4000/api/open-job?url=${encodeURIComponent(url)}`
    );
    const data = await res.json();
    if (data.finalUrl) {
      finalUrlCache.set(url, data.finalUrl);
      return data.finalUrl;
    }
    return null;
  } catch (err) {
    console.error("Prefetch error:", err);
    return null;
  }
}

export function getCachedFinalUrl(url: string): string | null {
  return finalUrlCache.get(url) || null;
}
