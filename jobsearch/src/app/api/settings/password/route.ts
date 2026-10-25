import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { z } from "zod";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import User from "@/app/models/User";
import { signJwt, sessionClaims, SESSION_COOKIE } from "@/app/lib/jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

/** POST /api/settings/password { currentPassword, newPassword } — local accounts only. */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });

  await connectToDatabase();
  const user: any = await User.findById(userId).select("+password authProvider email admin");
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.authProvider && user.authProvider !== "local") {
    return NextResponse.json({ error: "This account signs in with " + user.authProvider }, { status: 400 });
  }
  const ok = await bcrypt.compare(parsed.data.currentPassword, user.password);
  if (!ok) return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
  // New password + tokenVersion bump in one write: every other session (e.g. a
  // stolen cookie) dies; this browser gets a fresh token so it stays signed in.
  const updated: any = await User.findByIdAndUpdate(
    userId,
    { $set: { password: await bcrypt.hash(parsed.data.newPassword, 10) }, $inc: { tokenVersion: 1 } },
    { new: true }
  ).select("email admin tokenVersion").lean();
  const res = NextResponse.json({ ok: true });
  if (updated) res.cookies.set({ ...SESSION_COOKIE, value: await signJwt(sessionClaims(updated)) });
  return res;
}
