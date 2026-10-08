import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class {
    async invoke(msgs: any[]) {
      const text = msgs.map((m) => m.content).join("\n");
      const he = /Hebrew/.test(text);
      return { content: JSON.stringify({ subject: he ? "" : "Quick question about the Frontend role", message: he ? "היי נועה, ראיתי שאת ב-Acme ושיש אצלכם משרת Junior Frontend. בניתי שלושה פרויקטים ב-React ו-TypeScript ואשמח אם תוכלי להפנות אותי או לשיחה קצרה של עשר דקות. תודה!" : "Hi Noa, I saw you're at Acme and that there's an open Junior Frontend role. I've built three React/TypeScript projects end to end and would love a referral or a ten-minute chat. Thanks!", angle: "React projects → the role's stack" }) };
    }
  },
}));

import User from "@/app/models/User";
import Contact from "@/app/models/Contact";
import ExternalJobs from "@/app/models/ExternalJobs";
import { signJwt } from "@/app/lib/jwt";
import { parseCsv, parseLinkedInConnections, companyKey, importContacts, contactsAtCompany } from "@/app/lib/contacts/linkedin";
import { buildOutreachPrompt } from "@/app/lib/contacts/outreach";
import { GET as contactsGET, POST as contactsPOST, DELETE as contactsDELETE } from "@/app/api/contacts/route";
import { POST as outreachPOST } from "@/app/api/contacts/outreach/route";

setupTestDb();

const O = "http://localhost";
const cookie = async (id: string) => ({ cookie: `token=${await signJwt({ id })}` });
const j = async (res: Response) => ({ status: res.status, body: await res.json() });

const CSV = `Notes:
"When exporting your connection data, you may notice that some of the email addresses are missing."

First Name,Last Name,URL,Email Address,Company,Position,Connected On
Noa,Levi,https://www.linkedin.com/in/noa-levi,,Acme Ltd.,Senior Frontend Engineer,12 Mar 2025
"Dan, Jr.",Cohen,https://www.linkedin.com/in/dan-cohen,dan@example.com,"Acme Technologies, Inc.",Engineering Manager,01 Jan 2024
Yael,Mizrahi,https://www.linkedin.com/in/yael-m,,Globex,Recruiter,
Avi,Bar,,,"",Freelancer,05 May 2023
`;

let me = "", other = "", jobId = "";

beforeAll(async () => {
  await resetDb();
  me = String((await User.create({ username: "me", email: "me@test.dev", password: "x", fullname: "Maor Homri", phone: "0", currentJob: "Junior Frontend Developer", resumeText: "Junior frontend developer, React, TypeScript, three end-to-end projects." } as any))._id);
  other = String((await User.create({ username: "other", email: "o@test.dev", password: "x", fullname: "Other", phone: "0" } as any))._id);
  jobId = String((await ExternalJobs.create({ job: "Junior Frontend Developer", company: "Acme", city: "Tel Aviv", country: "Israel", url: "https://acme.example/jobs/1", finalUrl: "https://acme.example/jobs/1", description: "React, TypeScript", skills: [], seniority: [], source: "greenhouse", sourceJobId: "a1" } as any))._id);
});

describe("LinkedIn export parsing", () => {
  it("parses quoted fields, the Notes preamble, and empty columns", () => {
    expect(parseCsv('a,"b,c","d ""e"""\n1,2,3')).toEqual([["a", "b,c", 'd "e"'], ["1", "2", "3"]]);
    const rows = parseLinkedInConnections(CSV);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ fullName: "Noa Levi", company: "Acme Ltd.", position: "Senior Frontend Engineer", url: "https://www.linkedin.com/in/noa-levi" });
    expect(rows[0].connectedOn?.getFullYear()).toBe(2025);
    expect(rows[1]).toMatchObject({ firstName: "Dan, Jr.", email: "dan@example.com", company: "Acme Technologies, Inc." });
    expect(rows[2].connectedOn).toBeUndefined();
    expect(parseLinkedInConnections("nothing,here\n1,2")).toEqual([]);
  });

  it("normalizes company names so 'Acme Ltd.' and 'Acme Technologies, Inc.' match the posting's 'Acme'", () => {
    expect(companyKey("Acme Ltd.")).toBe("acme");
    expect(companyKey("Acme Technologies, Inc.")).toBe("acme");
    expect(companyKey("Google Israel")).toBe("google");
    expect(companyKey("Wix.com")).toBe("wix com");
    expect(companyKey("")).toBe("");
  });
});

describe("import + lookup", () => {
  it("imports once, re-import is a no-op, and lookups stay per user", async () => {
    const first = await importContacts(me, CSV);
    expect(first).toMatchObject({ parsed: 4, imported: 4, withCompany: 3, companies: 2 });
    const again = await importContacts(me, CSV);
    expect(again.imported).toBe(0);
    expect(await Contact.countDocuments({ userId: me })).toBe(4);

    const acme = await contactsAtCompany(me, "Acme");
    expect(acme.map((c) => c.fullName).sort()).toEqual(["Dan, Jr. Cohen", "Noa Levi"]);
    expect(await contactsAtCompany(me, "Globex Technologies")).toHaveLength(1);
    expect(await contactsAtCompany(me, "Initech")).toHaveLength(0);
    expect(await contactsAtCompany(other, "Acme")).toHaveLength(0); // never cross users
  });
});

describe("routes", () => {
  it("uploads the CSV as multipart, answers per-company, drafts outreach in both languages, and deletes", async () => {
    await Contact.deleteMany({ userId: me });
    const fd = new FormData();
    fd.append("file", new File([CSV], "Connections.csv", { type: "text/csv" }));
    const up = await j(await contactsPOST(new NextRequest(`${O}/api/contacts`, { method: "POST", headers: await cookie(me), body: fd })));
    expect(up.status).toBe(200);
    expect(up.body.stats.total).toBe(4);
    expect(((await User.findById(me).lean()) as any).onboarding.contactsStep).toBe("done");

    const bad = await j(await contactsPOST(new NextRequest(`${O}/api/contacts`, { method: "POST", headers: { ...(await cookie(me)), "Content-Type": "application/json" }, body: JSON.stringify({ csv: "x,y\n1,2" }) })));
    expect(bad.status).toBe(422);

    const at = await j(await contactsGET(new NextRequest(`${O}/api/contacts?company=Acme%20Technologies`, { headers: await cookie(me) })));
    expect(at.body.contacts).toHaveLength(2);
    const noa = at.body.contacts.find((c: any) => c.fullName === "Noa Levi");

    const he = await j(await outreachPOST(new NextRequest(`${O}/api/contacts/outreach`, { method: "POST", headers: { ...(await cookie(me)), "Content-Type": "application/json" }, body: JSON.stringify({ contactId: noa._id, jobId, source: "external", channel: "linkedin", language: "he" }) })));
    expect(he.status).toBe(200);
    expect(he.body.message).toContain("Acme");
    expect(he.body.contact.url).toBe("https://www.linkedin.com/in/noa-levi");
    const en = await j(await outreachPOST(new NextRequest(`${O}/api/contacts/outreach`, { method: "POST", headers: { ...(await cookie(me)), "Content-Type": "application/json" }, body: JSON.stringify({ contactId: noa._id, jobId, source: "external", channel: "email", language: "en" }) })));
    expect(en.body.subject).toMatch(/Frontend/);

    // Someone else's contact id → 404, never leaks.
    const leak = await j(await outreachPOST(new NextRequest(`${O}/api/contacts/outreach`, { method: "POST", headers: { ...(await cookie(other)), "Content-Type": "application/json" }, body: JSON.stringify({ contactId: noa._id, jobId, source: "external" }) })));
    expect(leak.status).toBe(404);

    const del = await j(await contactsDELETE(new NextRequest(`${O}/api/contacts`, { method: "DELETE", headers: await cookie(me) })));
    expect(del.body.deleted).toBe(4);
    expect((await j(await contactsGET(new NextRequest(`${O}/api/contacts`, { headers: await cookie(me) })))).body.stats.total).toBe(0);
  });

  it("builds a prompt that forbids invention and carries the real facts", () => {
    const { system, user } = buildOutreachPrompt({ me: { fullname: "Maor", resumeSummary: "React dev" }, contact: { fullName: "Noa", position: "EM", company: "Acme" }, job: { title: "Frontend", company: "Acme" }, language: "he", channel: "linkedin" });
    expect(system).toMatch(/Never invent/);
    expect(system).toMatch(/Hebrew/);
    expect(user).toContain("Noa, EM at Acme");
    expect(user).toContain("Frontend at Acme");
  });
});
