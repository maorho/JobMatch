import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import UsageCounter from "@/app/models/UsageCounter";
import { enterUsageScope } from "@/app/lib/llm/usageMeter";
import User from "@/app/models/User";

/**
 * Daily caps per person on the actions that cost real money, so one account
 * (or one bug in a loop) can't run up the OpenAI bill. Limits are generous
 * for honest use and overridable per key with QUOTA_<KEY>=n in the env.
 */
export const DEFAULT_LIMITS: Record<string, number> = {
  practice_grade: 30, // graded submissions
  practice_author: 10, // catalogue top-ups a single person can trigger (authoring is per role × level, shared)
  interview_session: 8, // mock interviews (text)
  voice_session: 5, // realtime voice minutes are the priciest thing we do
  prep_plan: 10, // interview plans generated
  resume_chat: 80, // ResumeAI messages
  resume_build: 10, // full résumé generations
  tailor: 15, // résumé tailored to a posting
  research: 10, // company research briefs a person can trigger (cached per company anyway)
  explain: 60, // "why this match" verdicts (cached per résumé version, but the first look costs a rerank call)
  practice_turn: 200, // mock-interview turns on a prep plan (stateless practice)
  outreach: 30, // referral messages drafted
  outcome_questions: 30, // "what did they ask?" captures structured by the LLM
  interview_turn: 300, // simulator turns (PATCH on a session)
  progress_rebuild: 5, // coach-memory rebuilds a person can force per day
  mcp_matches: 60, // MCP my_matches (ranks + reranks)
  mcp_prep: 20, // MCP interview_prep (plan generation)
  mcp_apply: 10, // MCP apply_to_job (tailor + Applier)
  question_answer: 40, // suggested answers to company interview questions (cached per résumé version)
};

/**
 * While the service is free, a fresh account gets a much smaller allowance for
 * its first days: enough to try everything, not enough to run up a bill before
 * we know the person is real. Override with QUOTA_NEW_USER_DAYS and QUOTA_NEW_<KEY>.
 */
export const NEW_USER_DAYS = () => {
  const n = parseInt(process.env.QUOTA_NEW_USER_DAYS || "", 10);
  return Number.isFinite(n) && n >= 0 ? n : 7;
};
export const NEW_USER_LIMITS: Record<string, number> = {
  practice_grade: 8,
  practice_author: 2,
  interview_session: 2,
  voice_session: 1,
  prep_plan: 3,
  resume_chat: 25,
  resume_build: 2,
  tailor: 3,
  research: 3,
  explain: 20,
  practice_turn: 40,
  outreach: 5,
  outcome_questions: 10,
  interview_turn: 60,
  progress_rebuild: 1,
  mcp_matches: 10,
  mcp_prep: 3,
  mcp_apply: 2,
  question_answer: 10,
};

/**
 * The free plan: a monthly allowance on the features that cost real money
 * (interview simulations, voice calls, plans, tailoring, résumé generation…),
 * on top of the daily caps. A "pro" account or an admin has only the daily
 * caps. Override per key with QUOTA_MONTH_<KEY>=n. Keys not listed here are
 * capped per day only.
 */
export const FREE_MONTHLY_LIMITS: Record<string, number> = {
  voice_session: 4,
  interview_session: 8,
  prep_plan: 8,
  tailor: 8,
  resume_build: 5,
  resume_chat: 200,
  research: 10,
  practice_grade: 60,
  practice_author: 5,
  practice_turn: 150,
  outreach: 20,
  question_answer: 30,
  mcp_prep: 8,
  mcp_apply: 5,
};
/** What the Settings page lists (the user-facing features; the MCP keys ride on the same counters). */
export const USAGE_KEYS = ["interview_session", "voice_session", "prep_plan", "tailor", "resume_build", "resume_chat", "practice_grade", "research", "outreach", "question_answer"] as const;

export const monthlyLimitFor = (key: string): number | null => {
  const env = process.env[`QUOTA_MONTH_${key.toUpperCase()}`];
  const n = env ? parseInt(env, 10) : NaN;
  if (Number.isFinite(n) && n >= 0) return n;
  return FREE_MONTHLY_LIMITS[key] ?? null;
};

export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
/** Month rows share the day counter's collection under a "YYYY-MM" key. */
export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);
export const limitFor = (key: string, opts: { newAccount?: boolean } = {}): number => {
  if (opts.newAccount) {
    const env = process.env[`QUOTA_NEW_${key.toUpperCase()}`];
    const n = env ? parseInt(env, 10) : NaN;
    if (Number.isFinite(n) && n >= 0) return n;
    if (NEW_USER_LIMITS[key] !== undefined) return Math.min(NEW_USER_LIMITS[key], limitFor(key));
  }
  const env = process.env[`QUOTA_${key.toUpperCase()}`];
  const n = env ? parseInt(env, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_LIMITS[key] ?? 50;
};

// Account age and plan are looked up once per instance per 10 minutes, not per call.
type Account = { isNew: boolean; plan: "free" | "pro"; until: number };
const ageCache = new Map<string, Account>();
export async function accountFor(userId: string | mongoose.Types.ObjectId, now = Date.now()): Promise<{ isNew: boolean; plan: "free" | "pro" }> {
  const id = String(userId);
  const hit = ageCache.get(id);
  if (hit && hit.until > now) return hit;
  const u = await User.findById(id).select("createdAt plan admin").lean<{ createdAt?: Date; plan?: string; admin?: boolean }>().catch(() => null);
  const isNew = !!u?.createdAt && now - new Date(u.createdAt).getTime() < NEW_USER_DAYS() * 86_400_000;
  const plan: "free" | "pro" = u?.plan === "pro" || u?.admin ? "pro" : "free";
  ageCache.set(id, { isNew, plan, until: now + 10 * 60_000 });
  return { isNew, plan };
}
export async function isNewAccount(userId: string | mongoose.Types.ObjectId, now = Date.now()): Promise<boolean> {
  return (await accountFor(userId, now)).isNew;
}
/** Test hook. */
export const _resetAgeCache = () => ageCache.clear();

export class QuotaError extends Error {
  constructor(public key: string, public limit: number, public used: number, public period: "day" | "month" = "day") {
    super(`${period === "month" ? "Monthly" : "Daily"} limit reached for ${key} (${used}/${limit})`);
  }
}

/** Count one use; throws QuotaError when the day's limit is already spent. Returns what is left. */
export async function consumeQuota(userId: string | mongoose.Types.ObjectId, key: string, opts: { cost?: number } = {}): Promise<{ used: number; limit: number; remaining: number }> {
  // Everything this request spends on models from here on is booked to this person and this feature.
  enterUsageScope({ userId: String(userId), feature: key });
  if (process.env.NODE_ENV === "test" && !process.env.QUOTA_ENFORCE_IN_TESTS) return { used: 0, limit: limitFor(key), remaining: limitFor(key) };
  await connectToDatabase();
  const account = await accountFor(userId);
  const limit = limitFor(key, { newAccount: account.isNew });
  const day = dayKey();
  const cost = opts.cost ?? 1;
  type Row = { _id: mongoose.Types.ObjectId; n: number };
  const row = (await UsageCounter.findOneAndUpdate({ userId, day, key }, { $inc: { n: cost }, $setOnInsert: { userId, day, key } }, { upsert: true, new: true }).lean()) as unknown as Row;
  if (row.n > limit) {
    await UsageCounter.updateOne({ _id: row._id }, { $inc: { n: -cost } }); // not counted when refused
    throw new QuotaError(key, limit, row.n - cost);
  }
  // The free plan's monthly allowance, on the same counters under the month key.
  const monthly = account.plan === "free" ? monthlyLimitFor(key) : null;
  if (monthly !== null) {
    const month = monthKey();
    const mrow = (await UsageCounter.findOneAndUpdate({ userId, day: month, key }, { $inc: { n: cost }, $setOnInsert: { userId, day: month, key } }, { upsert: true, new: true }).lean()) as unknown as Row;
    if (mrow.n > monthly) {
      await Promise.all([UsageCounter.updateOne({ _id: mrow._id }, { $inc: { n: -cost } }), UsageCounter.updateOne({ _id: row._id }, { $inc: { n: -cost } })]);
      throw new QuotaError(key, monthly, mrow.n - cost, "month");
    }
  }
  return { used: row.n, limit, remaining: Math.max(0, limit - row.n) };
}

/** What a person has used this month against the free plan (for Settings). */
export async function usageForUser(userId: string | mongoose.Types.ObjectId): Promise<{ plan: "free" | "pro"; newAccount: boolean; month: string; features: { key: string; used: number; limit: number | null }[] }> {
  await connectToDatabase();
  const account = await accountFor(userId);
  const month = monthKey();
  const rows = (await UsageCounter.find({ userId, day: month, key: { $in: [...USAGE_KEYS] } }).select("key n").lean()) as unknown as { key: string; n: number }[];
  const used = new Map(rows.map((r) => [r.key, r.n]));
  return {
    plan: account.plan,
    newAccount: account.isNew,
    month,
    features: USAGE_KEYS.map((key) => ({ key, used: used.get(key) || 0, limit: account.plan === "free" ? monthlyLimitFor(key) : null })),
  };
}

/** The response a route sends when consumeQuota throws (429 + a hint in both languages the UI can show as is). */
export function quotaResponse(e: unknown): NextResponse | null {
  if (!(e instanceof QuotaError)) return null;
  const month = e.period === "month";
  return NextResponse.json(
    {
      ok: false,
      error: "quota",
      key: e.key,
      limit: e.limit,
      period: e.period,
      message: month ? `הגעת למכסה החודשית של החשבון החינמי (${e.limit}). המכסה מתחדשת בתחילת החודש; כתבו לנו אם צריך יותר.` : `הגעת למכסה היומית (${e.limit}). נסו שוב מחר, או כתבו לנו אם צריך יותר.`,
      messageEn: month ? `You've reached this month's free-plan allowance (${e.limit}). It resets at the start of next month; write to us if you need more.` : `You've reached today's limit (${e.limit}). Try again tomorrow, or write to us if you need more.`,
    },
    { status: 429, headers: { "Retry-After": month ? "86400" : "3600" } }
  );
}

/** Today's totals across everyone (for the health page). */
export async function usageToday(): Promise<Record<string, number>> {
  await connectToDatabase();
  const rows = (await UsageCounter.aggregate([{ $match: { day: dayKey() } }, { $group: { _id: "$key", n: { $sum: "$n" } } }])) as { _id: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r._id, r.n]));
}
