import { vercelPreviewOrigin } from "../appUrl";

let warnedMissing = false;

/**
 * Canonical site origin for metadata, sitemaps and structured data (read at
 * call time so tests/envs can set it). On a Vercel Preview without APP_URL it
 * is the preview's own https origin (VERCEL_BRANCH_URL, else VERCEL_URL).
 * Outside production it falls back to localhost; in production APP_URL is
 * mandatory (lib/env.ts refuses to boot without it), so a missing value here
 * is logged loudly and yields "" rather than leaking "http://localhost:3000"
 * into canonical tags and the sitemap.
 */
export const siteUrl = (): string => {
  const configured = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || vercelPreviewOrigin() || "").replace(/\/$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    if (!warnedMissing) {
      warnedMissing = true;
      console.error("❌ seo: APP_URL is not set in production — canonical/sitemap/OG URLs will be relative");
    }
    return "";
  }
  return "http://localhost:3000";
};
export const SITE_NAME = "JobMatch";

export const absolute = (path: string) => (path.startsWith("http") ? path : `${siteUrl()}${path.startsWith("/") ? "" : "/"}${path}`);

/** Plain-text excerpt for descriptions (strip markup/bullets, collapse whitespace). */
export function excerpt(text: string, max = 160): string {
  const t = (text || "").replace(/<[^>]+>/g, " ").replace(/[•\-*#]+/g, " ").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)) + "…";
}
