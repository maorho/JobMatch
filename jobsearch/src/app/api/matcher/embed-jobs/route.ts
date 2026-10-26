import { NextRequest, NextResponse } from "next/server";
import { embedPendingJobs } from "@/app/lib/matcher/embedJobs";
import { requireCron } from "@/app/lib/cron/requireCron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Backfill embeddings for jobs that don't have one. Guarded by cron_secret.
 * ?limit=N (default 1000). Run after the Scout.
 */
export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "1000") || 1000;

  try {
    const result = await embedPendingJobs(limit);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("❌ embed-jobs error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "embed-jobs failed" },
      { status: 500 }
    );
  }
}
