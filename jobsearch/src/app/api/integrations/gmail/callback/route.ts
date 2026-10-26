import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/app/lib/db";
import { getUserIdFromRequest } from "@/app/lib/getUserIdFromRequest";
import { appOrigin } from "@/app/lib/oauth/providers";
import { seal } from "@/app/lib/crypto/secretBox";
import User from "@/app/models/User";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "gmail_oauth_state";

function back(req: NextRequest, q: string) {
  const res = NextResponse.redirect(new URL(`/Settings?gmail=${q}`, req.nextUrl.origin));
  res.cookies.delete(STATE_COOKIE);
  return res;
}

/** GET /api/integrations/gmail/callback?code=&state= — store the sealed refresh token. */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.redirect(new URL("/Login", req.nextUrl.origin));
  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) return back(req, "denied");
  const code = sp.get("code") || "";
  const state = sp.get("state") || "";
  if (!code || !state || state !== (req.cookies.get(STATE_COOKIE)?.value || "")) return back(req, "state");

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        code,
        redirect_uri: `${appOrigin(req)}/api/integrations/gmail/callback`,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    });
    const tok = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tok.refresh_token) return back(req, tok.refresh_token ? "failed" : "no_refresh_token");

    // Which mailbox? (openid email scope → userinfo)
    let address = "";
    try {
      const ui = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` }, cache: "no-store" });
      address = String((await ui.json())?.email || "").toLowerCase();
    } catch { /* optional */ }

    await connectToDatabase();
    await User.updateOne({ _id: userId }, { $set: { "gmail.address": address, "gmail.refreshTokenSealed": seal(String(tok.refresh_token)), "gmail.connectedAt": new Date(), "gmail.lastError": "" } });
    return back(req, "connected");
  } catch (err) {
    console.error("❌ gmail callback:", err);
    return back(req, "failed");
  }
}
