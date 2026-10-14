import { NextRequest, NextResponse } from "next/server";
import { runScout } from "@/app/lib/scout/runScout";
import { announceCatalogIngested } from "@/app/lib/agents/triggers";
import ExternalJobs from "@/app/models/ExternalJobs";
import { requireCron } from "@/app/lib/cron/requireCron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel kills functions at the platform limit (10–15 s by default); without
// this the cron silently polled only the first few sources. We additionally
// chunk the run (see below) so even 300 s is never actually needed.
export const maxDuration = 300;

// Leave headroom under maxDuration for the in-flight source + response.
const DEFAULT_BUDGET_MS = 240_000;

/**
 * Scout run endpoint. Protected by cron_secret, like the existing
 * external-jobs cron routes. Query params:
 *   ?cron_secret=...   (required)
 *   ?dry=1             fetch + diff, do not write
 *   ?company=Name      limit to one company source
 *   ?offset=N&limit=M  process a chunk of sources (stable _id order)
 *   ?budget=S          seconds to spend before handing back `nextOffset`
 *   ?since=ISO         when the whole walk started (the cron takes it once,
 *                      before the first chunk, and repeats it on every call)
 * Response includes `nextOffset` (null when the whole catalog was covered);
 * callers loop until it is null. On the last chunk the agent chain is told
 * about every posting ingested since `since` — counted from the catalog, so
 * the hand-off covers the whole walk, not just this chunk.
 */
const SINCE_FALLBACK_MS = 60 * 60 * 1000;

function sinceFrom(raw: string | null, fallbackFrom: Date): Date {
  const t = raw ? Date.parse(raw) : NaN;
  if (Number.isFinite(t) && t <= Date.now()) return new Date(t);
  return new Date(fallbackFrom.getTime() - SINCE_FALLBACK_MS);
}
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const denied = requireCron(req);
  if (denied) return denied;

  const dry = sp.get("dry") === "1";
  const refresh = sp.get("refresh") === "1"; // rewrite existing postings too
  const company = sp.get("company") || undefined;
  const num = (k: string) => {
    const v = parseInt(sp.get(k) ?? "", 10);
    return Number.isFinite(v) && v >= 0 ? v : undefined;
  };
  const offset = num("offset");
  const limit = num("limit");
  const budgetSec = num("budget");
  const timeBudgetMs = Math.min(
    budgetSec ? budgetSec * 1000 : DEFAULT_BUDGET_MS,
    DEFAULT_BUDGET_MS
  );

  try {
    const startedAt = new Date();
    const since = sinceFrom(sp.get("since"), startedAt);
    const result = await runScout({ dry, refresh, company, offset, limit, timeBudgetMs });
    // Whole catalog covered → hand the new postings to the agent chain
    // (Locator → Matcher → Notifier) the same way the Scout agent does.
    // Counts come from the catalog (indexed on firstSeenAt), so a walk made of
    // several chunk calls reports everything it ingested, not the last chunk.
    if (!dry && result.nextOffset === null) {
      const [created, removed] = await Promise.all([
        ExternalJobs.countDocuments({ firstSeenAt: { $gte: since }, sourceJobId: { $type: "string" } }),
        ExternalJobs.countDocuments({ closedAt: { $gte: since } }).catch(() => result.removed),
      ]);
      await announceCatalogIngested({ since, created, removed, sources: company ? result.processed : result.totalSources }).catch((e: any) =>
        console.warn("[scout] agents hand-off skipped:", e?.message)
      );
    }
    return NextResponse.json({ ok: true, dry, since: since.toISOString(), ...result });
  } catch (err: any) {
    console.error("❌ Scout run error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Scout run failed" },
      { status: 500 }
    );
  }
}
