import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { z } from "zod";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import User from "@/app/models/User";

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
  const user: any = await User.findById(userId).select("password authProvider");
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.authProvider && user.authProvider !== "local") {
    return NextResponse.json({ error: "This account signs in with " + user.authProvider }, { status: 400 });
  }
  const ok = await bcrypt.compare(parsed.data.currentPassword, user.password);
  if (!ok) return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
  user.password = await bcrypt.hash(parsed.data.newPassword, 10);
  await user.save();
  return NextResponse.json({ ok: true });
}
