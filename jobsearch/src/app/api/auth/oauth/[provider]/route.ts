import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { buildAuthorizeUrl, isConfigured, isProvider, redirectUri, safeNext } from "@/app/lib/oauth/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "oauth_state";

/**
 * GET /api/auth/oauth/{google|facebook}?next=/path
 * Starts the social login: stores a one-time CSRF state (+ destination) in a
 * short-lived cookie and redirects to the provider's consent screen.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  if (!isProvider(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }
  if (!isConfigured(provider)) {
    return NextResponse.redirect(new URL(`/Login?error=oauth_not_configured&provider=${provider}`, req.nextUrl.origin));
  }

  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const nonce = randomBytes(16).toString("hex");
  const state = `${nonce}.${Buffer.from(next).toString("base64url")}`;

  const res = NextResponse.redirect(buildAuthorizeUrl(provider, { redirectUri: redirectUri(req, provider), state }));
  res.cookies.set({
    name: STATE_COOKIE,
    value: state,
    httpOnly: true,
    path: "/api/auth/oauth",
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60,
  });
  return res;
}
