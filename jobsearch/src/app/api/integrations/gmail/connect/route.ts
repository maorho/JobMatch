import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { appOrigin } from "@/app/lib/oauth/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GMAIL_STATE_COOKIE = "gmail_oauth_state";
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly openid email";

/**
 * GET /api/integrations/gmail/connect — start Gmail read-only consent for
 * the signed-in user (offline access → refresh token). Uses the same Google
 * app as social login; the callback is /api/integrations/gmail/callback.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.redirect(new URL("/Login?next=/Settings", req.nextUrl.origin));
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.TOKEN_ENCRYPTION_KEY) {
    return NextResponse.redirect(new URL("/Settings?gmail=not_configured", req.nextUrl.origin));
  }
  const state = randomBytes(16).toString("hex");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", `${appOrigin(req)}/api/integrations/gmail/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url.toString());
  res.cookies.set({ name: GMAIL_STATE_COOKIE, value: state, httpOnly: true, path: "/api/integrations/gmail", secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600 });
  return res;
}
