import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";
import Candidates from "@/app/models/Candidates";
import Job from "@/app/models/Job";
import Company from "@/app/models/Company";
import ExternalJobs from "@/app/models/ExternalJobs";
import ApplicationEvent from "@/app/models/ApplicationEvent";
import { notify } from "@/app/lib/notifications/notify";
import { recordStatusChange } from "@/app/lib/outcomes/outcomes";
import { open } from "@/app/lib/crypto/secretBox";
import { refreshAccessToken, listApplicationMessages, type GmailMessage } from "./gmail";
import { classifyEmails, type EmailClassification, APPLICATION_STATUSES } from "./classify";
import { startFlow, kick } from "@/app/lib/agents/bus";
import type { ApplicationChange } from "@/app/lib/agents/types";

/** Rank for "did the status advance?" — we never move an application backwards from an email. */
const RANK: Record<string, number> = { "Submitted Resume": 1, "HR Phone Interview": 2, "Technical Interview": 3, "Final Interview": 4, "Recived an Offer": 5, Accepted: 6, Rejected: 6 };
const MIN_CONFIDENCE = 0.6;

export type TrackedApplication = { _id: string; status: string; company: string; title: string; jobModel: string; jobId: string };

const norm = (s: string) => (s || "").toLowerCase().replace(/\b(ltd|inc|llc|corp|technologies|technology|labs|group|the)\b/g, "").replace(/[^a-z0-9֐-׿]+/g, " ").trim();

/** A finished application (terminal status) untouched for this long can't get new news; keeps the working set small. */
const TRACK_WINDOW_DAYS = 90;
/** Candidates statuses after which nothing more is expected. */
const TERMINAL_STATUSES = ["Rejected", "Accepted"];

/** The user's recent applications with company/title resolved for both job models (two `$in` reads, not one per row). */
export async function loadApplications(userId: string): Promise<TrackedApplication[]> {
  await connectToDatabase();
  const since = new Date(Date.now() - TRACK_WINDOW_DAYS * 86_400_000);
  // A long hiring process can outlive any window on createdAt, so: every
  // application still in play regardless of age, plus anything that moved in
  // the window, plus legacy rows without timestamps (can't tell — keep them).
  const apps: any[] = await Candidates.find({
    candidateId: userId,
    $or: [{ status: { $nin: TERMINAL_STATUSES } }, { updatedAt: { $gte: since } }, { updatedAt: { $exists: false } }],
  })
    .select("status jobModel jobId")
    .sort({ updatedAt: -1, _id: -1 })
    .limit(500)
    .lean();
  const extIds = apps.filter((a) => a.jobModel === "ExternalJobs").map((a) => a.jobId);
  const intIds = apps.filter((a) => a.jobModel === "Job").map((a) => a.jobId);
  const [ext, int]: [any[], any[]] = await Promise.all([
    extIds.length ? ExternalJobs.find({ _id: { $in: extIds } }).select("job company").lean() : [],
    intIds.length ? Job.find({ _id: { $in: intIds } }).populate({ path: "company", model: Company, select: "companyName" }).select("job company").lean() : [],
  ]);
  const extOf = new Map(ext.map((j) => [String(j._id), j]));
  const intOf = new Map(int.map((j) => [String(j._id), j]));
  const out: TrackedApplication[] = [];
  for (const a of apps) {
    if (a.jobModel === "ExternalJobs") {
      const j = extOf.get(String(a.jobId));
      if (j) out.push({ _id: String(a._id), status: a.status, company: j.company || "", title: j.job || "", jobModel: a.jobModel, jobId: String(a.jobId) });
    } else if (a.jobModel === "Job") {
      const j = intOf.get(String(a.jobId));
      if (j) out.push({ _id: String(a._id), status: a.status, company: j.company?.companyName || "", title: j.job || "", jobModel: a.jobModel, jobId: String(a.jobId) });
    }
  }
  return out;
}

/** Match a classified email to one application by company (then title). */
export function matchApplication(c: EmailClassification, apps: TrackedApplication[]): TrackedApplication | null {
  const company = norm(c.company);
  if (!company) return null;
  const byCompany = apps.filter((a) => {
    const n = norm(a.company);
    return n && (n === company || n.includes(company) || company.includes(n));
  });
  if (byCompany.length === 0) return null;
  if (byCompany.length === 1 || !c.roleTitle) return byCompany[0];
  const role = norm(c.roleTitle);
  return byCompany.find((a) => norm(a.title).includes(role) || role.includes(norm(a.title))) || byCompany[0];
}

export type SyncResult = { fetched: number; classified: number; events: number; updated: number; changes: ApplicationChange[]; error?: string };

export type SyncDeps = {
  list?: typeof listApplicationMessages;
  classify?: typeof classifyEmails;
  /** Where status changes are reported. Default: a new agent-bus run per change (the Coach picks it up). */
  publish?: (change: ApplicationChange) => Promise<unknown>;
};

const defaultPublish = (change: ApplicationChange) =>
  startFlow("application.changed", change, { from: "tracker", startedBy: `user:${change.userId}`, title: `${change.title} @ ${change.company} → ${change.status}`, says: `${change.title} @ ${change.company} moved to "${change.status}". Coach — anything to prepare?` });

/**
 * Pull the user's recent application emails, classify them, and apply
 * status changes to matching applications. Idempotent per email id.
 */
export async function syncUserEmails(userId: string, deps: SyncDeps = {}): Promise<SyncResult> {
  await connectToDatabase();
  // "+path" adds the hidden token to the default projection (selecting the
  // whole `gmail` subdoc as well would be a projection path collision).
  const user: any = await User.findById(userId).select("+gmail.refreshTokenSealed");
  if (!user?.gmail?.refreshTokenSealed) return { fetched: 0, classified: 0, events: 0, updated: 0, changes: [], error: "NOT_CONNECTED" };

  const result: SyncResult = { fetched: 0, classified: 0, events: 0, updated: 0, changes: [] };
  const publish = deps.publish || defaultPublish;
  const startedRuns: string[] = []; // runs the default publish opened, to kick each one by id
  try {
    const accessToken = await refreshAccessToken(open(user.gmail.refreshTokenSealed));
    const messages: GmailMessage[] = await (deps.list || listApplicationMessages)(accessToken, { days: 14, max: 40 });
    result.fetched = messages.length;

    // Skip emails we already processed.
    const seen = new Set((await ApplicationEvent.find({ userId, emailId: { $in: messages.map((m) => m.id) } }).select("emailId").lean()).map((e: any) => e.emailId));
    const fresh = messages.filter((m) => !seen.has(m.id));
    if (fresh.length === 0) {
      await User.updateOne({ _id: userId }, { $set: { "gmail.lastSyncAt": new Date(), "gmail.lastError": "" } });
      return result;
    }

    const classified = await (deps.classify || classifyEmails)(fresh);
    result.classified = classified.length;
    const apps = await loadApplications(userId);

    for (const c of classified) {
      const m = fresh.find((x) => x.id === c.id)!;
      if (!c.isJobRelated) {
        await ApplicationEvent.create({ userId, source: "email", emailId: m.id, emailFrom: m.from, emailSubject: m.subject, emailDate: m.date, applied: false, confidence: c.confidence, summary: "" }).catch(() => null);
        continue;
      }
      const app = matchApplication(c, apps);
      let applied = false;
      const status = c.status && (APPLICATION_STATUSES as readonly string[]).includes(c.status) ? c.status : "";
      if (app && status && c.confidence >= MIN_CONFIDENCE && (RANK[status] ?? 0) > (RANK[app.status] ?? 0)) {
        await Candidates.updateOne({ _id: app._id }, { $set: { status } });
        app.status = status;
        applied = true;
        await recordStatusChange(userId, app._id, status, "email");
        result.updated++;
        const change: ApplicationChange = { userId, applicationId: app._id, jobId: app.jobId, jobModel: app.jobModel, status, title: app.title, company: app.company };
        result.changes.push(change);
        const started: any = await publish(change).catch((e) => console.warn("[track] publish skipped:", (e as Error)?.message));
        if (!deps.publish && started?.runId) startedRuns.push(String(started.runId));
        await notify(userId, {
          type: "application_status",
          title: `עדכון ממייל: ${app.title} · ${app.company}`,
          body: `${status}${c.summary ? ` — ${c.summary}` : ""}`,
          link: "/Dashboard",
          meta: { applicationId: app._id, status, emailId: m.id },
        });
      }
      await ApplicationEvent.create({
        userId, applicationId: app?._id, source: "email", status, company: c.company, roleTitle: c.roleTitle, summary: c.summary.slice(0, 1000),
        confidence: c.confidence, emailId: m.id, emailFrom: m.from, emailSubject: m.subject, emailDate: m.date, applied,
      }).catch(() => null);
      result.events++;
    }
    await User.updateOne({ _id: userId }, { $set: { "gmail.lastSyncAt": new Date(), "gmail.lastError": "" } });
    for (const runId of startedRuns) kick(runId);
    return result;
  } catch (err: any) {
    const msg = err?.code === "REVOKED" ? "Gmail access was revoked — reconnect" : err?.message || "sync failed";
    await User.updateOne({ _id: userId }, { $set: { "gmail.lastError": msg } });
    return { ...result, error: msg };
  }
}
