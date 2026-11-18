import { describe, it, expect, afterEach } from "vitest";
import { channelsHealth } from "@/app/lib/messaging/health";

const fakeFetch = (routes: Record<string, { status?: number; body: unknown }>, calls: string[] = []) =>
  (async (url: string | URL | Request) => {
    const u = String(url);
    calls.push(u);
    const hit = Object.entries(routes).find(([k]) => u.includes(k));
    const r = hit ? hit[1] : { status: 404, body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;

afterEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
});

describe("channel health: configured is not the same as working", () => {
  it("without env vars nothing is offered and no provider is called", async () => {
    const calls: string[] = [];
    const h = await channelsHealth({ fetchImpl: fakeFetch({}, calls) });
    expect(h.telegram).toEqual({ configured: false, reachable: false, detail: "not configured" });
    expect(h.whatsapp.configured).toBe(false);
    expect(calls).toEqual([]);
  });

  it("a live check decides: getMe ok → reachable; a revoked WhatsApp token → configured but not reachable", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "123:abc";
    process.env.WHATSAPP_TOKEN = "dead";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "555";
    const h = await channelsHealth({
      fetchImpl: fakeFetch({ "api.telegram.org/bot123:abc/getMe": { body: { ok: true, result: { username: "jobmatch_bot" } } }, "graph.facebook.com/v19.0/555": { status: 401, body: { error: { message: "Invalid OAuth access token" } } } }),
    });
    expect(h.telegram).toEqual({ configured: true, reachable: true, detail: "@jobmatch_bot" });
    expect(h.whatsapp).toEqual({ configured: true, reachable: false, detail: "Invalid OAuth access token" });
  });
});
