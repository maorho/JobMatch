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
export async function ensureInterviewPlan(opts: { userId: string; jobId: string; source: PrepSource; force?: boolean; language?: "he" | "en" }): Promise<EnsurePlanResult | null> {
  const { userId, jobId, source } = opts;
  await connectToDatabase();
  if (!opts.force) {
    const cached: any = await InterviewPrep.findOne({ userId, jobId, source }).lean();
    if (cached) return { prepId: String(cached._id), cached: true, job: { title: cached.jobTitle, company: cached.company }, plan: cached.plan, techSignals: [] };
  }
  const job = await loadJobForPrep(source, jobId);
  if (!job) return null;

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
    { $set: { jobTitle: job.title, company: job.company, plan, model: PREP_MODEL } },
    { upsert: true, new: true }
  );
  return { prepId: String(doc._id), cached: false, job: { title: job.title, company: job.company }, plan, techSignals: companyContext.techSignals };
}
