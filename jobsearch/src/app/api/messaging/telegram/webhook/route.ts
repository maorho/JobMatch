import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { handleInbound, sendChannelMessage, telegramConfig } from "@/app/lib/messaging/channels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Telegram Bot API webhook (set with setWebhook, secret_token = TELEGRAM_WEBHOOK_SECRET).
 * /start <code> links the chat to the account that shows that code in Settings; /stop unlinks.
 */
export async function POST(req: NextRequest) {
  // The secret is mandatory: without it anyone could link chats to accounts. Never process unverified updates.
  const { webhookSecret } = telegramConfig();
  if (!webhookSecret) {
    console.error("❌ telegram webhook: TELEGRAM_WEBHOOK_SECRET is not set — refusing updates");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }
  const presented = req.headers.get("x-telegram-bot-api-secret-token") || "";
  const a = Buffer.from(presented);
  const b = Buffer.from(webhookSecret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const update: any = await req.json().catch(() => null);
  const msg = update?.message || update?.edited_message;
  if (!msg?.chat?.id || typeof msg.text !== "string") return NextResponse.json({ ok: true, handled: 0 });
  try {
    const label = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || (msg.from?.username ? `@${msg.from.username}` : "");
    const reply = await handleInbound("telegram", { id: String(msg.chat.id), label }, msg.text);
    await sendChannelMessage("telegram", String(msg.chat.id), reply);
    return NextResponse.json({ ok: true, handled: 1, reply: process.env.NODE_ENV === "test" ? reply : undefined });
  } catch (err) {
    console.error("❌ telegram webhook:", err);
    return NextResponse.json({ ok: true, handled: 0 });
  }
}
