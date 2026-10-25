import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CSP violation sink for the report-only policy in next.config.ts
 * (`report-uri /api/csp-report`). Browsers post anonymously, so no auth.
 * Accepts the legacy `application/csp-report` body ({"csp-report": {...}}) and
 * the Reporting API's `application/reports+json` (an array of
 * {type: "csp-violation", body: {...}}). Logs one compact line per report,
 * at most MAX_LOGS_PER_WINDOW per instance per minute, and always answers 204.
 */
const WINDOW_MS = 60_000;
const MAX_LOGS_PER_WINDOW = 20;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_REPORTS_PER_REQUEST = 10;

let windowStart = 0;
let logged = 0;
let dropped = 0;

const noContent = () => new Response(null, { status: 204 });

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");

/** Path only — query strings can carry tokens. */
function pathOf(uri: string): string {
  if (!uri) return "";
  try {
    return new URL(uri).pathname;
  } catch {
    return uri.split(/[?#]/)[0].slice(0, 200);
  }
}

/** Origin + path of the blocked resource, or the keyword ("inline", "eval", …). */
function blockedOf(uri: string): string {
  if (!uri) return "";
  try {
    const u = new URL(uri);
    return `${u.origin}${u.pathname}`.slice(0, 200);
  } catch {
    return uri.slice(0, 200);
  }
}

type Summary = { blocked: string; directive: string; document: string };

function summarize(payload: unknown): Summary[] {
  const out: Summary[] = [];
  const one = (r: any, legacy: boolean) => {
    if (!r || typeof r !== "object") return;
    out.push({
      blocked: blockedOf(str(legacy ? r["blocked-uri"] : r.blockedURL)),
      directive: str(legacy ? r["violated-directive"] || r["effective-directive"] : r.effectiveDirective || r.violatedDirective, 100),
      document: pathOf(str(legacy ? r["document-uri"] : r.documentURL, 500)),
    });
  };
  if (Array.isArray(payload)) {
    for (const item of payload.slice(0, MAX_REPORTS_PER_REQUEST)) {
      if (item && typeof item === "object" && (item as any).type === "csp-violation") one((item as any).body, false);
    }
  } else if (payload && typeof payload === "object" && "csp-report" in payload) {
    one((payload as any)["csp-report"], true);
  }
  return out;
}

/** In-process limiter: true while this instance may still log in the current minute. */
function allowLog(now = Date.now()): boolean {
  if (now - windowStart >= WINDOW_MS) {
    if (dropped > 0) console.warn(`[csp] ${dropped} more report(s) suppressed in the last minute`);
    windowStart = now;
    logged = 0;
    dropped = 0;
  }
  if (logged >= MAX_LOGS_PER_WINDOW) {
    dropped++;
    return false;
  }
  logged++;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const type = (req.headers.get("content-type") || "").toLowerCase();
    if (!type.includes("application/csp-report") && !type.includes("application/reports+json") && !type.includes("application/json")) return noContent();
    const declared = Number(req.headers.get("content-length") || 0);
    if (declared > MAX_BODY_BYTES) return noContent();
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return noContent();
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return noContent();
    }
    for (const s of summarize(payload)) {
      if (!allowLog()) break;
      console.warn(`[csp] ${s.directive || "?"} blocked ${s.blocked || "?"} on ${s.document || "?"}`);
    }
  } catch {
    // Never fail a browser's fire-and-forget report.
  }
  return noContent();
}
