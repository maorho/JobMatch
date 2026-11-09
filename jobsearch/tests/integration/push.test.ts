import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

process.env.VAPID_PUBLIC_KEY = "BPublicKeyPublicKeyPublicKeyPublicKeyPublicKeyPublicKeyPublicKeyPublicKeyPublicKeyPublicKeyX";
process.env.VAPID_PRIVATE_KEY = "privateprivateprivateprivate";

import User from "@/app/models/User";
import PushSubscription from "@/app/models/PushSubscription";
import Notification from "@/app/models/Notification";
import { signJwt } from "@/app/lib/jwt";
import { setPushSender, pushToUser } from "@/app/lib/push/webpush";
import { notify } from "@/app/lib/notifications/notify";
import { GET as statusGET, POST as subscribePOST, DELETE as unsubscribeDELETE } from "@/app/api/push/subscribe/route";

setupTestDb();

const O = "http://localhost";
let dana = "", token = "";
const sent: { endpoint: string; payload: any }[] = [];
let failWith: Record<string, number> = {};

beforeAll(async () => {
  await resetDb();
  dana = String((await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana", phone: "0" } as any))._id);
  token = await signJwt({ id: dana });
  setPushSender(async (sub, payload) => {
    const status = failWith[sub.endpoint];
    if (status) {
      const e: any = new Error("push failed");
      e.statusCode = status;
      throw e;
    }
    sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
  });
});
afterAll(() => setPushSender(null));

const authed = (init: RequestInit = {}) => new NextRequest(`${O}/api/push/subscribe`, { ...init, headers: { cookie: `token=${token}`, "Content-Type": "application/json", ...(init.headers || {}) } } as any);
const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: "p", auth: "a" } });

describe("web push", () => {
  it("registers a device for the signed-in person (and nobody else), confirms with a push, and reports it", async () => {
    expect((await statusGET(new NextRequest(`${O}/api/push/subscribe`))).status).toBe(401);
    const s0 = await (await statusGET(authed())).json();
    expect(s0).toMatchObject({ configured: true, devices: 0 });
    expect(s0.publicKey).toBe(process.env.VAPID_PUBLIC_KEY);

    const bad = await subscribePOST(authed({ method: "POST", body: JSON.stringify({ subscription: { endpoint: "http://not-https" } }) }));
    expect(bad.status).toBe(400);
    const ok = await subscribePOST(authed({ method: "POST", body: JSON.stringify({ subscription: sub("https://push.example/one") }) }));
    expect(await ok.json()).toMatchObject({ ok: true, devices: 1 });
    expect(sent.at(-1)?.payload.title).toBe("JobMatch"); // the confirmation push
    // Re-registering the same endpoint is an update, not a second device.
    await subscribePOST(authed({ method: "POST", body: JSON.stringify({ subscription: sub("https://push.example/one"), confirm: false }) }));
    expect(await PushSubscription.countDocuments({ userId: dana })).toBe(1);
  });

  it("a notification reaches every device; a gone device (410) is dropped, a flaky one is kept until five failures", async () => {
    await subscribePOST(authed({ method: "POST", body: JSON.stringify({ subscription: sub("https://push.example/two"), confirm: false }) }));
    sent.length = 0;
    await notify(dana, { type: "job_match", title: "3 משרות חדשות", body: "Backend @ Acme", link: "/?posted=1" });
    expect(sent.map((s) => s.endpoint).sort()).toEqual(["https://push.example/one", "https://push.example/two"]);
    expect(sent[0].payload).toMatchObject({ title: "3 משרות חדשות", url: "/?posted=1", tag: "job_match" });
    expect(await Notification.countDocuments({ userId: dana })).toBe(1); // the in-app notification is still written

    failWith = { "https://push.example/two": 410 };
    const r = await pushToUser(dana, { title: "x" });
    expect(r).toMatchObject({ sent: 1, removed: 1 });
    expect(await PushSubscription.countDocuments({ userId: dana })).toBe(1);

    failWith = { "https://push.example/one": 500 };
    for (let i = 0; i < 4; i++) await pushToUser(dana, { title: "x" });
    expect(await PushSubscription.countDocuments({ userId: dana })).toBe(1); // four failures: still here
    expect(((await PushSubscription.findOne({ userId: dana }).lean()) as any).failures).toBe(4);
    await pushToUser(dana, { title: "x" });
    expect(await PushSubscription.countDocuments({ userId: dana })).toBe(0); // the fifth drops it
    failWith = {};
  });

  it("unregisters by endpoint, only the owner's", async () => {
    await subscribePOST(authed({ method: "POST", body: JSON.stringify({ subscription: sub("https://push.example/three"), confirm: false }) }));
    const other = String((await User.create({ username: "omer", email: "omer@test.dev", password: "x", fullname: "Omer", phone: "0" } as any))._id);
    const otherToken = await signJwt({ id: other });
    const notMine = await unsubscribeDELETE(new NextRequest(`${O}/api/push/subscribe`, { method: "DELETE", headers: { cookie: `token=${otherToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: "https://push.example/three" }) } as any));
    expect(await notMine.json()).toMatchObject({ removed: false });
    const mine = await unsubscribeDELETE(authed({ method: "DELETE", body: JSON.stringify({ endpoint: "https://push.example/three" }) }));
    expect(await mine.json()).toMatchObject({ removed: true, devices: 0 });
  });
});
