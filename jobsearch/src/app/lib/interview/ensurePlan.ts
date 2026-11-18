import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";
import Job from "@/app/models/Job";
import Company from "@/app/models/Company";
import ExternalJobs from "@/app/models/ExternalJobs";
import InterviewPrep from "@/app/models/InterviewPrep";
import { gatherCompanyContext } from "./companyContext";
import { researchCompany, researchToText } from "./companyResearch";
import { reportedQuestionsText } from "@/app/lib/outcomes/questions";
import { ensureWebQuestions } from "./webQuestions";
import { generateInterviewPlan, PREP_MODEL, type InterviewPlan } from "./prepare";
import { structuredToText, isStructuredResume } from "@/app/lib/resume/structuredToText";

export type PrepSource = "internal" | "external";

export async function loadJobForPrep(source: PrepSource, jobId: string) {
  await connectToDatabase();
  if (source === "internal") {
    const j: any = await Job.findById(jobId).populate({ path: "company", model: Company, select: "companyName" }).lean();
    return j
      ? { title: j.job, company: j.company?.companyName || "", description: [j.description, j.qualifications].filter(Boolean).join("\n\n"), seniority: [] as string[] }
      : null;
  }
  const j: any = await ExternalJobs.findById(jobId).lean();
  return j ? { title: j.job, company: j.company, description: j.description || "", seniority: (j.seniority || []) as string[] } : null;
}

export type EnsurePlanResult = {
  prepId: string;
  cached: boolean;
  job: { title: string; company: string };
  plan: InterviewPlan;
  techSignals: { term: string; count: number }[];
};

/**
 * The user's interview plan for a job: the cached one, or a freshly generated
 * one (expensive LLM call) stored for next time. `force` regenerates.
 */
/** A generation older than this is a crashed one: the next request may start over. */
export const GENERATION_LOCK_MS = 3 * 60_000;

/** The stored plan, or whether one is being generated right now (for GET and for the client's polling). */
export async function interviewPlanStatus(userId: string, jobId: string, source: PrepSource): Promise<{ status: "ready"; prepId: string; job: { title: string; company: string }; plan: InterviewPlan } | { status: "generating"; startedAt: Date } | { status: "none" }> {
  await connectToDatabase();
  const doc: any = await InterviewPrep.findOne({ userId, jobId, source }).lean();
  if (doc?.plan) return { status: "ready", prepId: String(doc._id), job: { title: doc.jobTitle, company: doc.company }, plan: doc.plan };
  if (doc?.generatingAt && Date.now() - new Date(doc.generatingAt).getTime() < GENERATION_LOCK_MS) return { status: "generating", startedAt: doc.generatingAt };
  return { status: "none" };
}

export async function ensureInterviewPlan(opts: { userId: string; jobId: string; source: PrepSource; force?: boolean; language?: "he" | "en" }): Promise<EnsurePlanResult | { pending: true; startedAt: Date } | null> {
  const { userId, jobId, source } = opts;
  await connectToDatabase();
  if (!opts.force) {
    const cached: any = await InterviewPrep.findOne({ userId, jobId, source }).lean();
    if (cached?.plan) return { prepId: String(cached._id), cached: true, job: { title: cached.jobTitle, company: cached.company }, plan: cached.plan, techSignals: [] };
  }
  const job = await loadJobForPrep(source, jobId);
  if (!job) return null;
  // Take the lock: one generation per (user, job). A second request (double-click, refresh, another tab) while it runs
  // is told to wait and poll instead of paying for a second one. A stale lock (crashed run) is taken over.
  const now = new Date();
  const taken: any = await InterviewPrep.findOneAndUpdate(
    { userId, jobId, source, $or: [{ generatingAt: null }, { generatingAt: { $exists: false } }, { generatingAt: { $lt: new Date(now.getTime() - GENERATION_LOCK_MS) } }, ...(opts.force ? [] : [{ plan: { $ne: null } }])] },
    { $set: { generatingAt: now, jobTitle: job.title, company: job.company }, $setOnInsert: { plan: null } },
    { upsert: true, new: true }
  ).catch((e: any) => (e?.code === 11000 ? null : Promise.reject(e)));
  if (!taken) {
    const other: any = await InterviewPrep.findOne({ userId, jobId, source }).select("generatingAt").lean();
    return { pending: true, startedAt: other?.generatingAt || now };
  }
  try {

  const user: any = await User.findById(userId).select("+resumeText +resumeStructured").lean();
  const resumeText = (user?.resumeText || "").trim() || (isStructuredResume(user?.resumeStructured) ? structuredToText(user.resumeStructured) : "");
  const companyContext = await gatherCompanyContext(job.company, { fetchWebsite: process.env.NODE_ENV !== "test" });
  // The research brief is worth ~15s on a cold company; cached a week afterwards. Never blocks the plan on failure.
  const research = process.env.NODE_ENV === "test" ? null : await Promise.race([
    researchCompany(job.company, { domain: companyContext.domain, hints: { openRoles: companyContext.openRoles, sampleTitles: companyContext.sampleTitles, techSignals: companyContext.techSignals.slice(0, 10).map((t) => t.term) } }).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), 40_000)),
  ]);
  await ensureWebQuestions(job.company, { domain: companyContext.domain, sampleTitles: companyContext.sampleTitles }); // once a month per company; cached otherwise
  const reportedQuestions = await reportedQuestionsText(job.company, { limit: 20 }).catch(() => "");
  const plan = await generateInterviewPlan({ job, companyContext, research: research ? researchToText(research.brief) : undefined, reportedQuestions: reportedQuestions || undefined, resumeText, language: opts.language || "he" });

  const doc: any = await InterviewPrep.findOneAndUpdate(
    { userId, jobId, source },
    { $set: { jobTitle: job.title, company: job.company, plan, model: PREP_MODEL, generatingAt: null } },
    { upsert: true, new: true }
  );
  return { prepId: String(doc._id), cached: false, job: { title: job.title, company: job.company }, plan, techSignals: companyContext.techSignals };
  } catch (e) {
    // Release the lock so a retry can start at once instead of waiting out the stale window.
    await InterviewPrep.updateOne({ userId, jobId, source, plan: null }, { $set: { generatingAt: null } }).catch(() => {});
    throw e;
  }
}
