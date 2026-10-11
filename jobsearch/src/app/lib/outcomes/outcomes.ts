import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
import ApplicationOutcome, { type Outcome, type OutcomeFeatures, type StageReached } from "@/app/models/ApplicationOutcome";
import ApplicationEvent from "@/app/models/ApplicationEvent";
import Candidates from "@/app/models/Candidates";
import ExternalJobs from "@/app/models/ExternalJobs";
import Job from "@/app/models/Job";
import MatchCache from "@/app/models/MatchCache";
import User from "@/app/models/User";
import { getCandidateVector } from "@/app/lib/matcher/candidateProfile";
import { cosineSimilarity, toMatchScore } from "@/app/lib/matcher/cosine";
import { inferCandidateLevel, levelFit, type CandidateLevel } from "@/app/lib/matcher/level";
import { contactsAtCompany } from "@/app/lib/contacts/linkedin";
import { seniorityOf } from "@/app/lib/jobTaxonomy";

/**
 * The outcome loop. Every application gets an ApplicationOutcome row with the
 * matching features frozen at apply time; the row is resolved later by the
 * candidate's answer, the Gmail tracker, a recruiter, or a timeout. Those
 * resolved rows are what the interview-likelihood model trains on
 * (lib/matcher/likelihood.ts).
 */

export { companyKey } from "./companyKey";
import { companyKey } from "./companyKey";

const DAY = 86_400_000;
/** Ask "did you get a reply?" from this many days after applying, then every REASK_DAYS, up to MAX_ASKS. */
export const FIRST_ASK_DAYS = 7;
export const REASK_DAYS = 7;
export const MAX_ASKS = 3;
/** With no answer from anyone by then, the application counts as "no reply". */
export const NO_REPLY_DAYS = 45;
/** Ask "what did they ask?" this many days after an interview stage was reached. */
export const QUESTIONS_ASK_DAYS = 3;
export const QUESTIONS_MAX_ASKS = 2;

const RANK: Record<StageReached, number> = { none: 0, screen: 1, interview: 2, offer: 3 };
const STATUS_TO_OUTCOME: Record<string, Outcome> = {
  "Submitted Resume": "pending",
  "HR Phone Interview": "screen",
  "Technical Interview": "interview",
  "Final Interview": "interview",
  "Recived an Offer": "offer",
  Accepted: "offer",
  Rejected: "rejected",
};
const OUTCOME_TO_STATUS: Record<Outcome, string | null> = { pending: null, no_reply: null, rejected: "Rejected", screen: "HR Phone Interview", interview: "Technical Interview", offer: "Recived an Offer" };
const STATUS_RANK: Record<string, number> = { "Submitted Resume": 0, Rejected: 1, "HR Phone Interview": 2, "Technical Interview": 3, "Final Interview": 4, "Recived an Offer": 5, Accepted: 6 };

export const outcomeFromStatus = (status: string): Outcome => STATUS_TO_OUTCOME[status] ?? "pending";
export const stageOfOutcome = (o: Outcome): StageReached => (o === "screen" ? "screen" : o === "interview" ? "interview" : o === "offer" ? "offer" : "none");
/** Positive label for the likelihood model: the candidate got (at least) a screening call. */
export const isPositive = (reached: StageReached) => RANK[reached] >= RANK.screen;

async function loadJobLite(jobId: string, jobModel: string): Promise<any | null> {
  if (!mongoose.isValidObjectId(jobId)) return null;
  if (jobModel === "ExternalJobs") return ExternalJobs.findById(jobId).select("job company seniority remote postedAt firstSeenAt +embedding").lean();
  return Job.findById(jobId).populate("company", "companyName").select("job company seniority type createdAt").lean();
}

/** Freeze the matching signals for (user, job) as they are right now. */
export async function snapshotFeatures(userId: string, jobId: string, jobModel: string, extra: { score?: number | null; autoApplied?: boolean } = {}): Promise<{ features: OutcomeFeatures; company: string; title: string }> {
  await connectToDatabase();
  const [job, user, vec]: [any, any, number[] | null] = await Promise.all([loadJobLite(jobId, jobModel), User.findById(userId).select("level currentJob resumeUpdatedAt +resumeText").lean(), getCandidateVector(userId).catch(() => null)]);
  const company = jobModel === "ExternalJobs" ? job?.company || "" : job?.company?.companyName || "";
  const title = job?.job || "";
  const level: CandidateLevel = user?.level || inferCandidateLevel(user?.resumeText || "", user?.currentJob || "");
  const cosine = vec && Array.isArray(job?.embedding) && job.embedding.length ? cosineSimilarity(vec, job.embedding) : null;
  const lf = job ? levelFit(level, title, job.seniority) : null;
  const cached: any = user ? await MatchCache.findOne({ userId, jobId, resumeVersion: user.resumeUpdatedAt ? new Date(user.resumeUpdatedAt).getTime() : 0 }).select("fit").lean() : null;
  const blended = cosine !== null && lf !== null ? Math.round(toMatchScore(cosine) * (0.55 + 0.45 * lf)) : null;
  const posted = job?.postedAt || job?.firstSeenAt || job?.createdAt;
  const hasReferral = company ? (await contactsAtCompany(userId, company, 1).catch(() => [])).length > 0 : false;
  const seniority = Array.isArray(job?.seniority) ? job.seniority[0] || "" : job?.seniority || "";
  return {
    company,
    title,
    features: {
      matchScore: extra.score ?? cached?.fit ?? blended,
      cosine,
      levelFit: lf,
      rerankFit: cached?.fit ?? null,
      level,
      jobSeniority: String(seniority || seniorityOf(title, job?.seniority) || "").toLowerCase(),
      remote: !!job?.remote || /remote/i.test(job?.type || ""),
      postedAgeDays: posted ? Math.max(0, Math.round((Date.now() - new Date(posted).getTime()) / DAY)) : null,
      autoApplied: !!extra.autoApplied,
      hasReferral,
      jobModel,
    },
  };
}

/** Create the outcome row for an application if it doesn't exist yet (idempotent; best-effort). */
export async function ensureOutcome(userId: string, applicationId: string, extra: { score?: number | null; autoApplied?: boolean } = {}): Promise<any | null> {
  try {
    await connectToDatabase();
    const existing = await ApplicationOutcome.findOne({ applicationId }).lean();
    if (existing) return existing;
    const app: any = await Candidates.findById(applicationId).lean();
    if (!app || String(app.candidateId) !== String(userId)) return null;
    const { features, company, title } = await snapshotFeatures(userId, String(app.jobId), app.jobModel, extra);
    const initial = outcomeFromStatus(app.status);
    const doc = await ApplicationOutcome.create({
      userId,
      applicationId,
      jobId: app.jobId,
      jobModel: app.jobModel,
      company,
      companyKey: companyKey(company),
      title,
      appliedAt: app.createdAt || new Date(),
      features,
      outcome: initial,
      reached: stageOfOutcome(initial),
      ...(initial !== "pending" ? { respondedAt: new Date(), source: "user" } : {}),
      ...(isPositive(stageOfOutcome(initial)) ? { stageAt: new Date() } : {}),
    });
    return doc.toObject();
  } catch (e) {
    console.warn("[outcomes] ensureOutcome skipped:", (e as Error)?.message);
    return null;
  }
}

/** Backfill outcome rows for every application of a user that doesn't have one yet. */
export async function ensureOutcomesForUser(userId: string, limit = 50): Promise<number> {
  await connectToDatabase();
  const apps: any[] = await Candidates.find({ candidateId: userId }).select("_id").sort({ createdAt: -1 }).limit(limit).lean();
  const have = new Set((await ApplicationOutcome.find({ userId, applicationId: { $in: apps.map((a) => a._id) } }).select("applicationId").lean()).map((o: any) => String(o.applicationId)));
  let n = 0;
  for (const a of apps) if (!have.has(String(a._id))) n += (await ensureOutcome(userId, String(a._id))) ? 1 : 0;
  return n;
}

export type RecordInput = { userId: string; applicationId: string; outcome: Outcome; source: (typeof import("@/app/models/ApplicationOutcome").OUTCOME_SOURCES)[number]; note?: string; syncStatus?: boolean };

/**
 * Record what happened. Moves the application status forward when the news
 * is "better" than the current status (never backwards from an email; a
 * candidate's explicit answer can set any state). Returns the updated row.
 */
export async function recordOutcome(input: RecordInput): Promise<any | null> {
  await connectToDatabase();
  const row: any = (await ApplicationOutcome.findOne({ applicationId: input.applicationId, userId: input.userId }).lean()) || (await ensureOutcome(input.userId, input.applicationId));
  if (!row) return null;
  const now = new Date();
  const stage = stageOfOutcome(input.outcome);
  const reached: StageReached = RANK[stage] > RANK[row.reached as StageReached] ? stage : row.reached;
  const responded = input.outcome !== "pending" && input.outcome !== "no_reply";
  const set: Record<string, unknown> = { outcome: input.outcome, reached, source: input.source };
  if (responded && !row.respondedAt) {
    set.respondedAt = now;
    set.firstResponseDays = Math.max(0, Math.round((now.getTime() - new Date(row.appliedAt).getTime()) / DAY));
  }
  if (input.outcome !== "pending") set.resolvedAt = now;
  if (isPositive(stage) && RANK[stage] > RANK[row.reached as StageReached]) set.stageAt = now;
  await ApplicationOutcome.updateOne({ _id: row._id }, { $set: set });

  // Keep the application status in step (forward only, except an explicit user answer).
  if (input.syncStatus !== false) {
    const status = OUTCOME_TO_STATUS[input.outcome];
    const app: any = await Candidates.findById(input.applicationId).select("status").lean();
    if (status && app && (input.source === "user" || input.source === "mcp" || (STATUS_RANK[status] ?? 0) > (STATUS_RANK[app.status] ?? 0)) && app.status !== status) {
      await Candidates.updateOne({ _id: input.applicationId }, { $set: { status } });
      await ApplicationEvent.create({ userId: input.userId, applicationId: input.applicationId, source: input.source === "email" ? "email" : input.source === "recruiter" ? "recruiter" : "manual", status, company: row.company, roleTitle: row.title, summary: input.note || "", confidence: 1, applied: true }).catch(() => null);
    }
  }
  return ApplicationOutcome.findById(row._id).lean();
}

/** A status changed elsewhere (tracker, recruiter): mirror it into the outcome row without touching Candidates again. */
export async function recordStatusChange(userId: string, applicationId: string, status: string, source: "email" | "recruiter" | "user"): Promise<void> {
  const outcome = outcomeFromStatus(status);
  if (outcome === "pending") return;
  await recordOutcome({ userId, applicationId, outcome, source, syncStatus: false }).catch((e) => console.warn("[outcomes] recordStatusChange skipped:", (e as Error)?.message));
}

export type DuePrompts = {
  replies: { outcomeId: string; applicationId: string; title: string; company: string; appliedAt: Date; daysAgo: number; askCount: number }[];
  questions: { outcomeId: string; applicationId: string; title: string; company: string; stage: "hr" | "technical" | "final"; reached: StageReached; stageAt: Date }[];
};

const stageKeyOf = (reached: StageReached): "hr" | "technical" | "final" => (reached === "screen" ? "hr" : reached === "offer" ? "final" : "technical");

/** What to ask this user right now (dashboard card). `now` is injectable for tests. */
export async function duePrompts(userId: string, now = new Date()): Promise<DuePrompts> {
  await connectToDatabase();
  await ensureOutcomesForUser(userId).catch(() => 0);
  const rows: any[] = await ApplicationOutcome.find({ userId, $or: [{ outcome: { $in: ["pending", "no_reply"] } }, { reached: { $in: ["screen", "interview", "offer"] } }] }).sort({ appliedAt: -1 }).limit(100).lean();
  const t = now.getTime();
  const replies: DuePrompts["replies"] = [];
  const questions: DuePrompts["questions"] = [];
  for (const r of rows) {
    if (r.outcome === "pending" || r.outcome === "no_reply") {
      const age = (t - new Date(r.appliedAt).getTime()) / DAY;
      const sinceAsk = r.askedAt ? (t - new Date(r.askedAt).getTime()) / DAY : Infinity;
      if (age >= FIRST_ASK_DAYS && r.askCount < MAX_ASKS && sinceAsk >= REASK_DAYS && age < NO_REPLY_DAYS + REASK_DAYS * MAX_ASKS) {
        replies.push({ outcomeId: String(r._id), applicationId: String(r.applicationId), title: r.title, company: r.company, appliedAt: r.appliedAt, daysAgo: Math.round(age), askCount: r.askCount });
      }
    }
    if (isPositive(r.reached) && r.stageAt) {
      const stage = stageKeyOf(r.reached);
      const since = (t - new Date(r.stageAt).getTime()) / DAY;
      const sinceAsk = r.questionsAskedAt ? (t - new Date(r.questionsAskedAt).getTime()) / DAY : Infinity;
      const done = (r.questionsCaptured || []).includes(stage) || (r.questionsSkipped || []).includes(stage);
      if (!done && since >= QUESTIONS_ASK_DAYS && r.questionsAskCount < QUESTIONS_MAX_ASKS && sinceAsk >= REASK_DAYS) {
        questions.push({ outcomeId: String(r._id), applicationId: String(r.applicationId), title: r.title, company: r.company, stage, reached: r.reached, stageAt: r.stageAt });
      }
    }
  }
  return { replies, questions };
}

/** Mark the prompts as asked (so a notification is sent once per cadence). */
export async function markAsked(due: DuePrompts, now = new Date()): Promise<void> {
  await connectToDatabase();
  if (due.replies.length) await ApplicationOutcome.updateMany({ _id: { $in: due.replies.map((r) => r.outcomeId) } }, { $set: { askedAt: now }, $inc: { askCount: 1 } });
  if (due.questions.length) await ApplicationOutcome.updateMany({ _id: { $in: due.questions.map((q) => q.outcomeId) } }, { $set: { questionsAskedAt: now }, $inc: { questionsAskCount: 1 } });
}

/** Applications nobody answered about for NO_REPLY_DAYS: close them as "no reply" so the model can learn from them. */
export async function expireUnanswered(now = new Date()): Promise<number> {
  await connectToDatabase();
  const r = await ApplicationOutcome.updateMany({ outcome: "pending", appliedAt: { $lt: new Date(now.getTime() - NO_REPLY_DAYS * DAY) } }, { $set: { outcome: "no_reply", source: "timeout", resolvedAt: now } });
  return r.modifiedCount || 0;
}

/** Users who have something to be asked right now (for the cron tick). */
export async function usersWithDuePrompts(now = new Date(), limit = 200): Promise<string[]> {
  await connectToDatabase();
  const t = now.getTime();
  const ids: any[] = await ApplicationOutcome.aggregate([
    {
      $match: {
        $or: [
          { outcome: { $in: ["pending", "no_reply"] }, appliedAt: { $lte: new Date(t - FIRST_ASK_DAYS * DAY) }, askCount: { $lt: MAX_ASKS }, $and: [{ $or: [{ askedAt: { $exists: false } }, { askedAt: { $lte: new Date(t - REASK_DAYS * DAY) } }] }] },
          {
            reached: { $in: ["screen", "interview", "offer"] },
            stageAt: { $lte: new Date(t - QUESTIONS_ASK_DAYS * DAY) },
            questionsAskCount: { $lt: QUESTIONS_MAX_ASKS },
            $and: [
              { $or: [{ questionsAskedAt: { $exists: false } }, { questionsAskedAt: { $lte: new Date(t - REASK_DAYS * DAY) } }] },
              // the stage's key (hr/technical/final) must not be captured or skipped already
              { $expr: { $not: { $in: [{ $switch: { branches: [{ case: { $eq: ["$reached", "screen"] }, then: "hr" }, { case: { $eq: ["$reached", "offer"] }, then: "final" }], default: "technical" } }, { $concatArrays: [{ $ifNull: ["$questionsCaptured", []] }, { $ifNull: ["$questionsSkipped", []] }] }] } } },
            ],
          },
        ],
      },
    },
    { $group: { _id: "$userId" } },
    { $limit: limit },
  ]);
  return ids.map((d) => String(d._id));
}

/** Summary for the dashboard: funnel counts + response times. */
export async function outcomeStats(userId: string): Promise<{ total: number; replied: number; interviews: number; offers: number; rejected: number; medianResponseDays: number | null }> {
  await connectToDatabase();
  const rows: any[] = await ApplicationOutcome.find({ userId }).select("outcome reached firstResponseDays").lean();
  const days = rows.map((r) => r.firstResponseDays).filter((d) => typeof d === "number").sort((a, b) => a - b);
  return {
    total: rows.length,
    replied: rows.filter((r) => r.outcome !== "pending" && r.outcome !== "no_reply").length,
    interviews: rows.filter((r) => isPositive(r.reached)).length,
    offers: rows.filter((r) => r.reached === "offer").length,
    rejected: rows.filter((r) => r.outcome === "rejected").length,
    medianResponseDays: days.length ? days[Math.floor(days.length / 2)] : null,
  };
}
