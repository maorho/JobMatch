/** Canonical site origin for metadata, sitemaps and structured data (read at call time so tests/envs can set it). */
export const siteUrl = () => (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
export const SITE_NAME = "JobMatch";

export const absolute = (path: string) => (path.startsWith("http") ? path : `${siteUrl()}${path.startsWith("/") ? "" : "/"}${path}`);

/** Plain-text excerpt for descriptions (strip markup/bullets, collapse whitespace). */
export function excerpt(text: string, max = 160): string {
  const t = (text || "").replace(/<[^>]+>/g, " ").replace(/[•\-*#]+/g, " ").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)) + "…";
}
