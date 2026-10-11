import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

delete process.env.OPENAI_API_KEY;
vi.mock("@/app/lib/matcher/embeddings", async () => import("../setup/fakeEmbedder"));

import User from "@/app/models/User";
import { signJwt } from "@/app/lib/jwt";
import { captureInterviewQuestions, questionBank, reportedQuestionsText } from "@/app/lib/outcomes/questions";
import { companyKey } from "@/app/lib/outcomes/companyKey";
import { splitForReader, generateMetadata, PUBLIC_PER_STAGE } from "@/app/interview-questions/[company]/page";
import { metadata as indexMetadata } from "@/app/interview-questions/page";
import sitemap from "@/app/sitemap";
import { faqJsonLd } from "@/app/lib/seo/jsonld";
import { buildCompanyBrief } from "@/app/lib/interview/simulator";
import { buildPrepPrompt } from "@/app/lib/interview/prepare";
import { NAV_LINKS } from "@/app/components/nav";
import { handleMcp } from "@/app/lib/mcp/server";
import { GET as questionsGET } from "@/app/api/outcomes/questions/route";

setupTestDb();

const O = "http://localhost";
let dana = "", yoav = "";

beforeAll(async () => {
  await resetDb();
  dana = String((await User.create({ username: "dana", email: "dana@test.dev", password: "x", fullname: "Dana", phone: "050" } as any))._id);
  yoav = String((await User.create({ username: "yoav", email: "yoav@test.dev", password: "x", fullname: "Yoav", phone: "050" } as any))._id);
  const hr = ["ספרי על עצמך", "למה דווקא Wix?", "מה ציפיות השכר שלך?", "איפה את רואה את עצמך בעוד 3 שנים?", "למה עזבת את המקום הקודם?"];
  const tech = ["מה ההבדל בין useMemo ל-useCallback?", "איך עובד event loop?", "תסבירי על closures", "מה זה CSS specificity?", "איך היית מתכננת רכיב טבלה וירטואלית?", "מה ההבדל בין SSR ל-CSR?"];
  await captureInterviewQuestions({ userId: dana, company: "Wix.com Ltd", roleTitle: "Frontend Developer", stage: "hr", text: hr.join("\n") });
  await captureInterviewQuestions({ userId: dana, company: "Wix", roleTitle: "Frontend Developer", stage: "technical", text: tech.join("\n") });
  await captureInterviewQuestions({ userId: yoav, company: "WIX", roleTitle: "Full Stack", stage: "technical", text: "איך עובד event loop?\nמה זה debounce?" });
  await captureInterviewQuestions({ userId: yoav, company: "Monday.com", roleTitle: "Dev", stage: "hr", text: "ספר על עצמך", shareable: false }); // private → no public page
});

describe("company question-bank pages", () => {
  it("the public view shows a sample per stage and says how many more are inside; signed-in sees everything", async () => {
    const bank = await questionBank("wix");
    expect(bank.company).toMatch(/wix/i);
    expect(bank.total).toBe(12); // 5 hr + 7 distinct technical (event loop reported twice)
    expect(bank.reporters).toBe(2);
    const pub = splitForReader(bank.questions, false);
    expect(pub.map((g) => g.stage)).toEqual(["hr", "technical"]);
    expect(pub[0].shown).toHaveLength(PUBLIC_PER_STAGE);
    expect(pub[0].hidden).toBe(5 - PUBLIC_PER_STAGE);
    expect(pub[1].hidden).toBe(7 - PUBLIC_PER_STAGE);
    const twice = bank.questions.find((q) => q.question === "איך עובד event loop?")!;
    expect(twice.count).toBe(2);
    expect(bank.questions[0].question).toBe("איך עובד event loop?"); // most reporters first
    const full = splitForReader(bank.questions, true);
    expect(full.reduce((s, g) => s + g.hidden, 0)).toBe(0);
  });

  it("metadata: indexable when the company has questions, noindex otherwise; the index has a canonical", async () => {
    const m = await generateMetadata({ params: Promise.resolve({ company: "wix" }) });
    expect(String(m.title)).toMatch(/שאלות ראיון ב-Wix/);
    expect(String(m.title)).toMatch(/12 שאלות/);
    expect((m.robots as any).index).toBe(true);
    expect((m.alternates as any).canonical).toBe("/interview-questions/wix");
    const none = await generateMetadata({ params: Promise.resolve({ company: "nobody" }) });
    expect((none.robots as any).index).toBe(false);
    const priv = await generateMetadata({ params: Promise.resolve({ company: "monday" }) });
    expect((priv.robots as any).index).toBe(false); // only private rows
    expect((indexMetadata.alternates as any).canonical).toBe("/interview-questions");
  });

  it("the sitemap lists the bank index and every company with shareable questions; the nav links to it", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/interview-questions"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/interview-questions/wix"))).toBe(true);
    expect(urls.some((u) => u.includes("/interview-questions/monday"))).toBe(false);
    expect(NAV_LINKS.some((l) => l.href === "/interview-questions")).toBe(true);
    expect(companyKey("Wix.com Ltd")).toBe("wix");
    expect(companyKey("Monday.com")).toBe("monday");
    expect(companyKey("Check Point Software Technologies")).toBe("check-point-software");
    expect(companyKey("check-point-software")).toBe("check-point-software"); // idempotent, so the URL slug can be fed back in
    const faq = faqJsonLd([{ question: "Q?", answer: "A." }]) as any;
    expect(faq["@type"]).toBe("FAQPage");
    expect(faq.mainEntity[0].acceptedAnswer.text).toBe("A.");
  });

  it("real questions reach the interviewer brief, the plan prompt, the API and the MCP tool", async () => {
    const text = await reportedQuestionsText("Wix", { stage: "technical", limit: 5 });
    expect(text).toMatch(/\[technical\] איך עובד event loop\? \(reported 2×\)/);
    const brief = buildCompanyBrief({ company: { summary: "Wix builds websites.", whatTheyDo: "", techStack: [], cultureHints: [] }, roleSummary: "", stages: [], gaps: [], questionsToAsk: [], checklist: [] } as any, null, null, text);
    expect(brief).toMatch(/REAL QUESTIONS candidates report/);
    expect(brief).toMatch(/event loop/);
    const { user } = buildPrepPrompt({ job: { title: "Frontend Developer", company: "Wix", description: "React" }, companyContext: { company: "Wix", openRoles: 1, techSignals: [], sampleTitles: [], websiteExcerpt: "" }, reportedQuestions: text });
    expect(user).toMatch(/REAL QUESTIONS reported by candidates/);
    expect(user).toMatch(/closures|event loop/);

    const anon = await (await questionsGET(new NextRequest(`${O}/api/outcomes/questions?company=wix&stage=hr`))).json();
    expect(anon.gated).toBe(true);
    expect(anon.questions.length).toBeLessThanOrEqual(5);
    expect(anon.questions.every((q: any) => q.stage === "hr")).toBe(true);
    const mine = await (await questionsGET(new NextRequest(`${O}/api/outcomes/questions?company=wix`, { headers: { cookie: `token=${await signJwt({ id: dana })}` } }))).json();
    expect(mine.total).toBe(12);

    const mcpAnon: any = await handleMcp({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "company_interview_questions", arguments: { company: "Wix" } } }, { userId: null });
    expect(mcpAnon.result.structuredContent).toMatchObject({ total: 12, reporters: 2, sample: true });
    expect(mcpAnon.result.structuredContent.questions.length).toBeLessThanOrEqual(5);
    expect(mcpAnon.result.structuredContent.url).toMatch(/\/interview-questions\/wix$/);
    const mcpMine: any = await handleMcp({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "company_interview_questions", arguments: { company: "Wix", stage: "technical" } } }, { userId: dana });
    expect(mcpMine.result.structuredContent.sample).toBe(false);
    expect(mcpMine.result.structuredContent.questions).toHaveLength(7);
  });
});
