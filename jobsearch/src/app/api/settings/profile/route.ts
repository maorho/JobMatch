import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import User from "@/app/models/User";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC = "username email fullname phone currentJob company recruiter admin authProvider avatar resumeScore resumeUpdatedAt createdAt";

const schema = z.object({
  fullname: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  currentJob: z.string().trim().max(120).optional(),
  company: z.string().trim().max(120).optional(),
});

/** GET /api/settings/profile — my editable profile. */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectToDatabase();
  const user = await User.findById(userId).select(PUBLIC).lean();
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ user });
}

/** PUT /api/settings/profile { fullname?, phone?, currentJob?, company? } */
export async function PUT(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues.map((i) => i.path.join(".")) }, { status: 400 });
  await connectToDatabase();
  const user = await User.findByIdAndUpdate(userId, { $set: parsed.data }, { new: true }).select(PUBLIC).lean();
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, user });
}
