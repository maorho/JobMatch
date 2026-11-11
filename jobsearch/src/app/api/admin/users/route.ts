import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
import { requireAdmin } from "@/app/lib/authGuard";
import User from "@/app/models/User";
import UsageCounter from "@/app/models/UsageCounter";
import LlmUsage from "@/app/models/LlmUsage";
import { FREE_MONTHLY_LIMITS, USAGE_KEYS, forgetAccount, monthKey, monthlyLimitFor } from "@/app/lib/ops/quota";
import { deleteAccount } from "@/app/lib/account/deleteAccount";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The admin's user console (/AdminDashboard/users).
 *   GET    ?q=&filter=&page=&limit=  → a page of accounts with this month's usage and AI spend
 *   PATCH  { userId, plan?, admin?, disabled?, resetMonthlyUsage? } → change one account
 *   DELETE { userId, confirm: "DELETE" } → delete an account and everything keyed to it
 * An admin cannot demote, disable or delete their own account here.
 */
export const FILTERS = ["all", "admins", "recruiters", "pro", "free", "disabled", "new", "withResume"] as const;
export type UsersFilter = (typeof FILTERS)[number];

type Row = {
  _id: mongoose.Types.ObjectId;
  fullname?: string;
  username?: string;
  email?: string;
  createdAt?: Date;
  admin?: boolean;
  recruiter?: boolean;
  approved?: boolean;
  company?: string;
  plan?: string;
  disabled?: boolean;
  authProvider?: string;
  level?: string;
  resumeUpdatedAt?: Date;
  onboarding?: { completedAt?: Date };
  partner?: { slug?: string };
  autoApply?: { enabled?: boolean };
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectToDatabase();
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") || "").trim().slice(0, 80);
  const filter = (FILTERS as readonly string[]).includes(sp.get("filter") || "") ? (sp.get("filter") as UsersFilter) : "all";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(5, parseInt(sp.get("limit") || "25", 10) || 25));

  const where: Record<string, unknown> = {};
  if (q) {
    const re = new RegExp(escapeRe(q), "i");
    where.$or = [{ fullname: re }, { email: re }, { username: re }, { company: re }];
  }
  if (filter === "admins") where.admin = true;
  if (filter === "recruiters") where.recruiter = true;
  if (filter === "pro") where.$and = [{ $or: [{ plan: "pro" }, { admin: true }] }];
  if (filter === "free") Object.assign(where, { plan: { $ne: "pro" }, admin: { $ne: true } });
  if (filter === "disabled") where.disabled = true;
  if (filter === "new") where.createdAt = { $gte: new Date(Date.now() - 7 * 86_400_000) };
  if (filter === "withResume") where.resumeUpdatedAt = { $exists: true };

  const [total, rows] = await Promise.all([
    User.countDocuments(where),
    User.find(where).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).select("fullname username email createdAt admin recruiter approved company plan disabled authProvider level resumeUpdatedAt onboarding.completedAt partner.slug autoApply.enabled").lean<Row[]>(),
  ]);
  const ids = rows.map((r) => r._id);
  const month = monthKey();
  const [usage, spend] = await Promise.all([
    UsageCounter.find({ userId: { $in: ids }, day: month }).select("userId key n").lean<{ userId: mongoose.Types.ObjectId; key: string; n: number }[]>(),
    LlmUsage.aggregate<{ _id: mongoose.Types.ObjectId; usd: number; calls: number }>([{ $match: { userId: { $in: ids }, day: { $regex: `^${month}` } } }, { $group: { _id: "$userId", usd: { $sum: "$usd" }, calls: { $sum: "$calls" } } }]),
  ]);
  const usageOf = new Map<string, Record<string, number>>();
  for (const u of usage) {
    const k = String(u.userId);
    usageOf.set(k, { ...(usageOf.get(k) || {}), [u.key]: u.n });
  }
  const spendOf = new Map(spend.map((s) => [String(s._id), { usd: Math.round(s.usd * 100) / 100, calls: s.calls }]));

  const users = rows.map((r) => {
    const id = String(r._id);
    const plan: "free" | "pro" = r.plan === "pro" || r.admin ? "pro" : "free";
    const used = usageOf.get(id) || {};
    return {
      id,
      fullname: r.fullname || "",
      username: r.username || "",
      email: r.email || "",
      createdAt: r.createdAt || null,
      admin: !!r.admin,
      recruiter: !!r.recruiter,
      approved: !!r.approved,
      company: r.company || "",
      plan,
      disabled: !!r.disabled,
      authProvider: r.authProvider || "local",
      level: r.level || "",
      hasResume: !!r.resumeUpdatedAt,
      onboarded: !!r.onboarding?.completedAt,
      partner: r.partner?.slug || "",
      autoApply: !!r.autoApply?.enabled,
      usage: USAGE_KEYS.map((key) => ({ key, used: used[key] || 0, limit: plan === "free" ? monthlyLimitFor(key) : null })).filter((u) => u.used > 0 || u.limit !== null),
      usageTotal: Object.values(used).reduce((a, b) => a + b, 0),
      spend: spendOf.get(id) || { usd: 0, calls: 0 },
    };
  });
  return NextResponse.json({ ok: true, users, total, page, pages: Math.max(1, Math.ceil(total / limit)), month, limits: FREE_MONTHLY_LIMITS }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(req: NextRequest) {
  const me = await requireAdmin(req);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const userId = String(body?.userId || "");
  if (!mongoose.isValidObjectId(userId)) return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  const self = userId === me.id;
  const set: Record<string, unknown> = {};
  if (body.plan !== undefined) {
    if (body.plan !== "free" && body.plan !== "pro") return NextResponse.json({ error: "plan must be free or pro" }, { status: 400 });
    set.plan = body.plan;
  }
  if (body.admin !== undefined) {
    if (self && body.admin === false) return NextResponse.json({ error: "You cannot remove your own admin role" }, { status: 400 });
    set.admin = !!body.admin;
  }
  if (body.disabled !== undefined) {
    if (self && body.disabled === true) return NextResponse.json({ error: "You cannot disable your own account" }, { status: 400 });
    set.disabled = !!body.disabled;
  }
  if (!Object.keys(set).length && body.resetMonthlyUsage !== true) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  await connectToDatabase();
  const user = await User.findById(userId).select("_id");
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (Object.keys(set).length) await User.updateOne({ _id: userId }, { $set: set });
  if (body.resetMonthlyUsage === true) await UsageCounter.deleteMany({ userId, day: monthKey() });
  forgetAccount(userId);
  return NextResponse.json({ ok: true, changed: Object.keys(set), resetMonthlyUsage: body.resetMonthlyUsage === true });
}

export async function DELETE(req: NextRequest) {
  const me = await requireAdmin(req);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const userId = String(body?.userId || "");
  if (!mongoose.isValidObjectId(userId)) return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  if (body?.confirm !== "DELETE") return NextResponse.json({ error: 'Send { "confirm": "DELETE" }' }, { status: 400 });
  if (userId === me.id) return NextResponse.json({ error: "Delete your own account from Settings" }, { status: 400 });
  if (!(await deleteAccount(userId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  forgetAccount(userId);
  return NextResponse.json({ ok: true });
}
