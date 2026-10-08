import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import User from "@/app/models/User";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → onboarding state; POST { contactsStep?: "skipped"|"done", complete?: true }. */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectToDatabase();
  const u: any = await User.findById(userId).select("onboarding resumeUpdatedAt autoApply fullname").lean();
  return NextResponse.json({ ok: true, onboarding: u?.onboarding || {}, hasResume: !!u?.resumeUpdatedAt, autoApply: !!u?.autoApply?.enabled, fullname: u?.fullname || "" });
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const set: Record<string, unknown> = {};
  if (body?.contactsStep === "skipped" || body?.contactsStep === "done") set["onboarding.contactsStep"] = body.contactsStep;
  if (body?.complete === true) set["onboarding.completedAt"] = new Date();
  if (!Object.keys(set).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  await connectToDatabase();
  await User.updateOne({ _id: userId }, { $set: set });
  return NextResponse.json({ ok: true });
}
