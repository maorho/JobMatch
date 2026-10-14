import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";
import Job from "@/app/models/Job";
import Company from "@/app/models/Company";
import ExternalJobs from "@/app/models/ExternalJobs";
import Candidates from "@/app/models/Candidates";
import { ensureOutcome } from "@/app/lib/outcomes/outcomes";
import AutoApplication from "@/app/models/AutoApplication";
import { notify } from "@/app/lib/notifications/notify";
import { tailorResumeToJob } from "@/app/lib/resume/tailor";
import { renderResumePdf } from "@/app/lib/resume/renderPdf";
import { isStructuredResume, type StructuredResume } from "@/app/lib/resume/structuredToText";
import { submitExternalApplication, splitName } from "./submit";
import { checkApplyServer, type ApplyServerHealth } from "./server";
import { FEATURES } from "@/app/lib/flags";
import { rankJobs } from "@/app/lib/matcher/hybrid";
import { inferCandidateLevel } from "@/app/lib/matcher/level";
import { answerFormFields } from "./formAgent";
import { structuredToText } from "@/app/lib/resume/structuredToText";

export type ApplyCandidate = { jobId: string; jobModel: "Job" | "ExternalJobs"; score: number; title: string; company: string };

export type ApplyOutcome = {
  submitted: { jobId: string; title: string; company: string; score: number }[];
  needsUser: { jobId: string; title: string; company: string; reason: string }[];
  failed: number;
  skipped: number;
  capped: number;
  /** Postings we could not even try (apply server down/busy/timed out before any click): no row is written, the next pass retries them. */
  deferred: number;
  disabled?: boolean;
};

export type AutoApplyDeps = {
  submit?: typeof submitExternalApplication;
  tailor?: typeof tailorResumeToJob;
  answer?: typeof answerFormFields;
  /** Reachability probe run once per pass before any tailoring (tests inject; default skips under NODE_ENV=test). */
  health?: () => Promise<ApplyServerHealth>;
  /** The user explicitly asked to apply to these postings (MCP/UI): ignore the opt-in switch and the score bar; keep dedupe + cap. */
  explicit?: boolean;
};

/** Failures that are the apply server's, not the form's — retry later, never record a verdict. */
const transientFailure = (r: { status: string; transient?: boolean; reason?: string }) =>
  r.status === "failed" && (r.transient === true || /unreachable|timed out|not configured|returned 5\d\d|busy/i.test(r.reason || ""));

const startOfToday = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

/**
 * The Applier agent's core. For each candidate posting (already scored by the
 * Matcher): respect the user's opt-in, threshold and daily cap; skip jobs the
 * user already applied to; apply for real to internal postings; for external
 * ones, tailor the résumé, render it, and let the form-filler try. Every
 * attempt is recorded in AutoApplication so the dashboard can show it.
 */
/** What the candidate sees when we pressed submit but never learned the result. */
export const UNKNOWN_OUTCOME_REASON = "ייתכן שההגשה נשלחה; בדוק/י מייל אישור לפני הגשה ידנית";

export async function autoApplyForUser(userId: string, candidates: ApplyCandidate[], deps: AutoApplyDeps = {}): Promise<ApplyOutcome> {
  await connectToDatabase();
  const out: ApplyOutcome = { submitted: [], needsUser: [], failed: 0, skipped: 0, capped: 0, deferred: 0 };
  if (!FEATURES.autoApply) {
    console.warn(`[autoApply] feature is off (FEATURE_AUTO_APPLY / PUPPETEER_SERVER_URL unset) — ${candidates.length} posting${candidates.length === 1 ? "" : "s"} for user ${userId} not applied to`);
    return { ...out, skipped: candidates.length, disabled: true };
  }
  const user: any = await User.findById(userId).select("+resumeText +resumeStructured fullname email phone currentJob autoApply").lean();
  if (!user) return { ...out, skipped: candidates.length, disabled: true };
  if (!deps.explicit && !user.autoApply?.enabled) return { ...out, skipped: candidates.length, disabled: true };

  // One reachability probe per pass, taken lazily before the first external posting
  // needs it, so an unreachable server costs nothing (no tailor LLM call per job).
  let health: ApplyServerHealth | null = null;
  const serverHealthy = async () => {
    if (!health) health = await (deps.health || (process.env.NODE_ENV === "test" ? async () => ({ ok: true }) : checkApplyServer))();
    return health;
  };

  const minScore = deps.explicit ? 0 : user.autoApply?.minScore ?? 75;
  const dailyCap = user.autoApply?.dailyCap ?? 5;
  let usedToday = await AutoApplication.countDocuments({ userId, status: "submitted", createdAt: { $gte: startOfToday() } });

  const { firstName, lastName } = splitName(user.fullname || "");
  const profile = { firstName, lastName, email: user.email || "", phone: user.phone || "" };
  const baseResume: StructuredResume | null = isStructuredResume(user.resumeStructured) ? user.resumeStructured : null;
  const canTailor = !!(process.env.OPENAI_API_KEY || process.env.NODE_ENV === "test");

  for (const c of [...candidates].sort((a, b) => b.score - a.score)) {
    if (c.score < minScore) {
      out.skipped++;
      continue;
    }
    if (await Candidates.exists({ candidateId: userId, jobId: c.jobId })) {
      out.skipped++;
      continue;
    }
    const prior: any = await AutoApplication.findOne({ userId, jobId: c.jobId }).select("status attempts claimedAt").lean();
    if (prior) {
      if (prior.status === "submitting") {
        // A claim with no verdict: the earlier attempt pressed (or was about to press) submit and then died.
        // We cannot know whether the form went through, so we never press again — the user checks the inbox.
        const reason = UNKNOWN_OUTCOME_REASON;
        await AutoApplication.updateOne({ _id: prior._id }, { $set: { status: "needs_user", note: `Outcome unknown: the previous attempt was interrupted after the submit step (${prior.claimedAt ? new Date(prior.claimedAt).toISOString() : "time unknown"}). Not resent. Check the inbox for a confirmation before applying by hand.` }, $inc: { attempts: 1 } });
        out.needsUser.push({ jobId: c.jobId, title: c.title, company: c.company, reason });
      } else {
        out.skipped++; // already tried (submitted / needs_user / failed) — the user decides, we don't loop
      }
      continue;
    }
    if (usedToday >= dailyCap) {
      out.capped++;
      continue;
    }

    // The audit row. Upsert, so a verdict written after a claim updates the same row.
    const record = async (status: "submitted" | "needs_user" | "failed", extra: Record<string, unknown> = {}) =>
      AutoApplication.findOneAndUpdate({ userId, jobId: c.jobId }, { $set: { jobModel: c.jobModel, jobTitle: c.title, company: c.company, score: c.score, status, ...extra } }, { upsert: true, new: true }).catch(() => null);
    /**
     * Intent-then-confirm: write the claim BEFORE pressing submit. If another worker holds the claim
     * (duplicate key), this attempt must not press. Returns false when we don't own the claim.
     */
    const claim = async (extra: Record<string, unknown> = {}): Promise<boolean> => {
      try {
        await AutoApplication.create({ userId, jobId: c.jobId, jobModel: c.jobModel, jobTitle: c.title, company: c.company, score: c.score, status: "submitting", claimedAt: new Date(), ...extra });
        return true;
      } catch (e: any) {
        if (e?.code === 11000) return false;
        throw e;
      }
    };

    if (c.jobModel === "Job") {
      const created = await Candidates.create({ candidateId: userId, jobId: c.jobId, jobModel: "Job", status: "Submitted Resume" });
      await record("submitted", { ats: "jobmatch" });
      await ensureOutcome(userId, String(created._id), { score: c.score, autoApplied: !deps.explicit });
      usedToday++;
      out.submitted.push({ jobId: c.jobId, title: c.title, company: c.company, score: c.score });
      // Tell the publisher, like a manual application does.
      const job: any = await Job.findById(c.jobId).select("publisher job").lean();
      if (job?.publisher) {
        await notify(String(job.publisher), { type: "application_received", title: `מועמדות חדשה למשרה: ${job.job}`, body: "מועמד/ת חדש/ה הגיש/ה מועמדות (הגשה אוטומטית של JobMatch).", link: "/RecruiterDashboard", meta: { jobId: c.jobId, candidateId: userId, auto: true } });
      }
      continue;
    }

    const job: any = await ExternalJobs.findById(c.jobId).select("job company description finalUrl url city country").lean();
    const url = job?.finalUrl || job?.url || "";
    if (!job || !url) {
      await record("failed", { note: "The posting has no application link." });
      out.failed++;
      continue;
    }
    const h = await serverHealthy();
    if (!h.ok) {
      // Nothing is written: the posting stays eligible and the next pass retries it.
      if (out.deferred === 0) console.warn(`[autoApply] apply server not available (${h.reason}) — deferring external postings for user ${userId}`);
      out.deferred++;
      continue;
    }

    // Résumé to attach: tailored to the posting when we can, else the stored one.
    let resume: StructuredResume | null = baseResume;
    if (canTailor && (baseResume || user.resumeText)) {
      try {
        const t = await (deps.tailor || tailorResumeToJob)({
          resumeStructured: baseResume ?? undefined,
          resumeText: user.resumeText,
          profile: { fullname: user.fullname, email: user.email, phone: user.phone, currentJob: user.currentJob },
          job: { title: job.job, company: job.company, description: job.description || "", city: job.city, country: job.country },
          language: "he",
        });
        if (isStructuredResume(t.tailoredResume)) resume = t.tailoredResume;
      } catch (e) {
        console.warn("[autoApply] tailor failed, using the stored résumé:", (e as Error)?.message);
      }
    }
    if (!resume) {
      await record("needs_user", { url, note: "No résumé on file to attach — build one in ResumeAI first." });
      out.needsUser.push({ jobId: c.jobId, title: c.title, company: c.company, reason: "אין קורות חיים לצרף" });
      continue;
    }

    const pdf = await renderResumePdf(resume);
    const submit = deps.submit || submitExternalApplication;
    const base = { url, profile, resumePdf: pdf, resumeFileName: `${(user.fullname || "CV").replace(/\s+/g, "-")}-CV.pdf`, resumeText: (user.resumeText || "").trim() || structuredToText(resume), jobTitle: job.job, company: job.company };

    // Phase 1: fill the standard fields and see what else the form wants.
    let r = await submit({ ...base, dryRun: true });
    if (transientFailure(r)) {
      // Before any click, a server-side failure (down, busy, timed out) is not a verdict: no row, retry next pass.
      console.warn(`[autoApply] deferred ${c.title} @ ${c.company}: ${r.reason}`);
      out.deferred++;
      continue;
    }
    let answers: { selector: string; value: string }[] = [];
    let unanswered: string[] = [];
    if (r.status === "needs_user" && r.fields?.length) {
      const resumeText = (user.resumeText || "").trim() || structuredToText(resume);
      const a = await (deps.answer || answerFormFields)(r.fields, { profile: { fullname: user.fullname || "", email: profile.email, phone: profile.phone }, resumeText, job: { title: job.job, company: job.company } });
      answers = a.answers.map(({ selector, value }) => ({ selector, value }));
      unanswered = a.unanswered.filter((f) => f.required).map((f) => f.label);
    }
    // Phase 2: submit for real when every required field has an honest answer
    // (the form agent reports "ready" itself after a dry run it could complete).
    let pressed = false;
    if (r.status === "ready" || (r.status === "needs_user" && r.fields?.length && unanswered.length === 0)) {
      // Claim first: from here on, a crash means "unknown", never "try again".
      if (!(await claim({ url, ats: r.ats }))) {
        out.skipped++; // another attempt holds the claim right now
        continue;
      }
      pressed = true;
      r = await submit({ ...base, answers });
    } else if (r.status === "needs_user" && unanswered.length) {
      r = { ...r, reason: `The form asks for: ${unanswered.join(", ")}.` };
    }
    // The click may have landed even though the answer never came back: that is "unknown", not "failed".
    if (pressed && transientFailure(r)) {
      await record("needs_user", { url, ats: r.ats, note: `Outcome unknown: the apply server ${/timed out/i.test(r.reason || "") ? "timed out" : `did not answer (${r.reason || "no reason"})`} after the submit step. Not resent. Check the inbox for a confirmation before applying by hand.`, resumeStructured: resume });
      out.needsUser.push({ jobId: c.jobId, title: c.title, company: c.company, reason: UNKNOWN_OUTCOME_REASON });
      continue;
    }
    if (r.status === "submitted") {
      const created = await Candidates.create({ candidateId: userId, jobId: c.jobId, jobModel: "ExternalJobs", status: "Submitted Resume" });
      await record("submitted", { url, ats: r.mode === "agent" ? `${r.ats} (agent)` : r.ats, note: r.confirmation || "", resumeStructured: resume });
      await ensureOutcome(userId, String(created._id), { score: c.score, autoApplied: !deps.explicit });
      usedToday++;
      out.submitted.push({ jobId: c.jobId, title: c.title, company: c.company, score: c.score });
    } else if (r.status === "needs_user") {
      await record("needs_user", { url, ats: r.ats, note: r.reason || "", resumeStructured: resume });
      out.needsUser.push({ jobId: c.jobId, title: c.title, company: c.company, reason: r.reason || "" });
    } else {
      await record("failed", { url, ats: r.ats, note: r.reason || "" });
      out.failed++;
    }
  }
  return out;
}

/** The new postings (since `since`) that clear each opted-in user's bar — vector search per user, level-aware. */
export async function autoApplyCandidatesSince(since: Date): Promise<Map<string, ApplyCandidate[]>> {
  await connectToDatabase();
  const users: any[] = await User.find({ "autoApply.enabled": true, embedding: { $exists: true, $ne: [] } }).select("+embedding +resumeText autoApply level currentJob resumeUpdatedAt").limit(500).lean();
  const result = new Map<string, ApplyCandidate[]>();
  for (const u of users) {
    const min = u.autoApply?.minScore ?? 75;
    const resumeText = u.resumeText || "";
    const { jobs } = await rankJobs(
      { userId: String(u._id), vector: u.embedding, level: u.level || inferCandidateLevel(resumeText, u.currentJob || ""), resumeSummary: resumeText.slice(0, 4000), resumeVersion: u.resumeUpdatedAt ? new Date(u.resumeUpdatedAt).getTime() : 0 },
      // The reranker is the gate here: an application is only sent on a verdict, never on cosine alone.
      { filter: { firstSeenAfter: since }, limit: 20, minScore: min, rerank: true, rerankTop: 20 }
    );
    const picks = jobs.filter((j) => j.reranked || process.env.NODE_ENV === "test").map((j) => ({ jobId: j._id, jobModel: "ExternalJobs" as const, score: j.matchScore, title: j.job, company: j.company }));
    if (picks.length) result.set(String(u._id), picks);
  }
  return result;
}

export { Company }; // keep the Company model registered for Job.populate callers
