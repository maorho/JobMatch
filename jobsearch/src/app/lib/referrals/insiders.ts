import crypto from "crypto";
import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
import Referrer from "@/app/models/Referrer";
import ReferralRequest, { OPEN_STATUSES, type ReferralStatus } from "@/app/models/ReferralRequest";
import Candidates from "@/app/models/Candidates";
import User from "@/app/models/User";
import ExternalJobs from "@/app/models/ExternalJobs";
import CompanySource from "@/app/models/CompanySource";
import { companyKey } from "@/app/lib/outcomes/companyKey";
import { sendEmail } from "@/app/lib/email/send";
import { notify } from "@/app/lib/notifications/notify";
import { loadJob } from "@/app/lib/jobs/loadJob";
import { ensureOutcome } from "@/app/lib/outcomes/outcomes";

/**
 * The insiders network ("חבר מביא חבר" as a product):
 *   - an employee registers as an insider for their company and proves it with a code
 *     mailed to a work address on the company's domain;
 *   - a candidate on a job page asks an insider there for a referral (one request per job,
 *     a handful open at a time);
 *   - the insider accepts / declines, and reports when the CV went in — which creates the
 *     application for the candidate and marks the outcome as referred (the likelihood model learns from it).
 */
export const VERIFY_TTL_MIN = 30;
export const MAX_OPEN_REQUESTS_PER_CANDIDATE = 5;
export const REQUEST_EXPIRY_DAYS = 14;

const hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const PUBLIC_MAIL = /^(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|walla|proton|protonmail|me|aol|msn)\./i;

/** The company's web domain as the catalog knows it (CompanySource first, then postings). */
export async function companyDomainFor(company: string): Promise<string> {
  await connectToDatabase();
  const key = companyKey(company);
  const src: any = await CompanySource.findOne({ companyName: company }).select("domain").lean();
  if (src?.domain) return String(src.domain).toLowerCase();
  const job: any = await ExternalJobs.findOne({ company, companyDomain: { $nin: ["", null] } }).select("companyDomain").lean();
  if (job?.companyDomain) return String(job.companyDomain).toLowerCase();
  const names: string[] = await ExternalJobs.distinct("company");
  const alt = names.find((n) => n && companyKey(n) === key && n !== company);
  if (alt) {
    const j: any = await ExternalJobs.findOne({ company: alt, companyDomain: { $nin: ["", null] } }).select("companyDomain").lean();
    if (j?.companyDomain) return String(j.companyDomain).toLowerCase();
  }
  return "";
}

/** Does a work address belong to the company? Same registrable domain (subdomains allowed), or the domain's root equals the company key; never a public mailbox. */
export function emailMatchesCompany(email: string, company: string, domain: string): boolean {
  const at = (email || "").toLowerCase().trim().split("@");
  if (at.length !== 2 || !at[1].includes(".")) return false;
  const mailDomain = at[1];
  if (PUBLIC_MAIL.test(mailDomain)) return false;
  const root = (d: string) => d.replace(/^www\./, "").split(".").slice(-2).join(".");
  if (domain && (mailDomain === domain || mailDomain.endsWith(`.${domain}`) || root(mailDomain) === root(domain))) return true;
  const mailKey = companyKey(mailDomain.split(".").slice(0, -1).join(" ").replace(/\./g, " "));
  return !!mailKey && mailKey === companyKey(company);
}

export type RegisterResult = { ok: true; referrerId: string; verified: boolean; sent: boolean; devCode?: string } | { ok: false; error: "bad_email" | "domain_mismatch" | "no_company" };

/** Register (or re-send the code for) an insider; the code goes to the work address. */
export async function registerInsider(userId: string, input: { company: string; title?: string; workEmail: string; capacity?: number; note?: string }): Promise<RegisterResult> {
  await connectToDatabase();
  const company = (input.company || "").trim();
  const workEmail = (input.workEmail || "").trim().toLowerCase();
  if (!company) return { ok: false, error: "no_company" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail)) return { ok: false, error: "bad_email" };
  const domain = await companyDomainFor(company);
  if (!emailMatchesCompany(workEmail, company, domain)) return { ok: false, error: "domain_mismatch" };
  const key = companyKey(company);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const doc: any = await Referrer.findOneAndUpdate(
    { userId, companyKey: key },
    { $set: { company, companyKey: key, domain, title: (input.title || "").slice(0, 80), workEmail, verifyCodeHash: hash(code), verifyCodeExpires: new Date(Date.now() + VERIFY_TTL_MIN * 60_000), active: true, ...(input.capacity ? { capacity: Math.min(50, Math.max(1, input.capacity)) } : {}), ...(input.note !== undefined ? { note: input.note.slice(0, 300) } : {}) } },
    { upsert: true, new: true }
  );
  const r = await sendEmail({
    to: workEmail,
    subject: `${code} is your JobMatch insider code · קוד אימות`,
    text: `Your JobMatch verification code for ${company} is ${code}. It expires in ${VERIFY_TTL_MIN} minutes.\n\nIf you did not ask to become an insider on JobMatch, ignore this email.`,
    html: `<p style="font-family:Inter,Arial,sans-serif;font-size:16px">Your JobMatch verification code for <b>${company}</b> is</p><p style="font-family:Inter,Arial,sans-serif;font-size:32px;letter-spacing:.2em;font-weight:700">${code}</p><p style="font-family:Inter,Arial,sans-serif;color:#545868">It expires in ${VERIFY_TTL_MIN} minutes. If you did not ask to become an insider on JobMatch, ignore this email.</p>`,
  });
  return { ok: true, referrerId: String(doc._id), verified: !!doc.verifiedAt, sent: r.sent, devCode: !r.sent && r.transport === "console" && process.env.NODE_ENV !== "production" ? code : undefined };
}

export async function verifyInsider(userId: string, company: string, code: string): Promise<{ ok: true } | { ok: false; error: "invalid" | "expired" }> {
  await connectToDatabase();
  const doc: any = await Referrer.findOne({ userId, companyKey: companyKey(company) }).select("+verifyCodeHash verifyCodeExpires");
  if (!doc || !doc.verifyCodeHash || hash(String(code || "").trim()) !== doc.verifyCodeHash) return { ok: false, error: "invalid" };
  if (!doc.verifyCodeExpires || new Date(doc.verifyCodeExpires).getTime() < Date.now()) return { ok: false, error: "expired" };
  doc.verifiedAt = new Date();
  doc.verifyCodeHash = undefined;
  doc.verifyCodeExpires = undefined;
  await doc.save();
  return { ok: true };
}

export async function updateInsider(userId: string, company: string, patch: { active?: boolean; capacity?: number; note?: string; title?: string }): Promise<boolean> {
  await connectToDatabase();
  const $set: Record<string, unknown> = {};
  if (typeof patch.active === "boolean") $set.active = patch.active;
  if (typeof patch.capacity === "number") $set.capacity = Math.min(50, Math.max(1, Math.round(patch.capacity)));
  if (typeof patch.note === "string") $set.note = patch.note.slice(0, 300);
  if (typeof patch.title === "string") $set.title = patch.title.slice(0, 80);
  const r = await Referrer.updateOne({ userId, companyKey: companyKey(company) }, { $set });
  return r.matchedCount > 0;
}

export async function myInsiderProfiles(userId: string) {
  await connectToDatabase();
  const rows: any[] = await Referrer.find({ userId }).sort({ createdAt: -1 }).lean();
  const open = await ReferralRequest.aggregate([{ $match: { referrerUserId: new mongoose.Types.ObjectId(userId), status: { $in: OPEN_STATUSES } } }, { $group: { _id: "$referrerId", n: { $sum: 1 } } }]);
  const openOf = new Map(open.map((o: any) => [String(o._id), o.n]));
  return rows.map((r) => ({ _id: String(r._id), company: r.company, companyKey: r.companyKey, domain: r.domain, title: r.title, workEmail: r.workEmail, verified: !!r.verifiedAt, active: r.active, capacity: r.capacity, note: r.note, stats: r.stats, open: openOf.get(String(r._id)) || 0 }));
}

export type InsiderPublic = { _id: string; firstName: string; title: string; note: string; available: boolean };

/** Verified, active insiders at a company — first names only, with whether they still have room. */
export async function insidersAt(company: string): Promise<InsiderPublic[]> {
  await connectToDatabase();
  const rows: any[] = await Referrer.find({ companyKey: companyKey(company), active: true, verifiedAt: { $ne: null } }).populate("userId", "fullname username").lean();
  if (!rows.length) return [];
  const open = await ReferralRequest.aggregate([{ $match: { referrerId: { $in: rows.map((r) => r._id) }, status: { $in: OPEN_STATUSES } } }, { $group: { _id: "$referrerId", n: { $sum: 1 } } }]);
  const openOf = new Map(open.map((o: any) => [String(o._id), o.n]));
  return rows.map((r) => ({ _id: String(r._id), firstName: String(r.userId?.fullname || r.userId?.username || "").trim().split(/\s+/)[0] || "Insider", title: r.title || "", note: r.note || "", available: (openOf.get(String(r._id)) || 0) < r.capacity }));
}

export type RequestResult = { ok: true; requestId: string; referrer: InsiderPublic } | { ok: false; error: "no_insider" | "full" | "already_requested" | "too_many_open" | "self" | "no_job" };

/** A candidate asks for a referral on a posting. Picks the least-loaded available insider unless one is named. */
export async function requestReferral(candidateId: string, input: { jobId: string; jobModel: "Job" | "ExternalJobs"; referrerId?: string; message?: string; matchScore?: number | null }): Promise<RequestResult> {
  await connectToDatabase();
  const job: any = await loadJob(input.jobModel === "Job" ? "internal" : "external", input.jobId);
  if (!job) return { ok: false, error: "no_job" };
  const company = input.jobModel === "ExternalJobs" ? job.company : job.company?.companyName || job.company;
  const all = await insidersAt(company);
  // You can't be referred by yourself: your own insider profiles are never candidates.
  const mine = new Set(((await Referrer.find({ userId: candidateId }).select("_id").lean()) as any[]).map((r) => String(r._id)));
  if (input.referrerId && mine.has(input.referrerId)) return { ok: false, error: "self" };
  const insiders = all.filter((i) => !mine.has(i._id));
  if (!insiders.length) return { ok: false, error: all.length ? "self" : "no_insider" };
  const chosen = input.referrerId ? insiders.find((i) => i._id === input.referrerId) : insiders.filter((i) => i.available)[0];
  if (!chosen) return { ok: false, error: "no_insider" };
  if (!chosen.available) return { ok: false, error: "full" };
  const ref: any = await Referrer.findById(chosen._id).lean();
  const openMine = await ReferralRequest.countDocuments({ candidateId, status: { $in: OPEN_STATUSES } });
  if (openMine >= MAX_OPEN_REQUESTS_PER_CANDIDATE) return { ok: false, error: "too_many_open" };
  if (await ReferralRequest.exists({ candidateId, jobId: input.jobId })) return { ok: false, error: "already_requested" };
  const candidate: any = await User.findById(candidateId).select("fullname username level currentJob").lean();
  const created = await ReferralRequest.create({
    candidateId,
    referrerId: ref._id,
    referrerUserId: ref.userId,
    company,
    companyKey: companyKey(company),
    jobId: input.jobId,
    jobModel: input.jobModel,
    jobTitle: job.job || "",
    jobUrl: job.finalUrl || job.url || "",
    message: (input.message || "").slice(0, 1200),
    matchScore: input.matchScore ?? null,
  });
  await Referrer.updateOne({ _id: ref._id }, { $inc: { "stats.requests": 1 } });
  await notify(String(ref.userId), {
    type: "referral",
    title: `בקשת הפניה: ${job.job} ב-${company}`,
    body: `${candidate?.fullname || candidate?.username || "מועמד/ת"}${candidate?.currentJob ? ` · ${candidate.currentJob}` : ""}${input.matchScore != null ? ` · התאמה ${input.matchScore}%` : ""}${input.message ? `\n"${String(input.message).slice(0, 160)}"` : ""}`,
    link: "/referrals",
    meta: { requestId: String(created._id), agent: "referrals" },
  });
  return { ok: true, requestId: String(created._id), referrer: chosen };
}

export type RespondAction = "accept" | "decline" | "submitted";

/** The insider's move. "submitted" means the CV went to the hiring team: an application is created for the candidate and the outcome is marked as referred. */
export async function respondToRequest(referrerUserId: string, requestId: string, action: RespondAction, note = ""): Promise<{ ok: true; status: ReferralStatus } | { ok: false; error: "not_found" | "bad_transition" }> {
  await connectToDatabase();
  if (!mongoose.Types.ObjectId.isValid(requestId)) return { ok: false, error: "not_found" };
  const r: any = await ReferralRequest.findOne({ _id: requestId, referrerUserId });
  if (!r) return { ok: false, error: "not_found" };
  const allowed: Record<RespondAction, ReferralStatus[]> = { accept: ["requested"], decline: ["requested", "accepted"], submitted: ["requested", "accepted"] };
  if (!allowed[action].includes(r.status)) return { ok: false, error: "bad_transition" };
  const next: ReferralStatus = action === "accept" ? "accepted" : action === "decline" ? "declined" : "submitted";
  r.status = next;
  r.referrerNote = (note || "").slice(0, 600);
  r.respondedAt = new Date();
  if (next === "submitted") r.submittedAt = new Date();
  await r.save(); // persisted first: the outcome snapshot below reads the request's status to set hasReferral
  if (next === "submitted") {
    // The referral IS an application. Reuse an existing one for this job, otherwise create it.
    let app: any = await Candidates.findOne({ candidateId: r.candidateId, jobId: r.jobId, jobModel: r.jobModel });
    if (!app) app = await Candidates.create({ candidateId: r.candidateId, jobId: r.jobId, jobModel: r.jobModel, status: "Submitted Resume" });
    r.applicationId = app._id;
    await r.save();
    await ensureOutcome(String(r.candidateId), String(app._id), { score: r.matchScore ?? undefined }).catch(() => null);
  }
  await Referrer.updateOne({ _id: r.referrerId }, { $inc: { [`stats.${next === "accepted" ? "accepted" : next === "declined" ? "declined" : "submitted"}`]: 1 } });
  const insider: any = await User.findById(referrerUserId).select("fullname username").lean();
  const who = String(insider?.fullname || insider?.username || "").split(/\s+/)[0] || "הממליץ/ה";
  await notify(String(r.candidateId), {
    type: "referral",
    title: next === "accepted" ? `${who} מ-${r.company} ימליץ/תמליץ עליך` : next === "submitted" ? `קורות החיים שלך הוגשו ב-${r.company} עם הפניה מבפנים` : `${who} מ-${r.company} לא יכול/ה להמליץ הפעם`,
    body: `${r.jobTitle}${note ? `\n"${note.slice(0, 200)}"` : ""}${next === "submitted" ? "\nהמועמדות מופיעה בדשבורד; נשאל אותך בעוד שבוע אם קיבלת תשובה." : ""}`,
    link: next === "submitted" ? "/Dashboard" : "/referrals",
    meta: { requestId: String(r._id), agent: "referrals" },
  });
  return { ok: true, status: next };
}

export async function withdrawRequest(candidateId: string, requestId: string): Promise<boolean> {
  await connectToDatabase();
  if (!mongoose.Types.ObjectId.isValid(requestId)) return false;
  const r = await ReferralRequest.updateOne({ _id: requestId, candidateId, status: { $in: OPEN_STATUSES } }, { $set: { status: "withdrawn", respondedAt: new Date() } });
  return r.modifiedCount > 0;
}

/** Requests older than REQUEST_EXPIRY_DAYS with no answer stop counting against anyone. */
export async function expireStaleRequests(now = new Date()): Promise<number> {
  await connectToDatabase();
  const r = await ReferralRequest.updateMany({ status: "requested", createdAt: { $lt: new Date(now.getTime() - REQUEST_EXPIRY_DAYS * 86_400_000) } }, { $set: { status: "expired", respondedAt: now } });
  return r.modifiedCount;
}

/** Everything one person sees on /referrals: what they asked for, and (as an insider) what landed in their inbox. */
export async function referralsOverview(userId: string) {
  await connectToDatabase();
  const [mine, inbox, profiles] = await Promise.all([
    ReferralRequest.find({ candidateId: userId }).sort({ createdAt: -1 }).limit(50).populate("referrerUserId", "fullname username").lean(),
    ReferralRequest.find({ referrerUserId: userId }).sort({ createdAt: -1 }).limit(100).populate("candidateId", "fullname username level currentJob resume resumeUpdatedAt").lean(),
    myInsiderProfiles(userId),
  ]);
  const first = (u: any) => String(u?.fullname || u?.username || "").split(/\s+/)[0] || "";
  return {
    mine: (mine as any[]).map((r) => ({ _id: String(r._id), company: r.company, jobTitle: r.jobTitle, jobId: String(r.jobId), jobModel: r.jobModel, status: r.status, referrer: first(r.referrerUserId), referrerNote: r.referrerNote, createdAt: r.createdAt, respondedAt: r.respondedAt })),
    inbox: (inbox as any[]).map((r) => ({ _id: String(r._id), company: r.company, jobTitle: r.jobTitle, jobUrl: r.jobUrl, jobId: String(r.jobId), jobModel: r.jobModel, status: r.status, message: r.message, matchScore: r.matchScore, candidate: { id: String(r.candidateId?._id || r.candidateId), name: r.candidateId?.fullname || r.candidateId?.username || "", level: r.candidateId?.level || "", currentJob: r.candidateId?.currentJob || "", hasResume: !!r.candidateId?.resume }, createdAt: r.createdAt, respondedAt: r.respondedAt })),
    profiles,
  };
}

export { hasInsiderReferral } from "./hasReferral";
