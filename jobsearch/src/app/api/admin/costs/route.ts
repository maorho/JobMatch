import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/authGuard";
import { requireCron } from "@/app/lib/cron/requireCron";
import { costSummary, breachesOf } from "@/app/lib/ops/costMonitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/costs — the spend ledger summarised: today, last hour, 7/30 days, by model, feature, user; and what is over a limit. */
export async function GET(req: NextRequest) {
  const admin = requireCron(req) === null ? { admin: true } : await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const summary = await costSummary();
  const breaches = breachesOf(summary);
  return NextResponse.json({ ok: breaches.length === 0, breaches, ...summary }, { headers: { "Cache-Control": "private, no-store" } });
}
