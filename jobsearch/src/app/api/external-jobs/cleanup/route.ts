import { NextRequest, NextResponse } from "next/server";
import { maybeRunExternalJobsCleanup } from "@/app/lib/maybeRunExternalJobsCleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { requireCron } from "@/app/lib/cron/requireCron";

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  // Awaited: the sweep runs inside the request (cleanup-now is what cron calls; this is the "only if due" variant).
  try {
    const { triggered, report } = await maybeRunExternalJobsCleanup();
    return NextResponse.json({ triggered, report });
  } catch (err: any) {
    console.error("❌ Cleanup failed:", err);
    return NextResponse.json({ message: "Cleanup failed", error: err?.message }, { status: 500 });
  }
}
