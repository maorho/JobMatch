import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { setupTestDb, resetDb } from "../setup/mongo";

const ARTICLE = {
  title: "איך מוצאים משרת ג'וניור בישראל ב-2026: המדריך לפי הנתונים",
  slug: "junior-resume-that-passes-ats", // collides with the static seed on purpose
  excerpt: "מתוך אלפי משרות בקטלוג רק אחוזים בודדים מסומנות ג'וניור. כך מוצאים אותן, ומה עושים כדי להתקבל אליהן לפני כולם.",
  tags: ["ג'וניור", "חיפוש עבודה", "ישראל"],
  seo: { title: "משרות ג'וניור בישראל 2026 — המדריך לפי הנתונים", description: "איפה באמת מתפרסמות משרות ג'וניור בהייטק הישראלי, כמה יש, ואיך להתקבל: מדריך פרקטי מבוסס נתוני קטלוג.", keywords: ["משרות ג'וניור", "junior developer israel", "חיפוש עבודה הייטק"] },
  sections: [
    { heading: "", paragraphs: ["פתיחה קצרה על המצב בשוק."], bullets: [] },
    { heading: "כמה משרות ג'וניור יש באמת", paragraphs: ["לפי נתוני JobMatch…"], bullets: [] },
    { heading: "איפה הן מתפרסמות", paragraphs: [], bullets: ["דפי קריירה", "הפניות"] },
    { heading: "מה לעשות השבוע", paragraphs: [], bullets: ["לעדכן קו״ח", "לייבא אנשי קשר"] },
  ],
};
vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class {
    async invoke(msgs: any[]) {
      const sys = String(msgs[0]?.content || "");
      if (sys.includes("Propose")) return { content: JSON.stringify({ topics: [{ topic: "משימות בית ב-React: איך עוברים", angle: "דוגמאות", audience: "ג'וניורים", whyNow: "הרבה משרות React" }] }) };
      return { content: JSON.stringify(ARTICLE) };
    }
  },
}));

import User from "@/app/models/User";
import ExternalJobs from "@/app/models/ExternalJobs";
import Article from "@/app/models/Article";
import Notification from "@/app/models/Notification";
import { signJwt } from "@/app/lib/jwt";
import { ARTICLES } from "@/app/content/articles";
import { catalogFacts, generateArticle, uniqueSlug, wordCount, buildArticlePrompt } from "@/app/lib/content/writer";
import { listArticles, getArticleBySlug } from "@/app/lib/content/articles";
import { startFlow, processQueue, readRun } from "@/app/lib/agents";
import { GET as publicGET } from "@/app/api/articles/route";
import { GET as adminGET, POST as adminPOST, PATCH as adminPATCH, DELETE as adminDELETE } from "@/app/api/admin/articles/route";

setupTestDb();

const O = "http://localhost";
const cookie = async (id: string) => ({ cookie: `token=${await signJwt({ id })}`, "Content-Type": "application/json" });
const j = async (res: Response) => ({ status: res.status, body: await res.json() });
let admin = "", user = "";

beforeAll(async () => {
  await resetDb();
  admin = String((await User.create({ username: "root", email: "root@test.dev", password: "x", fullname: "Root", phone: "0", admin: true } as any))._id);
  user = String((await User.create({ username: "u", email: "u@test.dev", password: "x", fullname: "U", phone: "0" } as any))._id);
  await ExternalJobs.create([
    { job: "Junior React Developer", company: "Acme", city: "Tel Aviv", country: "Israel", url: "1", finalUrl: "1", description: "React TypeScript", skills: [], seniority: [], source: "greenhouse", sourceJobId: "1" },
    { job: "Backend Engineer", company: "Globex", city: "Haifa", country: "Israel", url: "2", finalUrl: "2", description: "Go Kubernetes", skills: [], seniority: [], source: "greenhouse", sourceJobId: "2", remote: true },
  ] as any);
});

describe("writer brain", () => {
  it("grounds articles in live catalog facts", async () => {
    const f = await catalogFacts();
    expect(f).toMatchObject({ totalJobs: 2, juniorJobs: 1, remoteJobs: 1 });
    expect(f.topCompanies.map((c) => c.company).sort()).toEqual(["Acme", "Globex"]);
    expect(f.topSkills.map((s) => s.term)).toEqual(expect.arrayContaining(["react", "typescript"]));
    const { system, user: u } = buildArticlePrompt({ topic: "x", facts: f, existingSlugs: ["a"] });
    expect(system).toMatch(/Never invent statistics/);
    expect(u).toContain('"totalJobs":2');
  });

  it("validates the article shape, counts words and keeps slugs unique", async () => {
    const a = await generateArticle({ topic: "ג'וניור", facts: await catalogFacts(), existingSlugs: [] });
    expect(a.sections.length).toBeGreaterThanOrEqual(4);
    expect(a.words).toBe(wordCount(a));
    expect(a.readMinutes).toBeGreaterThanOrEqual(2);
    expect(uniqueSlug("junior-resume-that-passes-ats", ARTICLES.map((x) => x.slug))).toBe("junior-resume-that-passes-ats-2");
    expect(uniqueSlug("fresh", [])).toBe("fresh");
  });
});

describe("writer agent on the bus", () => {
  it("plans a topic, writes a draft (never colliding with the seed), and tells the admins", async () => {
    const { runId } = await startFlow("content.plan", { count: 1 }, { from: "cron" });
    const r = await processQueue({ runId });
    expect(r.failed).toBe(0);
    expect((await readRun(runId))!.messages.map((m: any) => `${m.from}→${m.to}:${m.type}:${m.status}`)).toEqual([
      "cron→writer:content.plan:done",
      "writer→writer:content.request:done",
      "writer→notifier:content.ready:done",
    ]);
    const a: any = await Article.findOne({ runId }).lean();
    expect(a.status).toBe("draft");
    expect(a.slug).toBe("junior-resume-that-passes-ats-2"); // seed slug taken → suffixed
    expect(a.topic).toBe("משימות בית ב-React: איך עוברים");
    expect(a.facts.totalJobs).toBe(2);
    const n: any = await Notification.findOne({ userId: admin, "meta.agent": "writer" }).lean();
    expect(n.link).toBe("/AdminDashboard/articles");
    expect(await Notification.countDocuments({ userId: user, "meta.agent": "writer" })).toBe(0);
  });
});

describe("articles: public pages vs admin", () => {
  it("drafts stay hidden until published; the seed is always there", async () => {
    const draft: any = await Article.findOne({ status: "draft" }).lean();
    expect((await listArticles()).map((a) => a.slug)).not.toContain(draft.slug);
    expect((await listArticles()).length).toBe(ARTICLES.length);
    expect(await getArticleBySlug(draft.slug)).toBeNull();
    expect((await getArticleBySlug(ARTICLES[0].slug))?.source).toBe("static");

    const pub = await j(await publicGET());
    expect(pub.body.articles.map((a: any) => a.slug)).not.toContain(draft.slug);

    expect((await adminGET(new NextRequest(`${O}/api/admin/articles`, { headers: await cookie(user) }))).status).toBe(403);
    const all = await j(await adminGET(new NextRequest(`${O}/api/admin/articles`, { headers: await cookie(admin) })));
    expect(all.body.articles.find((a: any) => a.slug === draft.slug).status).toBe("draft");
    expect(all.body.articles.filter((a: any) => a.source === "static")).toHaveLength(ARTICLES.length);

    const published = await j(await adminPATCH(new NextRequest(`${O}/api/admin/articles`, { method: "PATCH", headers: await cookie(admin), body: JSON.stringify({ id: String(draft._id), status: "published" }) })));
    expect(published.body.article.status).toBe("published");
    const now = await listArticles();
    expect(now[0].slug).toBe(draft.slug); // newest first
    expect(now[0].source).toBe("agent");
    expect((await getArticleBySlug(draft.slug))?.seo?.title).toMatch(/ג'וניור/);
  });

  it("an admin can commission a specific topic and delete the result", async () => {
    const r = await j(await adminPOST(new NextRequest(`${O}/api/admin/articles`, { method: "POST", headers: await cookie(admin), body: JSON.stringify({ topic: "הכנה לראיון HR", publish: true }) })));
    expect(r.status).toBe(200);
    expect(r.body.article).toMatchObject({ status: "published" });
    const conv = (await readRun(r.body.runId))!.messages.map((m: any) => m.type);
    expect(conv).toEqual(["content.request", "content.ready"]);
    const doc: any = await Article.findOne({ slug: r.body.article.slug }).lean();
    const del = await j(await adminDELETE(new NextRequest(`${O}/api/admin/articles?id=${doc._id}`, { method: "DELETE", headers: await cookie(admin) })));
    expect(del.body.deleted).toBe(1);
  });
});
