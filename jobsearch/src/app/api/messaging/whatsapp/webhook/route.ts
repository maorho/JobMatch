import { NextRequest, NextResponse } from "next/server";
import { handleInbound, sendChannelMessage, whatsappConfig } from "@/app/lib/messaging/channels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const body: any = await req.json().catch(() => null);
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
