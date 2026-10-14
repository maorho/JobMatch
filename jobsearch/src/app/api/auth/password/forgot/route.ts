import { NextRequest, NextResponse } from "next/server";
import { requestPasswordReset } from "@/app/lib/auth/passwordReset";
import { clientIp, enforceRateLimits, HOUR_MS } from "@/app/lib/ops/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/auth/password/forgot { email } — always 200; mails a reset link when the account exists. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  // 3 reset mails per hour per address, 10 per hour per IP — no mailbox flooding.
  const limited = await enforceRateLimits([
    { key: `pwforgot:ip:${clientIp(req)}`, max: 10, windowMs: HOUR_MS },
    ...(email ? [{ key: `pwforgot:email:${email}`, max: 3, windowMs: HOUR_MS }] : []),
  ]);
  if (limited) return limited;
  try {
    const r = await requestPasswordReset(email);
    return NextResponse.json(r, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: any) {
    console.error("❌ password forgot:", err);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
