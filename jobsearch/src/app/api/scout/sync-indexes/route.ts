import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs from "@/app/models/ExternalJobs";
import Candidates from "@/app/models/Candidates";
import AgentMessage from "@/app/models/AgentMessage";
import AgentRun from "@/app/models/AgentRun";
import Notification from "@/app/models/Notification";
import OpsAlert from "@/app/models/OpsAlert";
import RateLimit from "@/app/models/RateLimit";
import JobSignal from "@/app/models/JobSignal";
import AutoApplication from "@/app/models/AutoApplication";
import ApplicationOutcome from "@/app/models/ApplicationOutcome";
import MatchCache from "@/app/models/MatchCache";
import UsageCounter from "@/app/models/UsageCounter";
import DiscoveryCandidate from "@/app/models/DiscoveryCandidate";
import CompanySource from "@/app/models/CompanySource";
import { requireCron } from "@/app/lib/cron/requireCron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-off maintenance: sync Mongo indexes to the current schema. Drops stale
 * indexes (e.g. the old unique finalUrl / source+sourceJobId) and builds the
 * new ones. Guarded by cron_secret.
 */
export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  try {
    await connectToDatabase();
    // autoIndex is off in production, so this is where new indexes (unique Candidates pair, TTLs, rate limits) get built.
    const models = [ExternalJobs, Candidates, AgentMessage, AgentRun, Notification, OpsAlert, RateLimit, JobSignal, AutoApplication, ApplicationOutcome, MatchCache, UsageCounter, DiscoveryCandidate, CompanySource];
    const synced: Record<string, string[]> = {};
    for (const m of models) {
      await m.syncIndexes();
      synced[m.modelName] = (await m.collection.indexes()).map((i: any) => i.name);
    }
    return NextResponse.json({ ok: true, indexes: synced });
  } catch (err: any) {
    console.error("❌ sync-indexes error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "sync-indexes failed" },
      { status: 500 }
    );
  }
}
