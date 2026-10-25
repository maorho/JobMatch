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
  /**
   * Postings we could not even try (apply server down/busy/timed out before any
   * click): a "deferred" row with `retryAfter` is written and a later pass retries
   * it once due (see retryDelayMs / MAX_DEFERRALS).
   */
  deferred: number;
  /** External postings held because auto-apply is switched off in THIS runtime (deferred rows, retried where it is on). */
  held?: number;
  /** Set when this runtime has FEATURES.autoApply off (internal postings are still applied to). */
  featureOff?: boolean;
  disabled?: boolean;
};

/** Server-side deferrals before a posting is given up on as "failed". */
export const MAX_DEFERRALS = 5;
const HOUR = 3600_000;
/** 1h, 2h, 4h, 8h, 16h, capped at 24h. */
export const retryDelayMs = (attempts: number) => Math.min(24 * HOUR, HOUR * 2 ** Math.max(0, attempts - 1));
/** A runtime without auto-apply re-checks rarely: the row waits for a runtime that has it. */
const FEATURE_OFF_RETRY_MS = 6 * HOUR;

export type AutoApplyDeps = {
  submit?: typeof submitExternalApplication;
  tailor?: typeof tailorResumeToJob;
  answer?: typeof answerFormFields;
  /** Reachability probe run once per pass before any tailoring (tests inject; default skips under NODE_ENV=test). */
  health?: () => Promise<ApplyServerHealth>;
  /** The user explicitly asked to apply to these postings (MCP/UI): ignore the opt-in switch and the score bar; keep dedupe + cap. */
  explicit?: boolean;
  /** Bus lease renewal, called once per posting (each can be a tailor LLM call + two form runs). */
  heartbeat?: () => Promise<void>;
  /** Don't pull in this user's due deferred rows (tests). */
  skipRetries?: boolean;
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
  const user: any = await User.findById(userId).select("+resumeText +resumeStructured fullname email phone currentJob autoApply").lean();
  if (!user) return { ...out, skipped: candidates.length, disabled: true };
  if (!deps.explicit && !user.autoApply?.enabled) return { ...out, skipped: candidates.length, disabled: true };

  // The feature gate only concerns the apply server: internal postings ("Job") are a DB write
  // and are applied to either way; external ones are held as deferred rows (see below).
  const featureOn = FEATURES.autoApply;
  if (!featureOn) {
    out.featureOff = true;
    const external = candidates.filter((c) => c.jobModel === "ExternalJobs").length;
    if (external) console.warn(`[autoApply] auto-apply is off in this runtime (FEATURE_AUTO_APPLY / PUPPETEER_SERVER_URL) — holding ${external} external posting${external === 1 ? "" : "s"} for user ${userId} as deferred, for a runtime that has it`);
  }

  // Retry pass: this user's deferred postings whose backoff has elapsed ride along with this pass.
  const explicitIds = new Set<string>(deps.explicit ? candidates.map((c) => String(c.jobId)) : []);
  if (!deps.skipRetries) {
    const due: any[] = await AutoApplication.find({ userId, status: "deferred", retryAfter: { $lte: new Date() } }).select("jobId jobModel score jobTitle company explicit").limit(20).lean();
    const have = new Set(candidates.map((c) => String(c.jobId)));
    const retries = due.filter((d) => !have.has(String(d.jobId))).map((d) => ({ jobId: String(d.jobId), jobModel: d.jobModel, score: d.score ?? 0, title: d.jobTitle || "", company: d.company || "" }) as ApplyCandidate);
    for (const d of due) if (d.explicit) explicitIds.add(String(d.jobId));
    candidates = [...candidates, ...retries];
  }

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
    await deps.heartbeat?.().catch(() => {});
    const isExplicit = explicitIds.has(String(c.jobId));
    if (c.score < (isExplicit ? 0 : minScore)) {
      out.skipped++;
      continue;
    }
    if (await Candidates.exists({ candidateId: userId, jobId: c.jobId })) {
      // Applied some other way meanwhile: a deferred row has nothing left to do.
      await AutoApplication.updateOne({ userId, jobId: c.jobId, status: "deferred" }, { $set: { status: "skipped", note: "Already applied." }, $unset: { retryAfter: 1 } });
      out.skipped++;
      continue;
    }
    const prior: any = await AutoApplication.findOne({ userId, jobId: c.jobId }).select("status attempts claimedAt retryAfter +resumeStructured").lean();
    /** A due deferred row is retried in place: its claim is taken from it atomically (deferred → submitting). */
    const retrying = prior?.status === "deferred" && !(prior.retryAfter && new Date(prior.retryAfter).getTime() > Date.now());
    if (prior && !retrying) {
      if (prior.status === "deferred") {
        out.skipped++; // backing off: not due yet
      } else if (prior.status === "submitting") {
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
      AutoApplication.findOneAndUpdate({ userId, jobId: c.jobId }, { $set: { jobModel: c.jobModel, jobTitle: c.title, company: c.company, score: c.score, status, ...extra }, $unset: { retryAfter: 1 } }, { upsert: true, new: true }).catch(() => null);
    /**
     * Intent-then-confirm: write the claim BEFORE pressing submit. If another worker holds the claim
     * (duplicate key, or the deferred row was already taken), this attempt must not press.
     * Returns false when we don't own the claim.
     */
    const claim = async (extra: Record<string, unknown> = {}): Promise<boolean> => {
      if (retrying) {
        const took = await AutoApplication.findOneAndUpdate({ _id: prior._id, status: "deferred" }, { $set: { status: "submitting", claimedAt: new Date(), ...extra }, $unset: { retryAfter: 1 } }, { new: true });
        return !!took;
      }
      try {
        await AutoApplication.create({ userId, jobId: c.jobId, jobModel: c.jobModel, jobTitle: c.title, company: c.company, score: c.score, status: "submitting", claimedAt: new Date(), ...extra });
        return true;
      } catch (e: any) {
        if (e?.code === 11000) return false;
        throw e;
      }
    };
    /**
     * Nothing was pressed: park the posting as "deferred" with a backoff, so the next due pass
     * retries it (and reuses the tailored résumé instead of paying for it again). Server-side
     * deferrals count toward MAX_DEFERRALS; a runtime with the feature off does not.
     * Never overwrites another status (a concurrent claim): the filter only matches no row or a
     * deferred one, and an insert that collides with any other row is dropped.
     */
    const defer = async (reason: string, opts: { counts: boolean; resume?: StructuredResume | null }): Promise<"deferred" | "gave_up"> => {
      const attempts = (retrying ? prior.attempts ?? 0 : 0) + (opts.counts ? 1 : 0);
      if (opts.counts && attempts >= MAX_DEFERRALS) {
        await AutoApplication.updateOne({ userId, jobId: c.jobId, status: "deferred" }, { $set: { status: "failed", attempts, note: `Gave up after ${attempts} tries: ${reason}`.slice(0, 1000) }, $unset: { retryAfter: 1 } });
        return "gave_up";
      }
      const retryAfter = new Date(Date.now() + (opts.counts ? retryDelayMs(attempts) : FEATURE_OFF_RETRY_MS));
      await AutoApplication.findOneAndUpdate(
        { userId, jobId: c.jobId, status: "deferred" },
        { $set: { jobModel: c.jobModel, jobTitle: c.title, company: c.company, score: c.score, status: "deferred", attempts, retryAfter, note: `Deferred: ${reason}`.slice(0, 1000), ...(isExplicit ? { explicit: true } : {}), ...(opts.resume ? { resumeStructured: opts.resume } : {}) } },
        { upsert: true }
      ).catch((e: any) => {
        if (e?.code !== 11000) throw e; // another attempt owns the row now: leave it
      });
      return "deferred";
    };
    /** Count a deferral (or a give-up) in this pass's outcome. */
    const deferAndCount = async (reason: string, opts: { counts: boolean; resume?: StructuredResume | null }) => {
      const r = await defer(reason, opts);
      if (r === "gave_up") out.failed++;
      else if (opts.counts) out.deferred++;
      else out.held = (out.held ?? 0) + 1;
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
    if (!featureOn) {
      // Not this runtime's job: park it (no attempt counted) for a runtime with the apply server.
      await deferAndCount("auto-apply is switched off in the runtime that handled this pass", { counts: false });
      continue;
    }
    // Reachability first, on every path: an unreachable server must never cost a tailor LLM call.
    const h = await serverHealthy();
    if (!h.ok) {
      if (out.deferred === 0) console.warn(`[autoApply] apply server not available (${h.reason}) — deferring external postings for user ${userId}`);
      await deferAndCount(h.reason || "apply server unavailable", { counts: true });
      continue;
    }

    // Résumé to attach: the one tailored on an earlier (deferred) try, else tailored now when we can, else the stored one.
    let resume: StructuredResume | null = baseResume;
    const tailoredBefore = retrying && isStructuredResume(prior.resumeStructured) ? (prior.resumeStructured as StructuredResume) : null;
    if (tailoredBefore) {
      resume = tailoredBefore;
    } else if (canTailor && (baseResume || user.resumeText)) {
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
      // Before any click, a server-side failure (down, busy, timed out) is not a verdict: park it with a backoff.
      console.warn(`[autoApply] deferred ${c.title} @ ${c.company}: ${r.reason}`);
      await deferAndCount(r.reason || "apply server failed before the submit step", { counts: true, resume: resume !== baseResume ? resume : null });
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
export async function autoApplyCandidatesSince(since: Date, opts: { heartbeat?: () => Promise<void> } = {}): Promise<Map<string, ApplyCandidate[]>> {
  await connectToDatabase();
  const users: any[] = await User.find({ "autoApply.enabled": true, embedding: { $exists: true, $ne: [] } }).select("+embedding +resumeText autoApply level currentJob resumeUpdatedAt").limit(500).lean();
  const result = new Map<string, ApplyCandidate[]>();
  for (const u of users) {
    await opts.heartbeat?.().catch(() => {}); // each user is a reranked vector search

    const min = u.autoApply?.minScore ?? 75;
    const resumeText = u.resumeText || "";
    const { jobs } = await rankJobs(
      { userId: String(u._id), vector: u.embedding, level: u.level || inferCandidateLevel(resumeText, u.currentJob || ""), resumeSummary: resumeText.slice(0, 4000), resumeVersion: u.resumeUpdatedAt ? new Date(u.resumeUpdatedAt).getTime() : 0 },
      // The reranker is the gate here: an application is only sent on a verdict, never on cosine alone.
      { filter: { firstSeenAfter: since }, limit: 20, minScore: min, rerank: true, rerankTop: 20 }
    );
    let picks = jobs.filter((j) => j.reranked || process.env.NODE_ENV === "test").map((j) => ({ jobId: j._id, jobModel: "ExternalJobs" as const, score: j.matchScore, title: j.job, company: j.company }));
    // Postings this user already has a row for are not new work: tried ones stay decided, and
    // deferred ones are retried by the Applier's own retry pass when their backoff elapses.
    if (picks.length) {
      const tried = new Set((await AutoApplication.find({ userId: u._id, jobId: { $in: picks.map((p) => p.jobId) } }).select("jobId").lean()).map((r: any) => String(r.jobId)));
      picks = picks.filter((p) => !tried.has(String(p.jobId)));
    }
    if (picks.length) result.set(String(u._id), picks);
  }
  return result;
}

/**
 * Users with deferred auto-applies whose backoff has elapsed. The Matcher sends
 * each of them an apply.request (trigger "retry") on every catalog pass, so a
 * deferral is retried even when no new posting arrives for that person.
 */
export async function usersWithDueDeferrals(limit = 200): Promise<string[]> {
  await connectToDatabase();
  const ids: any[] = await AutoApplication.distinct("userId", { status: "deferred", retryAfter: { $lte: new Date() } });
  return ids.slice(0, limit).map(String);
}

export { Company }; // keep the Company model registered for Job.populate callers
