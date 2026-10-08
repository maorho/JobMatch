import { NextRequest, NextResponse } from "next/server";
import { sweepStaleExternalJobs } from "@/app/lib/staleJobsSweep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = (req.nextUrl.searchParams.get("cron_secret") ?? "").trim();
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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