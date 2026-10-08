import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcrypt";
import { setupTestDb, resetDb } from "../setup/mongo";
import User from "@/app/models/User";
import ExternalJobs from "@/app/models/ExternalJobs";
import CompanySource from "@/app/models/CompanySource";
import ContactMessage from "@/app/models/ContactMessage";
import Notification from "@/app/models/Notification";
import { signJwt } from "@/app/lib/jwt";
import { GET as companiesGET } from "@/app/api/companies/route";
import { POST as contactPOST } from "@/app/api/contact/route";
import { GET as profileGET, PUT as profilePUT } from "@/app/api/settings/profile/route";
import { POST as passwordPOST } from "@/app/api/settings/password/route";
import { DELETE as accountDELETE } from "@/app/api/settings/account/route";
import { ARTICLES, getArticle } from "@/app/content/articles";

setupTestDb();

const O = "http://localhost";
const cookie = async (id: string) => ({ cookie: `token=${await signJwt({ id })}`, "Content-Type": "application/json" });
const j = async (res: Response) => ({ status: res.status, body: await res.json() });
let me = "";

beforeAll(async () => {
  await resetDb();
  me = String((await User.create({ username: "me", email: "me@test.dev", password: await bcrypt.hash("oldpass123", 4), fullname: "Me", phone: "050", authProvider: "local" } as any))._id);
  const mk = (id: string, company: string, job: string, extra = {}) => ({ job, company, city: "Tel Aviv", country: "Israel", url: id, finalUrl: id, description: "", skills: [], seniority: [], source: "greenhouse", sourceJobId: id, companyDomain: company.toLowerCase() + ".com", ...extra });
  await ExternalJobs.create([mk("a1", "Acme", "Junior Dev"), mk("a2", "Acme", "Senior Dev", { remote: true }), mk("g1", "Globex", "Intern", { city: "Haifa" })] as any);
  await CompanySource.create({ companyName: "Acme", atsType: "greenhouse", identifier: "acme", domain: "careers.acme.com", careersUrl: "https://boards.greenhouse.io/acme", enabled: true } as any);
});

describe("GET /api/companies", () => {
  it("aggregates the catalog per company with counts, logo domain and careers link", async () => {
    const { body } = await j(await companiesGET(new NextRequest(`${O}/api/companies`)));
    expect(body.companies.map((c: any) => c.name)).toEqual(["Acme", "Globex"]); // by job count
    const acme = body.companies[0];
    expect(acme).toMatchObject({ jobs: 2, junior: 1, remote: 1, domain: "acme.com", careersUrl: "https://boards.greenhouse.io/acme" });
    expect(acme.logoUrl).toContain("acme.com");
    const q = await j(await companiesGET(new NextRequest(`${O}/api/companies?q=glo`)));
    expect(q.body.companies.map((c: any) => c.name)).toEqual(["Globex"]);
  });
});

describe("POST /api/contact", () => {
  it("stores valid messages, rejects invalid ones, and swallows honeypot bots", async () => {
    const ok = await j(await contactPOST(new NextRequest(`${O}/api/contact`, { method: "POST", body: JSON.stringify({ name: "Dana", email: "Dana@Example.com", subject: "Hi", message: "This is a real message." }) })));
    expect(ok.status).toBe(200);
    expect((await ContactMessage.findById(ok.body.id))!.email).toBe("dana@example.com");
    const bad = await j(await contactPOST(new NextRequest(`${O}/api/contact`, { method: "POST", body: JSON.stringify({ name: "D", email: "nope", message: "short" }) })));
    expect(bad.status).toBe(400);
    expect(bad.body.issues).toEqual(expect.arrayContaining(["name", "email", "message"]));
    const bot = await j(await contactPOST(new NextRequest(`${O}/api/contact`, { method: "POST", body: JSON.stringify({ name: "Bot", email: "b@b.io", message: "buy stuff now!!", website: "http://spam" }) })));
    expect(bot.status).toBe(200);
    expect(await ContactMessage.countDocuments()).toBe(1);
  });
});

describe("settings", () => {
  it("reads and updates the profile with validation", async () => {
    const g = await j(await profileGET(new NextRequest(`${O}/api/settings/profile`, { headers: await cookie(me) })));
    expect(g.body.user).toMatchObject({ email: "me@test.dev", fullname: "Me" });
    expect(g.body.user.password).toBeUndefined();
    const u = await j(await profilePUT(new NextRequest(`${O}/api/settings/profile`, { method: "PUT", headers: await cookie(me), body: JSON.stringify({ fullname: "Me Updated", currentJob: "Junior Dev", email: "hack@x.y" }) })));
    expect(u.body.user.fullname).toBe("Me Updated");
    expect(u.body.user.email).toBe("me@test.dev"); // email not editable here
    expect((await profilePUT(new NextRequest(`${O}/api/settings/profile`, { method: "PUT", headers: await cookie(me), body: JSON.stringify({ fullname: "x" }) }))).status).toBe(400);
    expect((await profileGET(new NextRequest(`${O}/api/settings/profile`))).status).toBe(401);
  });

  it("changes the password only with the current one, for local accounts", async () => {
    const wrong = await passwordPOST(new NextRequest(`${O}/api/settings/password`, { method: "POST", headers: await cookie(me), body: JSON.stringify({ currentPassword: "nope", newPassword: "newpass123" }) }));
    expect(wrong.status).toBe(403);
    const ok = await passwordPOST(new NextRequest(`${O}/api/settings/password`, { method: "POST", headers: await cookie(me), body: JSON.stringify({ currentPassword: "oldpass123", newPassword: "newpass123" }) }));
    expect(ok.status).toBe(200);
    const u: any = await User.findById(me).select("password");
    expect(await bcrypt.compare("newpass123", u.password)).toBe(true);
    const social = await User.create({ username: "soc", email: "soc@test.dev", password: "x", fullname: "Soc", authProvider: "google", providerId: "g1" } as any);
    const denied = await j(await passwordPOST(new NextRequest(`${O}/api/settings/password`, { method: "POST", headers: await cookie(String(social._id)), body: JSON.stringify({ currentPassword: "x", newPassword: "newpass123" }) })));
    expect(denied.status).toBe(400);
    expect(denied.body.error).toContain("google");
  });

  it("deletes the account and its personal data, and clears the session", async () => {
    await Notification.create({ userId: me, type: "system", title: "t" } as any);
    const no = await accountDELETE(new NextRequest(`${O}/api/settings/account`, { method: "DELETE", headers: await cookie(me), body: JSON.stringify({ confirm: "nope" }) }));
    expect(no.status).toBe(400);
    const yes = await accountDELETE(new NextRequest(`${O}/api/settings/account`, { method: "DELETE", headers: await cookie(me), body: JSON.stringify({ confirm: "DELETE" }) }));
    expect(yes.status).toBe(200);
    expect(yes.headers.get("set-cookie")).toMatch(/token=;/);
    expect(await User.findById(me)).toBeNull();
    expect(await Notification.countDocuments({ userId: me })).toBe(0);
  });
});

describe("articles content", () => {
  it("has unique slugs, dates and at least one section each", () => {
    const slugs = ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const a of ARTICLES) {
      expect(a.sections.length).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(a.date))).toBe(false);
    }
    expect(getArticle(slugs[0])?.title).toBeTruthy();
    expect(getArticle("missing")).toBeNull();
  });
});
