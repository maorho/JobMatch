import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs from "@/app/models/ExternalJobs";
import Candidates from "@/app/models/Candidates";
import { isIsraelOrRemote } from "@/app/lib/scout/locationFilter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Delete every external job that is neither in Israel nor remote, plus the
 * orphaned application records. Guarded by cron_secret. ?dry=1 to preview.
 */
export async function GET(req: NextRequest) {
  const secret = (req.nextUrl.searchParams.get("cron_secret") ?? "").trim();
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dry = req.nextUrl.searchParams.get("dry") === "1";

  try {
    await connectToDatabase();
    const jobs = await ExternalJobs.find()
      .select("job city country description")
      .lean();

    const toDelete: any[] = [];
    for (const j of jobs as any[]) {
      if (!isIsraelOrRemote(j)) toDelete.push(j._id);
    }

    if (dry) {
      return NextResponse.json({
        ok: true,
        dry: true,
        total: jobs.length,
        wouldDelete: toDelete.length,
        keep: jobs.length - toDelete.length,
      });
    }

    let candidatesDeleted = 0;
    if (toDelete.length) {
      const c = await Candidates.deleteMany({
        jobModel: "ExternalJobs",
        jobId: { $in: toDelete },
      });
      candidatesDeleted = c.deletedCount ?? 0;
      await ExternalJobs.deleteMany({ _id: { $in: toDelete } });
    }

    return NextResponse.json({
      ok: true,
      total: jobs.length,
      deleted: toDelete.length,
      keep: jobs.length - toDelete.length,
      candidatesDeleted,
    });
  } catch (err: any) {
    console.error("❌ prune-location error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "prune failed" },
      { status: 500 }
    );
  }
}
