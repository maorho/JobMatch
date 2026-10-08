import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";
import ExternalJobs from "@/app/models/ExternalJobs";
import { cosineSimilarity, toMatchScore } from "@/app/lib/matcher/cosine";
import { notify } from "@/app/lib/notifications/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MIN_SCORE = 60;
const TOP_N = 5;
const LOOKBACK_DAYS = 7;

/**
 * Daily "new jobs that match you" digest (cron, cron_secret).
 * For every user with a résumé vector: score the postings ingested since
 * their last digest (bounded to the last 7 days), and notify them once with
 * the top matches above MIN_SCORE. Idempotent per day via lastMatchDigestAt.
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
    const now = new Date();
    const horizon = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 3600 * 1000);

    // New, embedded postings once; filtered per user by their own cut-off.
    const jobs: any[] = await ExternalJobs.find({ firstSeenAt: { $gt: horizon }, embedding: { $exists: true } })
      .select("+embedding job company city country firstSeenAt")
      .sort({ firstSeenAt: -1 })
      .limit(3000)
      .lean();

    const users: any[] = await User.find({ embedding: { $exists: true, $ne: [] } })
      .select("+embedding lastMatchDigestAt")
      .limit(500)
      .lean();

    let notified = 0;
    for (const u of users) {
      const since = u.lastMatchDigestAt ? new Date(Math.max(new Date(u.lastMatchDigestAt).getTime(), horizon.getTime())) : horizon;
      const fresh = jobs.filter((j) => j.firstSeenAt && new Date(j.firstSeenAt) > since && Array.isArray(j.embedding));
      const scored = fresh
        .map((j) => ({ j, score: toMatchScore(cosineSimilarity(u.embedding, j.embedding)) }))
        .filter((x) => x.score >= MIN_SCORE)
        .sort((a, b) => b.score - a.score)
        .slice(0, TOP_N);

      if (!dry) {
        if (scored.length) {
          await notify(String(u._id), {
            type: "job_match",
            title: scored.length === 1 ? "משרה חדשה שמתאימה לך" : `${scored.length} משרות חדשות שמתאימות לך`,
            body: scored.map((x) => `${x.j.job} · ${x.j.company} (${x.score}%)`).join("\n"),
            link: "/",
            meta: { jobIds: scored.map((x) => String(x.j._id)) },
          });
        }
        await User.updateOne({ _id: u._id }, { $set: { lastMatchDigestAt: now } });
      }
      if (scored.length) notified++;
    }

    return NextResponse.json({ ok: true, dry, users: users.length, newJobs: jobs.length, notified });
  } catch (err: any) {
    console.error("❌ job-matches digest error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "failed" }, { status: 500 });
  }
}
