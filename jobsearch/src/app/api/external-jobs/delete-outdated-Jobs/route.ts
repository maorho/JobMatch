import { NextRequest, NextResponse } from "next/server";
import { sweepStaleExternalJobs } from "@/app/lib/staleJobsSweep";
import { requireCron } from "@/app/lib/cron/requireCron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  try {
    // Optional ?staleDays= override (defaults to the sweep's own default).
    const raw = parseInt(req.nextUrl.searchParams.get("staleDays") ?? "", 10);
    const staleDays = Number.isFinite(raw) && raw > 0 ? raw : undefined;
    const result = await sweepStaleExternalJobs(staleDays);
    return NextResponse.json({ message: "Job cleanup completed", ...result });
  } catch (err) {
    console.error("❌ Cleanup failed:", err);
    return NextResponse.json(
      { message: "Failed to run cleanup sweep" },
      { status: 500 }
    );
  }
}