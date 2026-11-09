import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/app/lib/cron/requireCron";
import { runEnrichBackfill } from "@/app/lib/jobs/enrichBackfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Backfill the structured fields (experience, technologies, requirements,
 * title key) on postings that do not have them yet. Rules only — no model,
 * no network — so a batch of 1,000 takes a few seconds.
 *   GET /api/scout/enrich?limit=1000[&all=1]   Authorization: Bearer <CRON_SECRET>
 * `all=1` re-enriches every open posting (after a rules change).
 */
export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 1000, 1), 5000);
  const r = await runEnrichBackfill({ limit, all: sp.get("all") === "1" });
  return NextResponse.json(r);
}
