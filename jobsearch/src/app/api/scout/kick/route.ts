import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/app/lib/cron/requireCron";
import { kickScoutIfStale, SCOUT_STALE_MIN } from "@/app/lib/scout/selfDrive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * For an external scheduler (Google Cloud Scheduler, every 30 min): start a
 * full scout walk when the catalogue is stale, under the same lock as the
 * traffic-driven self-drive, so the two never overlap. Returns at once; the
 * walk continues as chained chunks. Always 200 when authorised, so the
 * scheduler only reports real failures ("fresh"/"busy" are normal answers).
 *
 *   GET /api/scout/kick?staleMin=20   Authorization: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const raw = Number(req.nextUrl.searchParams.get("staleMin"));
  const staleMin = Number.isFinite(raw) && raw >= 5 ? Math.min(raw, 24 * 60) : SCOUT_STALE_MIN;
  const result = await kickScoutIfStale(staleMin);
  return NextResponse.json({ result, staleMin, at: new Date().toISOString() });
}

export const POST = GET;
