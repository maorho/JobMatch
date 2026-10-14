import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";
import { signJwt, SESSION_COOKIE } from "@/app/lib/jwt";
import { clientIp, enforceRateLimits, MINUTE_MS } from "@/app/lib/ops/rateLimit";

export const runtime = "nodejs";

// One answer for "no such account" and "wrong password": the login form must
// not double as an email directory.
const INVALID = () => NextResponse.json({ message: "אימייל או סיסמה שגויים" }, { status: 401 });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");

  // 10 attempts per quarter hour, per address and per account.
  const limited = await enforceRateLimits([
    { key: `login:ip:${clientIp(req)}`, max: 10, windowMs: 15 * MINUTE_MS },
    ...(email ? [{ key: `login:email:${email}`, max: 10, windowMs: 15 * MINUTE_MS }] : []),
  ]);
  if (limited) return limited;
  if (!email || !password) return INVALID();

  await connectToDatabase();

  // Case-insensitive exact match so legacy accounts stored with mixed-case
  // emails still log in. The pattern is escaped + anchored (no ReDoS).
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const user = await User.findOne({
    email: new RegExp(`^${escaped}$`, "i"),
  }).select("+password email recruiter admin");
  if (!user) return INVALID();

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) return INVALID();

  const recruiter = !!user.recruiter;
  const admin = !!user.admin;
  const token = await signJwt({ id: String(user._id), email: user.email, admin });

  const response = NextResponse.json({
    message: "Login successful",
    recruiter,
    admin
  });

  response.cookies.set({ ...SESSION_COOKIE, value: token });

  return response;
}
