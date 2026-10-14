import { NextResponse,NextRequest } from "next/server";
import { sweepStaleExternalJobs } from "@/app/lib/staleJobsSweep";
import { requireCron } from "@/app/lib/cron/requireCron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  try {
    const raw = parseInt(req.nextUrl.searchParams.get("staleDays") ?? "", 10);
    const staleDays = Number.isFinite(raw) && raw > 0 ? raw : undefined;
    const report = await sweepStaleExternalJobs(staleDays); // runs immediately
    return NextResponse.json(report);
  } catch (err: any) {
    console.error("❌ Cleanup-now failed:", err);
    return NextResponse.json(
      { message: "Cleanup failed", error: err.message },
      { status: 500 }
    );
  }
}
