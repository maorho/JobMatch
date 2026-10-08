import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs from "@/app/models/ExternalJobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-off maintenance: sync Mongo indexes to the current schema. Drops stale
 * indexes (e.g. the old unique finalUrl / source+sourceJobId) and builds the
 * new ones. Guarded by cron_secret.
 */
export async function GET(req: NextRequest) {
  const secret = (req.nextUrl.searchParams.get("cron_secret") ?? "").trim();
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await connectToDatabase();
    await ExternalJobs.syncIndexes();
    const indexes = await ExternalJobs.collection.indexes();
    return NextResponse.json({ ok: true, indexes });
  } catch (err: any) {
    console.error("❌ sync-indexes error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "sync-indexes failed" },
      { status: 500 }
    );
  }
}
