import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import RateLimit from "@/app/models/RateLimit";

/**
 * Mongo-backed fixed-window rate limiter for the endpoints an attacker would
 * hammer (login, signup, password reset, verification codes). Works across
 * instances because the counter lives in the database, and costs one atomic
 * upsert per call. Keys are free-form: "login:ip:1.2.3.4", "login:email:…".
 */
export async function rateLimit(key: string, max: number, windowMs: number, opts: { windowStart?: Date } = {}): Promise<{ ok: boolean; retryAfterSec: number }> {
  await connectToDatabase();
  const now = Date.now();
  // Windows are aligned to the epoch unless the caller anchors one (e.g. to when a code was issued).
  const windowStart = opts.windowStart ?? new Date(Math.floor(now / windowMs) * windowMs);
  const row: any = await RateLimit.findOneAndUpdate(
    { key, windowStart },
    { $inc: { count: 1 }, $setOnInsert: { key, windowStart } },
    { upsert: true, new: true }
  ).lean();
  const retryAfterSec = Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now) / 1000));
  return { ok: row.count <= max, retryAfterSec };
}

/** The caller's IP as the proxy reports it (first x-forwarded-for hop, then x-real-ip). */
export function clientIp(req: NextRequest): string {
  const fwd = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  return fwd || (req.headers.get("x-real-ip") || "").trim() || "unknown";
}

/** 429 + Retry-After with a Hebrew message the UI can show as is. */
export function rateLimitResponse(retryAfterSec: number): NextResponse {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return NextResponse.json(
    { ok: false, error: "rate_limited", message: `יותר מדי ניסיונות. נסו שוב בעוד ${minutes} דקות.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSec), "Cache-Control": "private, no-store" } }
  );
}

/** Count one hit on each key; the 429 for the first one that is over its limit, otherwise null. */
export async function enforceRateLimits(limits: { key: string; max: number; windowMs: number }[]): Promise<NextResponse | null> {
  for (const l of limits) {
    const r = await rateLimit(l.key, l.max, l.windowMs);
    if (!r.ok) return rateLimitResponse(r.retryAfterSec);
  }
  return null;
}

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
