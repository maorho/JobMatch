import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, fetchProfile, isProvider, redirectUri, safeNext } from "@/app/lib/oauth/providers";
import { findOrCreateOAuthUser } from "@/app/lib/oauth/users";
import { attachPartner, REF_COOKIE } from "@/app/lib/partners/partners";
import { signJwt, sessionClaims, SESSION_COOKIE } from "@/app/lib/jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "oauth_state";

function fail(req: NextRequest, reason: string) {
  const res = NextResponse.redirect(new URL(`/Login?error=${encodeURIComponent(reason)}`, req.nextUrl.origin));
  res.cookies.delete(STATE_COOKIE);
  return res;
}

/**
 * GET /api/auth/oauth/{provider}/callback?code=&state=
 * Verifies the CSRF state, exchanges the code, finds/creates the user and
 * issues the app's `token` cookie — identical to /api/auth/login.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  if (!isProvider(provider)) return fail(req, "oauth_provider");

  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) return fail(req, "oauth_denied");
  const code = sp.get("code") || "";
  const state = sp.get("state") || "";
  const expected = req.cookies.get(STATE_COOKIE)?.value || "";
  if (!code || !state || !expected || state !== expected) return fail(req, "oauth_state");

  let next = "/";
  try {
    next = safeNext(Buffer.from(state.split(".")[1] || "", "base64url").toString("utf8"));
  } catch {
    next = "/";
  }

  try {
    const accessToken = await exchangeCode(provider, code, redirectUri(req, provider));
    const profile = await fetchProfile(provider, accessToken);
    const { user, created } = await findOrCreateOAuthUser(profile);
    const ref = req.cookies.get(REF_COOKIE)?.value || "";
    if (created && ref) await attachPartner(String(user._id), ref).catch(() => null);

    const token = await signJwt(sessionClaims(user));
    // New social accounts start with onboarding (résumé → contacts → auto-apply).
    const dest = created && next === "/" ? "/onboarding" : next;
    // Belt and braces on top of safeNext: never redirect off our own origin.
    let target = new URL(dest, req.nextUrl.origin);
    if (target.origin !== req.nextUrl.origin) target = new URL("/", req.nextUrl.origin);
    const res = NextResponse.redirect(target);
    res.cookies.set({ ...SESSION_COOKIE, value: token });
    res.cookies.delete(STATE_COOKIE);
    if (ref) res.cookies.delete(REF_COOKIE);
    return res;
  } catch (err: any) {
    console.error(`❌ oauth ${provider} callback:`, err?.message || err);
    return fail(req, err?.code === "EMAIL_UNVERIFIED" ? "oauth_email_unverified" : "oauth_failed");
  }
}
