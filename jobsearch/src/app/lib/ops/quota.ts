import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import UsageCounter from "@/app/models/UsageCounter";

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
};

export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
export const limitFor = (key: string) => {
  const env = process.env[`QUOTA_${key.toUpperCase()}`];
  const n = env ? parseInt(env, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_LIMITS[key] ?? 50;
};

export class QuotaError extends Error {
  constructor(public key: string, public limit: number, public used: number) {
    super(`Daily limit reached for ${key} (${used}/${limit})`);
  }
}

/** Count one use; throws QuotaError when the day's limit is already spent. Returns what is left. */
export async function consumeQuota(userId: string | mongoose.Types.ObjectId, key: string, opts: { cost?: number } = {}): Promise<{ used: number; limit: number; remaining: number }> {
  if (process.env.NODE_ENV === "test" && !process.env.QUOTA_ENFORCE_IN_TESTS) return { used: 0, limit: limitFor(key), remaining: limitFor(key) };
  await connectToDatabase();
  const limit = limitFor(key);
  const day = dayKey();
  const cost = opts.cost ?? 1;
  const row: any = await UsageCounter.findOneAndUpdate({ userId, day, key }, { $inc: { n: cost }, $setOnInsert: { userId, day, key } }, { upsert: true, new: true }).lean();
  if (row.n > limit) {
    await UsageCounter.updateOne({ _id: row._id }, { $inc: { n: -cost } }); // not counted when refused
    throw new QuotaError(key, limit, row.n - cost);
  }
  return { used: row.n, limit, remaining: Math.max(0, limit - row.n) };
}

/** The response a route sends when consumeQuota throws (429 + a Hebrew hint the UI can show as is). */
export function quotaResponse(e: unknown): NextResponse | null {
  if (!(e instanceof QuotaError)) return null;
  return NextResponse.json({ ok: false, error: "quota", key: e.key, limit: e.limit, message: `הגעת למכסה היומית (${e.limit}). נסו שוב מחר, או כתבו לנו אם צריך יותר.` }, { status: 429, headers: { "Retry-After": "3600" } });
}

/** Today's totals across everyone (for the health page). */
export async function usageToday(): Promise<Record<string, number>> {
  await connectToDatabase();
  const rows: any[] = await UsageCounter.aggregate([{ $match: { day: dayKey() } }, { $group: { _id: "$key", n: { $sum: "$n" } } }]);
  return Object.fromEntries(rows.map((r) => [r._id, r.n]));
}
