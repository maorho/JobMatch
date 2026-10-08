import { NextResponse,NextRequest } from "next/server";
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
