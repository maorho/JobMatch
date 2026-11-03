import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
import { requireAdmin } from "@/app/lib/authGuard";
import { requireCron } from "@/app/lib/cron/requireCron";
import { costSummary, breachesOf } from "@/app/lib/ops/costMonitor";
import User from "@/app/models/User";
import ExternalJobs, { OPEN_JOBS } from "@/app/models/ExternalJobs";
import AgentRun from "@/app/models/AgentRun";
import AgentMessage from "@/app/models/AgentMessage";
import ApplicationOutcome from "@/app/models/ApplicationOutcome";
import Referrer from "@/app/models/Referrer";
import CompanySource from "@/app/models/CompanySource";
import Maintenance from "@/app/models/Maintenance";
import { usageToday, limitFor, DEFAULT_LIMITS } from "@/app/lib/ops/quota";
import { mailTransportName } from "@/app/lib/email/send";
import { channelConfigured } from "@/app/lib/messaging/channels";
import { featureSnapshot } from "@/app/lib/flags";
import { siteUrl } from "@/app/lib/seo/site";
import { describeModels } from "@/app/lib/llm/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A "processing" message older than this is wedged (same window the bus uses to retry). */
const STUCK_AFTER_MS = 10 * 60_000;
/** The queue is not draining when its oldest message has waited this long. */
const QUEUE_STALL_MIN = 120;
/** No source polled for this long means the Scout cron stopped. */
const POLL_STALL_MIN = 6 * 60;

/**
 * GET /api/admin/health — one page that says whether production is alive:
 * DB, catalogue freshness, the agents' queue and failures, what's configured,
 * and today's paid usage. Admin session or ?cron_secret=.
 */
export async function GET(req: NextRequest) {
  // Admin session OR the cron secret (Bearer / x-service-token / ?cron_secret=).
  const admin = requireCron(req) === null ? { admin: true } : await requireAdmin(req);
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
  const now = Date.now();
  const dayAgo = new Date(now - 86_400_000);
  const stuckBefore = new Date(now - STUCK_AFTER_MS);
  const [users, jobs, embedded, freshJobs, lastRun, queued, oldestQueued, stuck, failed24h, outcomes, insiders, usage, enabledSources, lastPolled, tick] = await Promise.all([
    User.estimatedDocumentCount(),
    ExternalJobs.countDocuments(OPEN_JOBS),
    ExternalJobs.countDocuments({ ...OPEN_JOBS, embeddedAt: { $exists: true } }),
    ExternalJobs.countDocuments({ firstSeenAt: { $gt: dayAgo } }),
    AgentRun.findOne().sort({ createdAt: -1 }).select("title status createdAt finishedAt").lean() as any,
    AgentMessage.countDocuments({ status: "queued" }),
    AgentMessage.findOne({ status: "queued" }).sort({ createdAt: 1 }).select("createdAt").lean() as any,
    // "processing" for longer than the bus's retry window: a lambda died (or froze) mid-handling.
    AgentMessage.countDocuments({ status: "processing", startedAt: { $lt: stuckBefore } }),
    AgentMessage.countDocuments({ status: "failed", updatedAt: { $gt: dayAgo }, error: { $not: /^expired/ } }), // week-old messages the bus expired are housekeeping, not failures
    ApplicationOutcome.countDocuments({ outcome: { $ne: "pending" } }),
    Referrer.countDocuments({ verifiedAt: { $ne: null }, active: true }),
    usageToday(),
    CompanySource.countDocuments({ enabled: true }),
    CompanySource.findOne({ lastPolledAt: { $ne: null } }).sort({ lastPolledAt: -1 }).select("lastPolledAt").lean() as any,
    Maintenance.findById("agentsTick").select("lastRunAt").lean() as any,
  ]);
  const ageMin = (d: Date | string | null | undefined) => (d ? Math.round((now - new Date(d).getTime()) / 60_000) : null);
  const lastRunAgeMin = ageMin(lastRun?.createdAt);
  const lastTickAgeMin = ageMin(tick?.lastRunAt); // when the bus was last drained (cron tick, inline trigger, worker)
  const oldestQueuedAgeMin = ageMin(oldestQueued?.createdAt);
  const lastSourcePolledAt: string | null = lastPolled?.lastPolledAt ? new Date(lastPolled.lastPolledAt).toISOString() : null;
  const lastPolledAgeMin = ageMin(lastPolled?.lastPolledAt);
  out.checks.catalog = { ok: jobs > 0 && embedded / Math.max(1, jobs) > 0.8, jobs, embeddedPct: jobs ? Math.round((100 * embedded) / jobs) : 0, newLast24h: freshJobs };
  out.checks.agents = {
    // Unhealthy when handlers fail, nobody drained the bus for 3 h, the queue is not draining (oldest queued > 2h), or something is wedged in "processing".
    // (A quiet night with no new postings creates no runs; that is not a fault, so the drain heartbeat is the liveness signal, not run recency.)
    ok: failed24h < 5 && (lastTickAgeMin === null || lastTickAgeMin < 180) && (oldestQueuedAgeMin === null || oldestQueuedAgeMin < QUEUE_STALL_MIN) && stuck === 0,
    lastRun: lastRun ? { title: lastRun.title, status: lastRun.status, ageMin: lastRunAgeMin } : null,
    lastTickAgeMin,
    queued,
    oldestQueuedAgeMin,
    stuck,
    failed24h,
  };
  // The Scout must have polled something recently, or the catalogue is quietly going stale.
  out.checks.scout = { ok: enabledSources === 0 || (lastPolledAgeMin !== null && lastPolledAgeMin < POLL_STALL_MIN), enabledSources, lastSourcePolledAt, lastPolledAgeMin };
  const appUrl = siteUrl();
  out.checks.config = {
    openai: !!process.env.OPENAI_API_KEY,
    llm: describeModels(),
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    email: mailTransportName(),
    whatsapp: channelConfigured("whatsapp"),
    telegram: channelConfigured("telegram"),
    s3: !!(process.env.AWS_ACCESS_KEY_ID && process.env.S3_BUCKET_NAME),
    puppeteer: !!process.env.PUPPETEER_SERVER_URL,
    googleOAuth: !!process.env.GOOGLE_CLIENT_ID,
    cronSecret: !!process.env.CRON_SECRET,
    appUrl: process.env.APP_URL || null,
    // Every absolute link (emails, sitemap, JSON-LD) comes from here: localhost in production is a misconfiguration.
    appUrlResolves: !(process.env.NODE_ENV === "production" && /localhost|127\.0\.0\.1/.test(appUrl)),
    features: featureSnapshot(),
  };
  out.checks.config.ok = out.checks.config.openai && out.checks.config.cronSecret && out.checks.config.appUrlResolves;
  out.checks.product = { users, resolvedOutcomes: outcomes, verifiedInsiders: insiders };
  // Spend: today, the last hour, one user, the bus — anything over its line (lib/ops/costMonitor.ts) makes production "needs attention"
  // and so fails the cron's hourly health job, which is the alert that reaches the admin's inbox without an email provider.
  const cost = await costSummary().catch(() => null);
  const costBreaches = cost ? breachesOf(cost) : [];
  out.checks.cost = cost ? { ok: costBreaches.length === 0, today: cost.today, lastHour: cost.lastHour, last7d: cost.last7d, limits: cost.limits, breaches: costBreaches } : { ok: true, unavailable: true };
  out.checks.usageToday = Object.fromEntries(Object.keys({ ...DEFAULT_LIMITS, ...usage }).map((k) => [k, { used: usage[k] || 0, limitPerUser: limitFor(k) }]));
  out.ok = out.checks.db.ok && out.checks.catalog.ok && out.checks.agents.ok && out.checks.scout.ok && out.checks.config.ok && out.checks.cost.ok;
  return NextResponse.json(out, { status: out.ok ? 200 : 207, headers: { "Cache-Control": "private, no-store" } });
}
