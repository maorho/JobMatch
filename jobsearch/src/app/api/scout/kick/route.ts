import { NextRequest, NextResponse, after } from "next/server";
import { requireCron } from "@/app/lib/cron/requireCron";
import { kickScoutIfStale, SCOUT_STALE_MIN } from "@/app/lib/scout/selfDrive";
import { runDiscoveryTick, discoveryTickEnabled } from "@/app/lib/scout/discoverTick";
import { runEnrichBackfill } from "@/app/lib/jobs/enrichBackfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The discovery batch runs after the response (see below) and needs room.
export const maxDuration = 300;
const DISCOVERY_BUDGET_MS = 240_000;

/**
 * For an external scheduler (Google Cloud Scheduler, every 30 min): start a
 * full scout walk when the catalogue is stale, under the same lock as the
 * traffic-driven self-drive, so the two never overlap. Returns at once; the
 * walk continues as chained chunks. Always 200 when authorised, so the
 * scheduler only reports real failures ("fresh"/"busy" are normal answers).
 *
 * After answering, the same call grows the company pool: one discovery batch
 * (lib/scout/discoverTick.ts) probes pending candidates for a careers page.
 *
 *   GET /api/scout/kick?staleMin=20   Authorization: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const raw = Number(req.nextUrl.searchParams.get("staleMin"));
  const staleMin = Number.isFinite(raw) && raw >= 5 ? Math.min(raw, 24 * 60) : SCOUT_STALE_MIN;
  const startedAt = Date.now();
  const result = await kickScoutIfStale(staleMin);
  const discovery = flagOn(req, "discover") && discoveryTickEnabled() ? "scheduled" : "off";
  if (discovery === "scheduled") {
    after(async () => {
      // Structured fields for postings that arrived without them (rules only, seconds), then the discovery batch.
      if (process.env.NODE_ENV !== "test") await runEnrichBackfill({ limit: 1000 }).catch((e) => console.warn("[enrich] backfill failed:", (e as Error)?.message));
      await runDiscoveryTick({ deadline: startedAt + DISCOVERY_BUDGET_MS }).catch((e) => console.warn("[discover] tick failed:", (e as Error)?.message));
    });
  }
  return NextResponse.json({ result, staleMin, discovery, at: new Date().toISOString() });
}

/** `?discover=0` skips the discovery batch (on by default). */
const flagOn = (req: NextRequest, k: string) => req.nextUrl.searchParams.get(k) !== "0";

export const POST = GET;
