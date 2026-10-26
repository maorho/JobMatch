import crypto from "crypto";
import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
import Partner from "@/app/models/Partner";
import User from "@/app/models/User";
import ApplicationOutcome from "@/app/models/ApplicationOutcome";
import InterviewSession from "@/app/models/InterviewSession";
import Candidates from "@/app/models/Candidates";
import { isPositive } from "@/app/lib/outcomes/outcomes";

/**
 * Partner program (bootcamps / colleges). A partner has an invite code;
 * members carry `User.partner` and the partner sees its cohort's funnel.
 */
export const REF_COOKIE = "jm_ref";
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "partner";

/** Human-typeable code: 4 letters from the name + 4 digits (e.g. "ITCX-4821"). */
export function makeInviteCode(name: string): string {
  const letters = (name.replace(/[^a-z]/gi, "").toUpperCase() + "JMXX").slice(0, 4);
  return `${letters}-${1000 + crypto.randomInt(9000)}`;
}

export type PartnerInput = { name: string; kind?: string; blurb?: string; website?: string; contactEmail?: string; cohort?: string; slug?: string; createdBy?: string };

/** Create a partner; returns the dashboard token exactly once. */
export async function createPartner(input: PartnerInput): Promise<{ partner: any; token: string }> {
  await connectToDatabase();
  const name = input.name.trim();
  if (!name) throw new Error("name is required");
  let slug = slugify(input.slug || name);
  for (let i = 2; await Partner.exists({ slug }); i++) slug = `${slugify(input.slug || name)}-${i}`;
  let inviteCode = makeInviteCode(name);
  while (await Partner.exists({ inviteCode })) inviteCode = makeInviteCode(name);
  const token = `jmp_${crypto.randomBytes(24).toString("base64url")}`;
  const doc = await Partner.create({ name, slug, kind: input.kind || "bootcamp", blurb: (input.blurb || "").slice(0, 600), website: input.website || "", contactEmail: input.contactEmail || "", cohort: input.cohort || "", inviteCode, tokenHash: sha(token), createdBy: input.createdBy && mongoose.isValidObjectId(input.createdBy) ? input.createdBy : undefined });
  const partner = doc.toObject();
  delete partner.tokenHash;
  return { partner, token };
}

export async function partnerByCode(code: string): Promise<any | null> {
  const c = (code || "").trim().toUpperCase();
  if (!c) return null;
  await connectToDatabase();
  return Partner.findOne({ inviteCode: c, active: true }).lean();
}

export async function partnerBySlug(slug: string): Promise<any | null> {
  await connectToDatabase();
  return Partner.findOne({ slug: slugify(slug) }).lean();
}

/** Does this token open the partner's dashboard? */
export async function partnerForToken(slug: string, token: string): Promise<any | null> {
  if (!token) return null;
  await connectToDatabase();
  const p: any = await Partner.findOne({ slug: slugify(slug) }).select("+tokenHash").lean();
  if (!p || p.tokenHash !== sha(token)) return null;
  delete p.tokenHash;
  return p;
}

/** Attach a user to a partner by invite code (idempotent; a user keeps their first partner). */
export async function attachPartner(userId: string, code: string): Promise<{ ok: boolean; partner?: any; reason?: string }> {
  const partner = await partnerByCode(code);
  if (!partner) return { ok: false, reason: "unknown_code" };
  const user: any = await User.findById(userId).select("partner").lean();
  if (!user) return { ok: false, reason: "no_user" };
  if (user.partner?.slug) return { ok: true, partner, reason: user.partner.slug === partner.slug ? "already" : "has_other" };
  await User.updateOne({ _id: userId }, { $set: { partner: { slug: partner.slug, code: partner.inviteCode, cohort: partner.cohort || "", joinedAt: new Date() } } });
  return { ok: true, partner };
}

export type Funnel = { members: number; withResume: number; applied: number; applications: number; interviews: number; offers: number; mockInterviews: number; activeLast7d: number; responseRate: number | null };

/** The cohort's funnel: who signed up, who has a résumé, applied, got interviews / offers, practised. */
export async function partnerFunnel(slug: string): Promise<Funnel> {
  await connectToDatabase();
  const members: any[] = await User.find({ "partner.slug": slugify(slug) }).select("_id resumeUpdatedAt resume updatedAt").lean();
  const ids = members.map((m) => m._id);
  if (!ids.length) return { members: 0, withResume: 0, applied: 0, applications: 0, interviews: 0, offers: 0, mockInterviews: 0, activeLast7d: 0, responseRate: null };
  const [apps, outcomes, mocks]: [any[], any[], number] = await Promise.all([
    Candidates.find({ candidateId: { $in: ids } }).select("candidateId").lean(),
    ApplicationOutcome.find({ userId: { $in: ids } }).select("userId outcome reached").lean(),
    InterviewSession.countDocuments({ userId: { $in: ids } }),
  ]);
  const week = Date.now() - 7 * 86_400_000;
  const resolved = outcomes.filter((o) => o.outcome !== "pending");
  const replied = resolved.filter((o) => o.outcome !== "no_reply").length;
  return {
    members: members.length,
    withResume: members.filter((m) => m.resumeUpdatedAt || m.resume).length, // uploaded at signup, or built in ResumeAI
    applied: new Set(apps.map((a) => String(a.candidateId))).size,
    applications: apps.length,
    interviews: new Set(outcomes.filter((o) => isPositive(o.reached)).map((o) => String(o.userId))).size,
    offers: new Set(outcomes.filter((o) => o.reached === "offer").map((o) => String(o.userId))).size,
    mockInterviews: mocks,
    activeLast7d: members.filter((m) => m.updatedAt && new Date(m.updatedAt).getTime() >= week).length,
    responseRate: resolved.length ? Math.round((replied / resolved.length) * 100) : null,
  };
}

export async function listPartners(): Promise<any[]> {
  await connectToDatabase();
  const partners: any[] = await Partner.find({}).sort({ createdAt: -1 }).lean();
  return Promise.all(partners.map(async (p) => ({ ...p, funnel: await partnerFunnel(p.slug) })));
}
