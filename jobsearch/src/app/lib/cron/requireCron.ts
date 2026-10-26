import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * The one guard for cron / service-to-service routes. Accepts the secret as
 * `Authorization: Bearer <CRON_SECRET>` (preferred), the `x-service-token`
 * header (what the voice/phone internals already send), or the legacy
 * `?cron_secret=` query (kept so existing schedules keep working; move them
 * to the header — query strings end up in access logs).
 *
 * Fails closed: no CRON_SECRET configured → nothing gets in. Comparison is
 * constant-time on equal-length buffers.
 */
export function presentedCronSecret(req: NextRequest): string {
  const auth = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (m) return m[1].trim();
  const header = (req.headers.get("x-service-token") || "").trim();
  if (header) return header;
  return (req.nextUrl.searchParams.get("cron_secret") || "").trim();
}

export function isCronSecret(presented: string): boolean {
  const expected = (process.env.CRON_SECRET || "").trim();
  if (!expected || !presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** A 401 when the request does not carry the cron secret, otherwise null (continue). */
export function requireCron(req: NextRequest): NextResponse | null {
  if (isCronSecret(presentedCronSecret(req))) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
