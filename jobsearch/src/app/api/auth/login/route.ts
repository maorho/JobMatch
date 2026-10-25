import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";
import { signJwt, sessionClaims, SESSION_COOKIE } from "@/app/lib/jwt";
import { clientIp, checkRateLimits, recordRateLimitHits, MINUTE_MS } from "@/app/lib/ops/rateLimit";

export const runtime = "nodejs";

// One answer for "no such account" and "wrong password": the login form must
// not double as an email directory.
const INVALID = () => NextResponse.json({ message: "אימייל או סיסמה שגויים" }, { status: 401 });

/**
 * Brute-force limits count FAILED logins only: a successful sign-in never adds
 * to them, so nobody can lock a person out by logging in as themselves (or a
 * shared office IP out by its own users). Once a counter is at its limit,
 * every attempt in that window is refused — including one with the right
 * password, which is the point of the per-account limit: a guesser who finds
 * the password on try #11 must not learn it.
 */
const IP_FAILURES = 50;
const EMAIL_FAILURES = 10;
const WINDOW_MS = 15 * MINUTE_MS;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");

  const limits = [
    { key: `login:ip:${clientIp(req)}`, max: IP_FAILURES, windowMs: WINDOW_MS },
    ...(email ? [{ key: `login:email:${email}`, max: EMAIL_FAILURES, windowMs: WINDOW_MS }] : []),
  ];
  const limited = await checkRateLimits(limits);
  if (limited) return limited;
  const fail = async () => {
    await recordRateLimitHits(limits);
    return INVALID();
  };
  if (!email || !password) return fail();

  await connectToDatabase();

  // Case-insensitive exact match so legacy accounts stored with mixed-case
  // emails still log in. The pattern is escaped + anchored (no ReDoS).
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const user = await User.findOne({
    email: new RegExp(`^${escaped}$`, "i"),
  }).select("+password email recruiter admin tokenVersion");
  if (!user) return fail();

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) return fail();

  const recruiter = !!user.recruiter;
  const admin = !!user.admin;
  const token = await signJwt(sessionClaims(user));

  const response = NextResponse.json({
    message: "Login successful",
    recruiter,
    admin
  });

  response.cookies.set({ ...SESSION_COOKIE, value: token });

  return response;
}
