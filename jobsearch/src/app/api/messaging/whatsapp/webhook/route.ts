import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { handleInbound, sendChannelMessage, whatsappConfig } from "@/app/lib/messaging/channels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meta signs every delivery: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(raw body, app secret).
 * Verified on the raw bytes, before parsing. No app secret configured → nothing is processed (never fail open).
 */
function signatureValid(rawBody: string, header: string | null, appSecret: string): boolean {
  const presented = (header || "").trim().replace(/^sha256=/i, "");
  if (!presented) return false;
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(presented, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

/** Meta's webhook handshake: echo hub.challenge when the verify token matches. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const { verifyToken } = whatsappConfig();
  if (sp.get("hub.mode") === "subscribe" && verifyToken && sp.get("hub.verify_token") === verifyToken) {
    return new NextResponse(sp.get("hub.challenge") || "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/** Inbound messages: link / unlink by text; everything else gets a short hint. Always 200 so Meta doesn't retry. */
export async function POST(req: NextRequest) {
  const appSecret = (process.env.WHATSAPP_APP_SECRET || "").trim();
  if (!appSecret) {
    console.error("❌ whatsapp webhook: WHATSAPP_APP_SECRET is not set — refusing deliveries");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }
  const raw = await req.text().catch(() => "");
  if (!signatureValid(raw, req.headers.get("x-hub-signature-256"), appSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let body: any = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  const results: { from: string; reply: string }[] = [];
  try {
    for (const entry of body?.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const names = new Map<string, string>((value.contacts || []).map((c: any) => [c.wa_id, c.profile?.name || ""]));
        for (const msg of value.messages || []) {
          if (msg.type !== "text" || !msg.from) continue;
          const reply = await handleInbound("whatsapp", { id: String(msg.from), label: names.get(msg.from) || "" }, msg.text?.body || "");
          await sendChannelMessage("whatsapp", String(msg.from), reply);
          results.push({ from: String(msg.from), reply });
        }
      }
    }
  } catch (err) {
    console.error("❌ whatsapp webhook:", err);
  }
  return NextResponse.json({ ok: true, handled: results.length, results: process.env.NODE_ENV === "test" ? results : undefined });
}
