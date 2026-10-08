import { NextRequest, NextResponse } from "next/server";
import { runScout } from "@/app/lib/scout/runScout";
import { announceCatalogIngested } from "@/app/lib/agents/triggers";

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
 * Response includes `nextOffset` (null when the whole catalog was covered);
 * callers loop until it is null.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const secret = (sp.get("cron_secret") ?? "").trim();
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    const result = await runScout({ dry, refresh, company, offset, limit, timeBudgetMs });
    // Whole catalog covered → hand the new postings to the agent chain
    // (Locator → Matcher → Notifier) the same way the Scout agent does.
    if (!dry && result.nextOffset === null) {
      await announceCatalogIngested({ since: startedAt, created: result.created, removed: result.removed, sources: result.processed }).catch((e: any) =>
        console.warn("[scout] agents hand-off skipped:", e?.message)
      );
    }
    return NextResponse.json({ ok: true, dry, ...result });
  } catch (err: any) {
    console.error("❌ Scout run error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Scout run failed" },
      { status: 500 }
    );
  }
}
