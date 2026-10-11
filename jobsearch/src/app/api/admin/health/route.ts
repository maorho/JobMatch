import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
import { requireAdmin } from "@/app/lib/authGuard";
import User from "@/app/models/User";
import ExternalJobs from "@/app/models/ExternalJobs";
import AgentRun from "@/app/models/AgentRun";
import AgentMessage from "@/app/models/AgentMessage";
import ApplicationOutcome from "@/app/models/ApplicationOutcome";
import Referrer from "@/app/models/Referrer";
import { usageToday, limitFor, DEFAULT_LIMITS } from "@/app/lib/ops/quota";
import { mailTransportName } from "@/app/lib/email/send";
import { channelConfigured } from "@/app/lib/messaging/channels";
import { featureSnapshot } from "@/app/lib/flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/health — one page that says whether production is alive:
 * DB, catalogue freshness, the agents' queue and failures, what's configured,
 * and today's paid usage. Admin session or ?cron_secret=.
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("cron_secret");
  const admin = secret && process.env.CRON_SECRET && secret === process.env.CRON_SECRET ? { admin: true } : await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const t0 = Date.now();
  const out: any = { ok: true, at: new Date().toISOString(), checks: {} };
  try {
    await connectToDatabase();
    await mongoose.connection.db!.admin().ping();
    out.checks.db = { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    out.ok = false;
    out.checks.db = { ok: false, error: (e as Error)?.message };
    return NextResponse.json(out, { status: 503 });
  }
  const dayAgo = new Date(Date.now() - 86_400_000);
  const [users, jobs, embedded, freshJobs, lastRun, queued, failed24h, outcomes, insiders, usage] = await Promise.all([
    User.estimatedDocumentCount(),
    ExternalJobs.estimatedDocumentCount(),
    ExternalJobs.countDocuments({ embedding: { $exists: true } }),
    ExternalJobs.countDocuments({ firstSeenAt: { $gt: dayAgo } }),
    AgentRun.findOne().sort({ createdAt: -1 }).select("title status createdAt finishedAt").lean() as any,
    AgentMessage.countDocuments({ status: { $in: ["queued", "working"] } }),
    AgentMessage.countDocuments({ status: "failed", updatedAt: { $gt: dayAgo } }),
    ApplicationOutcome.countDocuments({ outcome: { $ne: "pending" } }),
    Referrer.countDocuments({ verifiedAt: { $ne: null }, active: true }),
    usageToday(),
  ]);
  const lastRunAgeMin = lastRun ? Math.round((Date.now() - new Date(lastRun.createdAt).getTime()) / 60_000) : null;
  out.checks.catalog = { ok: jobs > 0 && embedded / Math.max(1, jobs) > 0.8, jobs, embeddedPct: jobs ? Math.round((100 * embedded) / jobs) : 0, newLast24h: freshJobs };
  out.checks.agents = { ok: failed24h < 5 && (lastRunAgeMin === null || lastRunAgeMin < 180), lastRun: lastRun ? { title: lastRun.title, status: lastRun.status, ageMin: lastRunAgeMin } : null, queued, failed24h };
  out.checks.config = {
    openai: !!process.env.OPENAI_API_KEY,
    email: mailTransportName(),
    whatsapp: channelConfigured("whatsapp"),
    telegram: channelConfigured("telegram"),
    s3: !!(process.env.AWS_ACCESS_KEY_ID && process.env.S3_BUCKET_NAME),
    puppeteer: !!process.env.PUPPETEER_SERVER_URL,
    googleOAuth: !!process.env.GOOGLE_CLIENT_ID,
    cronSecret: !!process.env.CRON_SECRET,
    appUrl: process.env.APP_URL || null,
    features: featureSnapshot(),
  };
  out.checks.config.ok = out.checks.config.openai && out.checks.config.cronSecret;
  out.checks.product = { users, resolvedOutcomes: outcomes, verifiedInsiders: insiders };
  out.checks.usageToday = Object.fromEntries(Object.keys({ ...DEFAULT_LIMITS, ...usage }).map((k) => [k, { used: usage[k] || 0, limitPerUser: limitFor(k) }]));
  out.ok = out.checks.db.ok && out.checks.catalog.ok && out.checks.agents.ok && out.checks.config.ok;
  return NextResponse.json(out, { status: out.ok ? 200 : 207, headers: { "Cache-Control": "private, no-store" } });
}
