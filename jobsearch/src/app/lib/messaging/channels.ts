import crypto from "crypto";
import mongoose from "mongoose";
import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";
import { absolute } from "@/app/lib/seo/site";

/**
 * Messaging channels: the notifications people already get in-app, delivered
 * to WhatsApp (Meta Cloud API) and/or Telegram (Bot API) as well.
 *
 * Linking is always user-initiated (that is also what WhatsApp's 24-hour
 * rule needs): Settings shows a short code; the person sends "JOIN <code>"
 * to our WhatsApp number or opens the Telegram bot with /start <code>; the
 * webhook links the sender to the account. "STOP" unlinks.
 *
 * Env: WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID (+ WHATSAPP_DISPLAY_NUMBER for the UI, WHATSAPP_VERIFY_TOKEN for the
 * webhook handshake); TELEGRAM_BOT_TOKEN + TELEGRAM_BOT_USERNAME (+ TELEGRAM_WEBHOOK_SECRET).
 */
export type Channel = "whatsapp" | "telegram";
export const CHANNELS: Channel[] = ["whatsapp", "telegram"];
export const LINK_CODE_TTL_MS = 24 * 3600_000;

export type ChannelPrefs = { matches: boolean; updates: boolean };
export const DEFAULT_PREFS: ChannelPrefs = { matches: true, updates: true };

export const whatsappConfig = () => ({ token: process.env.WHATSAPP_TOKEN || "", phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "", displayNumber: process.env.WHATSAPP_DISPLAY_NUMBER || "", verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "" });
export const telegramConfig = () => ({ botToken: process.env.TELEGRAM_BOT_TOKEN || "", botUsername: (process.env.TELEGRAM_BOT_USERNAME || "").replace(/^@/, ""), webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || "" });
export const channelConfigured = (c: Channel) => (c === "whatsapp" ? !!(whatsappConfig().token && whatsappConfig().phoneNumberId) : !!telegramConfig().botToken);

/** Outbound sender; tests and other transports can replace it. */
export type ChannelSender = (channel: Channel, to: string, text: string) => Promise<{ id?: string }>;
let override: ChannelSender | null = null;
export function setChannelSender(s: ChannelSender | null) {
  override = s;
}

async function sendViaProvider(channel: Channel, to: string, text: string): Promise<{ id?: string }> {
  if (override) return override(channel, to, text);
  if (channel === "whatsapp") {
    const { token, phoneNumberId } = whatsappConfig();
    if (!token || !phoneNumberId) throw new Error("WhatsApp not configured");
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { preview_url: true, body: text.slice(0, 4000) } }),
    });
    if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j: any = await res.json().catch(() => ({}));
    return { id: j?.messages?.[0]?.id };
  }
  const { botToken } = telegramConfig();
  if (!botToken) throw new Error("Telegram not configured");
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: to, text: text.slice(0, 4000), disable_web_page_preview: false }),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j: any = await res.json().catch(() => ({}));
  return { id: j?.result?.message_id ? String(j.result.message_id) : undefined };
}

/** Send one message on one channel. Never throws. */
export async function sendChannelMessage(channel: Channel, to: string, text: string): Promise<boolean> {
  try {
    await sendViaProvider(channel, to, text);
    return true;
  } catch (e) {
    console.warn(`[channels] ${channel} send failed:`, (e as Error)?.message);
    return false;
  }
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeCode = () => Array.from(crypto.randomBytes(8), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");

/** The person's current link code (a fresh one when missing or expired). */
export async function linkCodeFor(userId: string): Promise<{ code: string; expiresAt: Date }> {
  await connectToDatabase();
  const u: any = await User.findById(userId).select("+channelLinkCode channelLinkCodeExpires").lean();
  if (u?.channelLinkCode && u.channelLinkCodeExpires && new Date(u.channelLinkCodeExpires).getTime() > Date.now() + 60_000) return { code: u.channelLinkCode, expiresAt: new Date(u.channelLinkCodeExpires) };
  const code = makeCode();
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
  await User.updateOne({ _id: userId }, { $set: { channelLinkCode: code, channelLinkCodeExpires: expiresAt } });
  return { code, expiresAt };
}

export type ChannelLink = { id: string; label: string; linkedAt: Date };

/** Link the sender of "JOIN <code>" / "/start <code>" to the account that owns the code. */
export async function linkByCode(rawCode: string, channel: Channel, identity: { id: string; label?: string }): Promise<{ ok: true; userId: string; name: string } | { ok: false; reason: "invalid" | "expired" }> {
  await connectToDatabase();
  const code = (rawCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length < 6) return { ok: false, reason: "invalid" };
  const u: any = await User.findOne({ channelLinkCode: code }).select("_id fullname username channelLinkCodeExpires").lean();
  if (!u) return { ok: false, reason: "invalid" };
  if (!u.channelLinkCodeExpires || new Date(u.channelLinkCodeExpires).getTime() < Date.now()) return { ok: false, reason: "expired" };
  // One identity per account per channel; the same WhatsApp/Telegram id can't stay linked to two accounts.
  await User.updateMany({ [`channels.${channel}.id`]: identity.id, _id: { $ne: u._id } }, { $unset: { [`channels.${channel}`]: 1 } });
  await User.updateOne({ _id: u._id }, { $set: { [`channels.${channel}`]: { id: identity.id, label: identity.label || "", linkedAt: new Date() }, channelPrefs: DEFAULT_PREFS }, $unset: { channelLinkCode: 1, channelLinkCodeExpires: 1 } });
  return { ok: true, userId: String(u._id), name: u.fullname || u.username || "" };
}

export async function unlinkChannel(userId: string, channel: Channel): Promise<void> {
  await connectToDatabase();
  await User.updateOne({ _id: userId }, { $unset: { [`channels.${channel}`]: 1 } });
}

export async function unlinkByIdentity(channel: Channel, id: string): Promise<number> {
  await connectToDatabase();
  const r = await User.updateMany({ [`channels.${channel}.id`]: id }, { $unset: { [`channels.${channel}`]: 1 } });
  return r.modifiedCount;
}

export async function setChannelPrefs(userId: string, prefs: Partial<ChannelPrefs>): Promise<ChannelPrefs> {
  await connectToDatabase();
  const u: any = await User.findById(userId).select("channelPrefs").lean();
  const next = { ...DEFAULT_PREFS, ...(u?.channelPrefs || {}), ...prefs };
  await User.updateOne({ _id: userId }, { $set: { channelPrefs: next } });
  return next;
}

export async function channelStatus(userId: string): Promise<{ whatsapp: ChannelLink | null; telegram: ChannelLink | null; prefs: ChannelPrefs; code: string; configured: Record<Channel, boolean>; whatsappNumber: string; telegramBot: string }> {
  await connectToDatabase();
  const u: any = await User.findById(userId).select("channels channelPrefs").lean();
  const { code } = await linkCodeFor(userId);
  return {
    whatsapp: u?.channels?.whatsapp?.id ? { id: u.channels.whatsapp.id, label: u.channels.whatsapp.label || "", linkedAt: u.channels.whatsapp.linkedAt } : null,
    telegram: u?.channels?.telegram?.id ? { id: u.channels.telegram.id, label: u.channels.telegram.label || "", linkedAt: u.channels.telegram.linkedAt } : null,
    prefs: { ...DEFAULT_PREFS, ...(u?.channelPrefs || {}) },
    code,
    configured: { whatsapp: channelConfigured("whatsapp"), telegram: channelConfigured("telegram") },
    whatsappNumber: whatsappConfig().displayNumber,
    telegramBot: telegramConfig().botUsername,
  };
}

/** Plain-text rendering of a notification (WhatsApp has *bold*; Telegram plain). */
export function formatMessage(channel: Channel, n: { title: string; body?: string; link?: string }): string {
  const title = channel === "whatsapp" ? `*${n.title}*` : n.title;
  const link = n.link ? absolute(n.link) : "";
  return [title, n.body || "", link].filter(Boolean).join("\n\n").slice(0, 3900);
}

export type Deliverable = { title: string; body?: string; link?: string; kind: "matches" | "updates" };

/** Push a notification to every channel the person linked (honouring their prefs). Best-effort; never throws. */
export async function deliverToChannels(userId: string | mongoose.Types.ObjectId, n: Deliverable): Promise<Partial<Record<Channel, boolean>>> {
  const out: Partial<Record<Channel, boolean>> = {};
  try {
    if (!mongoose.isValidObjectId(userId)) return out;
    await connectToDatabase();
    const u: any = await User.findById(userId).select("channels channelPrefs").lean();
    if (!u?.channels) return out;
    const prefs = { ...DEFAULT_PREFS, ...(u.channelPrefs || {}) };
    if (!prefs[n.kind]) return out;
    for (const c of CHANNELS) {
      const link = u.channels[c];
      if (!link?.id) continue;
      if (!override && !channelConfigured(c)) continue;
      out[c] = await sendChannelMessage(c, link.id, formatMessage(c, n));
    }
  } catch (e) {
    console.warn("[channels] deliver failed:", (e as Error)?.message);
  }
  return out;
}

/**
 * Inbound text from a webhook → what to reply. Understands JOIN <code> (WhatsApp),
 * /start <code> (Telegram) and STOP / /stop.
 */
export async function handleInbound(channel: Channel, from: { id: string; label?: string }, text: string): Promise<string> {
  const t = (text || "").trim();
  const stop = /^(stop|\/stop|unsubscribe|הסר)$/i.test(t);
  if (stop) {
    const n = await unlinkByIdentity(channel, from.id);
    return n ? "Done — JobMatch will not message you here any more. You can relink from Settings whenever you like." : "This number is not linked to a JobMatch account.";
  }
  const m = /^(?:join|\/start|התחבר)\s+([A-Za-z0-9]{6,12})/i.exec(t) || /^([A-Za-z0-9]{8})$/.exec(t);
  if (!m) return channel === "whatsapp" ? "Hi! To get your JobMatch matches here, send JOIN followed by the code shown in Settings → Messaging (for example: JOIN ABCD2345). Send STOP to stop." : "Hi! Open Settings → Messaging in JobMatch and tap the Telegram button, or send /start <code>. Send /stop to stop.";
  const r = await linkByCode(m[1], channel, from);
  if (r.ok) return `Linked to ${r.name || "your JobMatch account"} ✅ New matches, replies to your applications and practice grades will arrive here. Send STOP any time.`;
  return r.reason === "expired" ? "That code has expired — open Settings → Messaging in JobMatch for a fresh one." : "That code does not match any account. Copy it exactly from Settings → Messaging.";
}
