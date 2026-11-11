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

/**
 * A board page as a real browser sees it, through the renderer (GET /api/fetch-html).
 * For sites that answer our serverless egress with 403. Null when the renderer
 * is not configured, busy, or failed — the caller keeps its own error.
 */
export async function fetchHtmlViaRenderer(url: string, timeoutMs = RENDERER_FETCH_MS): Promise<{ status: number; html: string } | null> {
  const base = applyServerBase();
  if (!base) return null;
  // The run's budget: a chunk full of blocked boards must not spend its whole call waiting on the renderer.
  if (rendererBudget.leftMs < RENDERER_MIN_LEFT_MS) return null;
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.min(timeoutMs, rendererBudget.leftMs));
  try {
    const res = await fetch(`${base}/api/fetch-html?url=${encodeURIComponent(url)}`, { headers: { "x-scraper-token": applyServerToken() }, cache: "no-store", signal: ctrl.signal });
    if (!res.ok) return null;
    const d = (await res.json()) as { html?: unknown; status?: unknown } | null;
    return typeof d?.html === "string" ? { status: Number(d.status) || 200, html: d.html } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    rendererBudget.leftMs -= Date.now() - t0;
  }
}

/** One board page through the renderer: 20 s at most (a 403 board that needs longer is not worth the chunk's time). */
export const RENDERER_FETCH_MS = 20_000;
/** All renderer fallbacks in one scout run share this much time; below the minimum the fallback is skipped. */
export const RENDERER_RUN_BUDGET_MS = 60_000;
const RENDERER_MIN_LEFT_MS = 3_000;
const rendererBudget = { leftMs: RENDERER_RUN_BUDGET_MS };
/** Called at the start of a scout run (lib/scout/runScout.ts). */
export function resetRendererBudget(ms = RENDERER_RUN_BUDGET_MS) {
  rendererBudget.leftMs = ms;
}
export const rendererBudgetLeftMs = () => rendererBudget.leftMs;

export type ApplyServerHealth = { ok: boolean; reason?: string };

export type ApplyServerProbe = { ok: boolean; configured: boolean; reachable?: boolean; authorized?: boolean | null; agent?: boolean; ms?: number; reason?: string };

/**
 * For the admin health check: is the server up, and does it accept our token?
 * Sends the token to /health, which answers `authorized` without doing any work.
 * `authorized: null` means the server is older than that field (counted as fine).
 * The timeout allows a Cloud Run cold start.
 */
export async function probeApplyServer(timeoutMs = 20_000): Promise<ApplyServerProbe> {
  const base = applyServerBase();
  if (!base || !process.env.PUPPETEER_SERVER_URL) return { ok: false, configured: false, reason: "PUPPETEER_SERVER_URL is not set" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}/health`, { headers: { "x-scraper-token": applyServerToken() }, signal: ctrl.signal, cache: "no-store" });
    const ms = Date.now() - t0;
    if (!res.ok) return { ok: false, configured: true, reachable: false, ms, reason: `health returned ${res.status}` };
    const body = (await res.json().catch(() => ({}))) as { authorized?: unknown; agent?: unknown };
    const authorized = typeof body.authorized === "boolean" ? body.authorized : null;
    return {
      ok: authorized !== false,
      configured: true,
      reachable: true,
      authorized,
      agent: !!body.agent,
      ms,
      ...(authorized === false ? { reason: "the server rejects SCRAPER_TOKEN: set the same value in Vercel and on the server" } : {}),
    };
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string } | null;
    return { ok: false, configured: true, reachable: false, reason: err?.name === "AbortError" ? `no answer in ${timeoutMs / 1000}s` : `unreachable: ${err?.message || String(e)}` };
  } finally {
    clearTimeout(timer);
  }
}

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
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string } | null;
    return { ok: false, reason: err?.name === "AbortError" ? "apply server health check timed out" : `apply server unreachable: ${err?.message || String(e)}` };
  } finally {
    clearTimeout(timer);
  }
}
