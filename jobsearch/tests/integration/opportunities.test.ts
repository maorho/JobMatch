import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

vi.mock("@/app/lib/matcher/embeddings", async () => import("../setup/fakeEmbedder"));

import User from "@/app/models/User";
import ExternalJobs from "@/app/models/ExternalJobs";
import Candidates from "@/app/models/Candidates";
import { embedPendingJobs } from "@/app/lib/matcher/embedJobs";
import { embedAndStoreResume } from "@/app/lib/matcher/candidateProfile";
import { importContacts } from "@/app/lib/contacts/linkedin";
import { signJwt } from "@/app/lib/jwt";
import { referralOpportunities } from "@/app/lib/contacts/opportunities";
import { GET as oppGET } from "@/app/api/contacts/opportunities/route";
import { POST as autoApplyPOST } from "@/app/api/auto-apply/route";

setupTestDb();

const job = (title: string, company: string, description: string) => ({ job: title, company, city: "Tel Aviv", country: "Israel", url: "https://x/" + title, finalUrl: "https://x/" + title, description, skills: [], seniority: [], source: "greenhouse", sourceJobId: title, postedAt: new Date() });
let dana = "", token = "", wixJob = "";
beforeAll(async () => {
  await resetDb();
  wixJob = String((await ExternalJobs.create(job("Junior React Developer", "Wix.com Ltd", "React TypeScript frontend")))._id);
  await ExternalJobs.create(job("Frontend Developer", "monday.com", "React TypeScript frontend web"));
  await ExternalJobs.create(job("Junior Web Developer", "Nobody Inc", "React TypeScript frontend web"));
  await embedPendingJobs();
  dana = String((await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana", phone: "0" } as any))._id);
  await embedAndStoreResume(dana, "Junior frontend developer React TypeScript");
  token = await signJwt({ id: dana });
});
const authed = (url: string, init: RequestInit = {}) => new NextRequest(`http://localhost${url}`, { ...init, headers: { cookie: `token=${token}`, "Content-Type": "application/json", ...(init.headers || {}) } } as any);

describe("referral opportunities", () => {
  it("is empty without contacts, then lists ranked postings at companies where I know someone", async () => {
    expect(await referralOpportunities(dana)).toEqual({ opportunities: [], scanned: 0, contacts: 0 });
    const csv = `First Name,Last Name,URL,Email Address,Company,Position,Connected On\nNoa,Levi,https://www.linkedin.com/in/noa,,Wix,Backend Developer,10 Jan 2025\nOmer,Katz,https://www.linkedin.com/in/omer,,Monday.com,Team Lead,11 Jan 2025\nTal,Ben,https://www.linkedin.com/in/tal,,Wix,Recruiter,12 Jan 2025\n`;
    const imp = await importContacts(dana, csv);
    expect(imp.imported).toBe(3);
    const r = await referralOpportunities(dana);
    expect(r.contacts).toBe(3);
    expect(r.scanned).toBe(3);
    expect(r.opportunities.map((o) => o.company).sort()).toEqual(["Wix.com Ltd", "monday.com"]);
    const wix = r.opportunities.find((o) => o.company === "Wix.com Ltd")!;
    expect(wix).toMatchObject({ jobId: wixJob, title: "Junior React Developer", contactCount: 2, applied: false, insiders: 0 });
    expect(wix.contacts.map((c) => c.fullName)).toEqual(["Noa Levi", "Tal Ben"]);
    expect(r.opportunities[0].matchScore).toBeGreaterThanOrEqual(r.opportunities[1].matchScore);
  });

  it("applying from the list marks the posting as applied", async () => {
    // Explicit apply from the list: no résumé on file here, so the applier hands it back with a reason instead of submitting.
    const res = await autoApplyPOST(authed("/api/auto-apply", { method: "POST", body: JSON.stringify({ action: "apply", jobId: wixJob, jobModel: "ExternalJobs", score: 80 }) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.needsUser).toHaveLength(1);
    expect(body.needsUser[0]).toMatchObject({ jobId: wixJob, title: "Junior React Developer", reason: expect.stringMatching(/קורות חיים/) });
    expect(await Candidates.countDocuments({ candidateId: dana, jobId: wixJob })).toBe(0);
    // Once an application exists (submitted by the applier or by hand), the list says so.
    await Candidates.create({ candidateId: dana, jobId: wixJob, jobModel: "ExternalJobs", status: "Submitted Resume" } as any);
    const again = await (await oppGET(authed("/api/contacts/opportunities"))).json();
    expect(again.opportunities.find((o: any) => o.jobId === wixJob).applied).toBe(true);
    expect(again.opportunities.find((o: any) => o.company === "monday.com").applied).toBe(false);
    expect((await autoApplyPOST(authed("/api/auto-apply", { method: "POST", body: JSON.stringify({ action: "apply", jobId: "000000000000000000000000" }) }))).status).toBe(404);
    expect((await oppGET(new NextRequest("http://localhost/api/contacts/opportunities"))).status).toBe(401);
  });
});
