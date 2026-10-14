import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs, { OPEN_JOBS } from "@/app/models/ExternalJobs";
import { isIsraelOrRemote } from "@/app/lib/scout/locationFilter";
import { requireCron } from "@/app/lib/cron/requireCron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Soft-close every open external job that is neither in Israel nor remote.
 * Applications are never touched (the person still applied). Guarded by
 * cron_secret. ?dry=1 to preview.
 */
export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") === "1";

  try {
    await connectToDatabase();
    const jobs = await ExternalJobs.find(OPEN_JOBS)
      .select("job city country description")
      .lean();

    const toClose: any[] = [];
    for (const j of jobs as any[]) {
      if (!isIsraelOrRemote(j)) toClose.push(j._id);
    }

    if (dry) {
      return NextResponse.json({
        ok: true,
        dry: true,
        total: jobs.length,
        wouldClose: toClose.length,
        keep: jobs.length - toClose.length,
      });
    }

    if (toClose.length) {
      await ExternalJobs.updateMany({ _id: { $in: toClose } }, { $set: { active: false, closedAt: new Date() } });
    }

    return NextResponse.json({
      ok: true,
      total: jobs.length,
      closed: toClose.length,
      keep: jobs.length - toClose.length,
    });
  } catch (err: any) {
    console.error("❌ prune-location error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "prune failed" },
      { status: 500 }
    );
  }
}
