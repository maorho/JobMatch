import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

import User from "@/app/models/User";
import Notification from "@/app/models/Notification";
import { signJwt } from "@/app/lib/jwt";
import { setChannelSender, linkCodeFor, handleInbound, deliverToChannels, formatMessage, channelStatus, setChannelPrefs } from "@/app/lib/messaging/channels";
import { notify } from "@/app/lib/notifications/notify";
import { POST as waPOST, GET as waGET } from "@/app/api/messaging/whatsapp/webhook/route";
import { POST as tgPOST } from "@/app/api/messaging/telegram/webhook/route";
import { GET as channelsGET, POST as channelsPOST } from "@/app/api/settings/channels/route";

setupTestDb();

const sent: { channel: string; to: string; text: string }[] = [];
let dana = "";
let token = "";
beforeAll(async () => {
  await resetDb();
  dana = String((await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana Levi", phone: "0" } as any))._id);
  token = await signJwt({ id: dana });
  setChannelSender(async (channel, to, text) => {
    sent.push({ channel, to, text });
    return { id: `m${sent.length}` };
  });
  process.env.WHATSAPP_VERIFY_TOKEN = "verify-me-please";
});
afterAll(() => setChannelSender(null));
const authed = (url: string, init: RequestInit = {}) => new NextRequest(`http://localhost${url}`, { ...init, headers: { cookie: `token=${token}`, "Content-Type": "application/json", ...(init.headers || {}) } } as any);
const json = (url: string, body: unknown, headers: Record<string, string> = {}) => new NextRequest(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) } as any);

describe("messaging channels", () => {
  it("links WhatsApp from an inbound JOIN <code>, and confirms", async () => {
    const { code } = await linkCodeFor(dana);
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    expect((await linkCodeFor(dana)).code).toBe(code); // stable while valid
    const hint = await handleInbound("whatsapp", { id: "972501234567" }, "hello?");
    expect(hint).toMatch(/JOIN/);
    const res = await waPOST(json("/api/messaging/whatsapp/webhook", { entry: [{ changes: [{ value: { contacts: [{ wa_id: "972501234567", profile: { name: "Dana" } }], messages: [{ from: "972501234567", type: "text", text: { body: `join ${code.toLowerCase()}` } }] } }] }] }));
    expect((await res.json()).handled).toBe(1);
    expect(sent.at(-1)).toMatchObject({ channel: "whatsapp", to: "972501234567" });
    expect(sent.at(-1)!.text).toMatch(/Linked to Dana/);
    const u: any = await User.findById(dana).select("channels channelLinkCode").lean();
    expect(u.channels.whatsapp).toMatchObject({ id: "972501234567", label: "Dana" });
    expect(u.channelLinkCode).toBeUndefined(); // single use
    expect(await handleInbound("whatsapp", { id: "972500000000" }, `JOIN ${code}`)).toMatch(/does not match/);
  });

  it("the Meta handshake echoes the challenge only with the right verify token", async () => {
    const ok = await waGET(new NextRequest("http://localhost/api/messaging/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me-please&hub.challenge=12345"));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("12345");
    expect((await waGET(new NextRequest("http://localhost/api/messaging/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1"))).status).toBe(403);
  });

  it("links Telegram from /start <code> and moves an identity between accounts", async () => {
    const { code } = await linkCodeFor(dana);
    const res = await tgPOST(json("/api/messaging/telegram/webhook", { message: { chat: { id: 777 }, from: { first_name: "Dana", username: "dana_l" }, text: `/start ${code}` } }));
    expect((await res.json()).handled).toBe(1);
    const u: any = await User.findById(dana).select("channels").lean();
    expect(u.channels.telegram).toMatchObject({ id: "777", label: "Dana" });
    // Another account claims the same chat → it moves.
    const bob = String((await User.create({ username: "bob", email: "bob@test.dev", password: "x", fullname: "Bob", phone: "0" } as any))._id);
    const { code: bobCode } = await linkCodeFor(bob);
    await handleInbound("telegram", { id: "777", label: "Bob" }, `/start ${bobCode}`);
    expect(((await User.findById(dana).select("channels").lean()) as any).channels.telegram?.id).toBeUndefined();
    expect(((await User.findById(bob).select("channels").lean()) as any).channels.telegram.id).toBe("777");
    process.env.TELEGRAM_WEBHOOK_SECRET = "s3cret-token";
    expect((await tgPOST(json("/api/messaging/telegram/webhook", { message: { chat: { id: 1 }, text: "/start x" } }))).status).toBe(403);
    expect((await tgPOST(json("/api/messaging/telegram/webhook", { message: { chat: { id: 1 }, text: "hi" } }, { "x-telegram-bot-api-secret-token": "s3cret-token" }))).status).toBe(200);
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
  });

  it("every notification is pushed to the linked channels, honouring prefs, with an absolute link", async () => {
    sent.length = 0;
    await notify(dana, { type: "job_match", title: "3 משרות חדשות שמתאימות לך", body: "Junior React · Wix (85%)", link: "/" });
    expect(sent).toHaveLength(1); // WhatsApp only (Telegram moved to Bob)
    expect(sent[0]).toMatchObject({ channel: "whatsapp", to: "972501234567" });
    expect(sent[0].text).toMatch(/^\*3 משרות חדשות שמתאימות לך\*\n\nJunior React · Wix \(85%\)\n\nhttp:\/\/localhost:3000\/$/);
    expect(formatMessage("telegram", { title: "T", link: "/x" })).toBe("T\n\nhttp://localhost:3000/x");

    await setChannelPrefs(dana, { matches: false });
    await notify(dana, { type: "job_match", title: "m", link: "/" });
    expect(sent).toHaveLength(1); // matches muted
    await notify(dana, { type: "application_status", title: "קיבלת תשובה?", link: "/Dashboard#outcomes" });
    expect(sent).toHaveLength(2); // updates still on
    await notify(dana, { type: "system", title: "quiet", push: false });
    expect(sent).toHaveLength(2);
    expect(await Notification.countDocuments({ userId: dana })).toBe(4); // in-app always
    expect(await deliverToChannels(dana, { kind: "matches", title: "x" })).toEqual({});
  });

  it("the settings API shows status, unlinks, and sends a test message", async () => {
    const st = await (await channelsGET(authed("/api/settings/channels"))).json();
    expect(st.whatsapp).toMatchObject({ id: "972501234567" });
    expect(st.telegram).toBeNull();
    expect(st.code).toMatch(/^[A-Z2-9]{8}$/);
    expect(st.prefs).toEqual({ matches: false, updates: true });
    sent.length = 0;
    const t = await (await channelsPOST(authed("/api/settings/channels", { method: "POST", body: JSON.stringify({ test: true, prefs: { matches: true } }) }))).json();
    expect(t.test).toEqual({ whatsapp: true });
    expect(sent[0].text).toMatch(/connected/);
    const un = await (await channelsPOST(authed("/api/settings/channels", { method: "POST", body: JSON.stringify({ unlink: "whatsapp" }) }))).json();
    expect(un.whatsapp).toBeNull();
    expect(await handleInbound("whatsapp", { id: "972501234567" }, "STOP")).toMatch(/not linked/);
    expect((await channelStatus(dana)).configured).toEqual({ whatsapp: false, telegram: false });
  });
});
