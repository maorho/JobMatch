import { memo, ttl } from "@/app/lib/cache";
import { channelConfigured, telegramConfig, whatsappConfig, type Channel } from "./channels";

/**
 * "Configured" is not "working": a token can be present and revoked. A channel
 * is offered to people only after a live check against the provider passed —
 * Telegram's getMe, WhatsApp's phone-number lookup — cached for ten minutes
 * so the Settings page never waits on the providers. Without the env vars the
 * answer is false with no network call (tests, local dev).
 */
export type ChannelHealth = { configured: boolean; reachable: boolean; detail: string };

async function probe(channel: Channel, fetchImpl: typeof fetch = fetch): Promise<ChannelHealth> {
  if (!channelConfigured(channel)) return { configured: false, reachable: false, detail: "not configured" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6_000);
  try {
    if (channel === "telegram") {
      const r = await fetchImpl(`https://api.telegram.org/bot${telegramConfig().botToken}/getMe`, { signal: ctrl.signal, cache: "no-store" });
      const d: any = await r.json().catch(() => ({}));
      return d?.ok ? { configured: true, reachable: true, detail: `@${d.result?.username || ""}` } : { configured: true, reachable: false, detail: d?.description || `HTTP ${r.status}` };
    }
    const { token, phoneNumberId } = whatsappConfig();
    const r = await fetchImpl(`https://graph.facebook.com/v19.0/${phoneNumberId}?fields=display_phone_number&access_token=${encodeURIComponent(token)}`, { signal: ctrl.signal, cache: "no-store" });
    const d: any = await r.json().catch(() => ({}));
    return r.ok && !d?.error ? { configured: true, reachable: true, detail: d?.display_phone_number || "" } : { configured: true, reachable: false, detail: d?.error?.message || `HTTP ${r.status}` };
  } catch (e) {
    return { configured: true, reachable: false, detail: (e as Error)?.name === "AbortError" ? "timeout" : (e as Error)?.message || "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

/** Health of both channels, cached; `fresh` skips the cache (admin health page). */
export async function channelsHealth(opts: { fresh?: boolean; fetchImpl?: typeof fetch } = {}): Promise<Record<Channel, ChannelHealth>> {
  const run = async () => ({ whatsapp: await probe("whatsapp", opts.fetchImpl), telegram: await probe("telegram", opts.fetchImpl) });
  if (opts.fresh || process.env.NODE_ENV === "test") return run();
  return memo("channels-health", ttl(10 * 60_000), run);
}
