/**
 * Feature flags for capabilities that exist but are not launch-ready. Server
 * code reads FEATURE_* (accepts "1"/"true" and "0"/"false"); client
 * components learn a feature's state from the API that serves it (e.g.
 * GET /api/settings/auto-apply → `available`), so there is one source of truth.
 * Unset = the safe default listed here. Read lazily (getters) so a flag
 * flipped at runtime or in a test applies.
 */
function readFlag(name: string): boolean | undefined {
  const v = (process.env[name] || "").trim().toLowerCase();
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return undefined;
}

/**
 * The Puppeteer apply server is usable: PUPPETEER_SERVER_URL is set, and in
 * production SCRAPER_TOKEN too (without it the app would hand CRON_SECRET to
 * a remote box — lib/env.ts warns, and auto-apply stays off).
 */
export function applyServerConfigured(): boolean {
  if (!process.env.PUPPETEER_SERVER_URL?.trim()) return false;
  return process.env.NODE_ENV !== "production" || !!process.env.SCRAPER_TOKEN?.trim();
}

export const FEATURES = {
  /** Phone interviews over Twilio: never tested live. Off until it is. */
  get phone() {
    return readFlag("FEATURE_PHONE") === true;
  },
  /**
   * Auto-apply through the Puppeteer server (labelled beta in the UI).
   * Default: on only when the apply server is configured — there is nothing
   * to apply with otherwise. FEATURE_AUTO_APPLY=0 always turns it off;
   * FEATURE_AUTO_APPLY=1 forces it on outside production (local runs without
   * a server), but in production it cannot switch on an unconfigured server.
   */
  get autoApply() {
    const explicit = readFlag("FEATURE_AUTO_APPLY");
    if (explicit === false) return false;
    if (explicit === true && process.env.NODE_ENV !== "production") return true;
    return applyServerConfigured();
  },
  /** Personal MCP keys. */
  get mcp() {
    return readFlag("FEATURE_MCP") !== false;
  },
};

export const featureSnapshot = () => ({ phone: FEATURES.phone, autoApply: FEATURES.autoApply, mcp: FEATURES.mcp });

/** Shown wherever auto-apply is offered while the feature is off. */
export const AUTO_APPLY_UNAVAILABLE = "הגשה אוטומטית אינה זמינה כרגע";
