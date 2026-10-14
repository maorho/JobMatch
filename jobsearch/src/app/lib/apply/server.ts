/**
 * Where the Puppeteer apply/render server lives (server/index.ts).
 * Development falls back to the local port; production must configure
 * PUPPETEER_SERVER_URL explicitly — a cron silently hammering localhost on
 * Vercel is exactly the failure mode we want to see in the logs, once.
 */
let warned = false;

export function applyServerBase(): string | null {
  const configured = (process.env.PUPPETEER_SERVER_URL || "").replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    if (!warned) {
      warned = true;
      console.error("[apply-server] PUPPETEER_SERVER_URL is not set: auto-apply, ATS detection and final-URL resolution are disabled in production");
    }
    return null;
  }
  return "http://localhost:4000";
}

/** The shared secret the server checks (`x-scraper-token` / `?token=`). */
export const applyServerToken = () => process.env.SCRAPER_TOKEN || process.env.CRON_SECRET || "";

export type ApplyServerHealth = { ok: boolean; reason?: string };

/**
 * One cheap GET before a pass pays for tailoring: an unreachable or busy
 * server defers the whole pass instead of burning an LLM call per posting.
 */
export async function checkApplyServer(timeoutMs = 8_000): Promise<ApplyServerHealth> {
  const base = applyServerBase();
  if (!base) return { ok: false, reason: "apply server not configured" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/health`, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return { ok: false, reason: `apply server health returned ${res.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.name === "AbortError" ? "apply server health check timed out" : `apply server unreachable: ${e?.message || e}` };
  } finally {
    clearTimeout(timer);
  }
}
