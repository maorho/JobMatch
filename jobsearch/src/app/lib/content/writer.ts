import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs, { OPEN_JOBS } from "@/app/models/ExternalJobs";
import Article from "@/app/models/Article";
import { extractJson } from "@/app/lib/resume/tailor";
import { mineTechSignals } from "@/app/lib/interview/companyContext";
import { ARTICLES } from "@/app/content/articles";

/**
 * The Writer agent's brain: grounds every article in live catalog numbers
 * (so the content says something true about the Israeli market today),
 * proposes topics that aren't covered yet, and writes a complete, structured
 * Hebrew article with its own SEO metadata.
 */
export const WRITER_MODEL = "gpt-4o";
export const TOPIC_MODEL = "gpt-4o-mini";

export type CatalogFacts = {
  totalJobs: number;
  newLast7Days: number;
  juniorJobs: number;
  remoteJobs: number;
  topCompanies: { company: string; jobs: number }[];
  topJuniorCompanies: { company: string; jobs: number }[];
  topSkills: { term: string; count: number }[];
  topCities: { city: string; jobs: number }[];
  asOf: string;
};

const JUNIOR_RE = /\b(junior|entry[- ]level|graduate|student|intern(ship)?|trainee)\b|ג'וניור|סטודנט|מתמחה/i;

/** Live numbers from the catalog — what makes the articles ours and not generic. */
export async function catalogFacts(): Promise<CatalogFacts> {
  await connectToDatabase();
  const week = new Date(Date.now() - 7 * 864e5);
  const [totalJobs, newLast7Days, juniorJobs, remoteJobs, topCompanies, topJuniorCompanies, topCities, sample] = await Promise.all([
    ExternalJobs.countDocuments({ ...OPEN_JOBS }),
    ExternalJobs.countDocuments({ ...OPEN_JOBS, postedAt: { $gte: week } }),
    ExternalJobs.countDocuments({ ...OPEN_JOBS, job: JUNIOR_RE }),
    ExternalJobs.countDocuments({ ...OPEN_JOBS, $or: [{ remote: true }, { country: "Remote" }] }),
    ExternalJobs.aggregate([{ $group: { _id: "$company", jobs: { $sum: 1 } } }, { $sort: { jobs: -1 } }, { $limit: 10 }, { $project: { _id: 0, company: "$_id", jobs: 1 } }]),
    ExternalJobs.aggregate([{ $match: { job: JUNIOR_RE } }, { $group: { _id: "$company", jobs: { $sum: 1 } } }, { $sort: { jobs: -1 } }, { $limit: 10 }, { $project: { _id: 0, company: "$_id", jobs: 1 } }]),
    ExternalJobs.aggregate([{ $match: { city: { $nin: ["", "Unknown", null] } } }, { $group: { _id: "$city", jobs: { $sum: 1 } } }, { $sort: { jobs: -1 } }, { $limit: 8 }, { $project: { _id: 0, city: "$_id", jobs: 1 } }]),
    ExternalJobs.find({}).sort({ firstSeenAt: -1 }).limit(400).select("job description").lean(),
  ]);
  return {
    totalJobs,
    newLast7Days,
    juniorJobs,
    remoteJobs,
    topCompanies,
    topJuniorCompanies,
    topSkills: mineTechSignals((sample as any[]).map((j) => `${j.job}\n${(j.description || "").slice(0, 3000)}`)).slice(0, 15),
    topCities,
    asOf: new Date().toISOString().slice(0, 10),
  };
}

export const topicSchema = z.object({
  topics: z.array(z.object({ topic: z.string().min(8), angle: z.string().default(""), audience: z.string().default("ג'וניורים בהייטק הישראלי"), whyNow: z.string().default("") })).min(1),
});
export type TopicIdea = z.infer<typeof topicSchema>["topics"][number];

export function buildTopicPrompt(facts: CatalogFacts, existingTitles: string[], count: number): { system: string; user: string } {
  const system = `You are the content editor of JobMatch, an Israeli AI job-search product for tech candidates (mostly juniors). Propose ${count} article topics in Hebrew that are practical, specific to the Israeli tech market, and grounded in the numbers below. Avoid anything already covered. Each topic must promise one concrete outcome for the reader. Return STRICT JSON: {"topics":[{"topic","angle","audience","whyNow"}]}.`;
  const user = `CATALOG FACTS (${facts.asOf}): ${JSON.stringify(facts)}\nALREADY PUBLISHED: ${existingTitles.join(" | ") || "(none)"}`;
  return { system, user };
}

const contentOf = (res: any): string => (typeof res.content === "string" ? res.content : (res.content as any[]).map((p) => p?.text ?? "").join(""));

export async function suggestTopics(facts: CatalogFacts, existingTitles: string[], count = 3): Promise<TopicIdea[]> {
  const { system, user } = buildTopicPrompt(facts, existingTitles, count);
  const res = await new ChatOpenAI({ modelName: TOPIC_MODEL, temperature: 0.7, openAIApiKey: process.env.OPENAI_API_KEY, modelKwargs: { response_format: { type: "json_object" } } }).invoke([new SystemMessage(system), new HumanMessage(user)]);
  const parsed = topicSchema.safeParse(extractJson(contentOf(res)));
  if (!parsed.success) throw new Error("Topic output invalid");
  return parsed.data.topics.slice(0, count);
}

export const articleSchema = z.object({
  title: z.string().min(10).max(140),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase ascii kebab-case"),
  excerpt: z.string().min(40).max(320),
  tags: z.array(z.string().min(2)).min(2).max(5),
  seo: z.object({ title: z.string().min(10).max(70), description: z.string().min(50).max(165), keywords: z.array(z.string()).min(3).max(10) }),
  sections: z
    .array(z.object({ heading: z.string().default(""), paragraphs: z.array(z.string()).default([]), bullets: z.array(z.string()).default([]) }))
    .min(4)
    .max(10),
});
export type GeneratedArticle = z.infer<typeof articleSchema>;

export function buildArticlePrompt(input: { topic: string; angle?: string; audience?: string; facts: CatalogFacts; existingSlugs: string[] }): { system: string; user: string } {
  const system = `You are a senior editor writing for JobMatch (Israeli AI job-search product). Write ONE complete article in Hebrew (technical terms in English), 900–1300 words, for ${input.audience || "ג'וניורים ומחפשי עבודה בהייטק הישראלי"}.
Standards:
- Write like a senior Israeli engineer mentoring a friend over coffee: direct, concrete, opinionated. Every section is 120–220 words and contains at least one worked example (what exactly to do, what to write, what to say, what to build).
- Practical and specific: steps, numbers, examples, tools. No clichés ("בעולם הדינמי של היום"), no filler, no moralizing, no "take a course on Coursera/Udemy" generics. Name a resource only if you are certain it exists and is relevant (e.g. OWASP Top 10, roadmap.sh, TryHackMe, the React docs); otherwise describe what to look for.
- Catalog skill counts are keyword signals from job descriptions, not a curriculum: use them to say what employers ask for, never as "the top skills to learn" verbatim.
- Ground claims in the CATALOG FACTS when relevant (cite the numbers as JobMatch data, e.g. "מתוך 4,400 משרות…"). Never invent statistics, company names, or quotes beyond the facts given.
- Structure: a short opening paragraph (no heading), then 4–8 sections with clear headings; use bullets for lists; end with a short "מה לעשות השבוע" action section.
- Mention JobMatch features only where genuinely useful (ResumeAI, התאמה אוטומטית, הכנה לראיון, הפניות), at most twice, never salesy.
- SEO: a title people would search for (≤ 60 chars), a meta description (≤ 160 chars), 3–10 keywords in Hebrew/English, an ASCII kebab-case English slug (not in: ${input.existingSlugs.join(", ") || "none"}).
Return STRICT JSON: {"title","slug","excerpt","tags":[...],"seo":{"title","description","keywords":[...]},"sections":[{"heading","paragraphs":[...],"bullets":[...]}]}. Nothing else.`;
  const user = `TOPIC: ${input.topic}\nANGLE: ${input.angle || "(your call)"}\nCATALOG FACTS (${input.facts.asOf}): ${JSON.stringify(input.facts)}`;
  return { system, user };
}

export function wordCount(a: GeneratedArticle): number {
  const text = [a.excerpt, ...a.sections.flatMap((s) => [s.heading, ...s.paragraphs, ...s.bullets])].join(" ");
  return text.split(/\s+/).filter(Boolean).length;
}

/** Below this the model clearly stopped early; we ask once more for the full piece. */
export const MIN_WORDS = 450; // Hebrew is dense: ~450 Hebrew words ≈ a 900-word English piece

export async function generateArticle(input: { topic: string; angle?: string; audience?: string; facts: CatalogFacts; existingSlugs: string[] }): Promise<GeneratedArticle & { readMinutes: number; words: number }> {
  const { system, user } = buildArticlePrompt(input);
  const llm = new ChatOpenAI({ modelName: WRITER_MODEL, temperature: 0.6, maxTokens: 6000, openAIApiKey: process.env.OPENAI_API_KEY, modelKwargs: { response_format: { type: "json_object" } } });
  const parse = (text: string) => {
    const parsed = articleSchema.safeParse(extractJson(text));
    if (!parsed.success) throw new Error("Article output invalid: " + parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).slice(0, 5).join("; "));
    return parsed.data;
  };
  let article = parse(contentOf(await llm.invoke([new SystemMessage(system), new HumanMessage(user)])));
  let words = wordCount(article);
  if (words < MIN_WORDS) {
    // Models sometimes return an outline-length draft; one explicit retry fixes it nearly always.
    const retry = await llm.invoke([
      new SystemMessage(system),
      new HumanMessage(`${user}

YOUR PREVIOUS DRAFT HAD ONLY ${words} WORDS. Rewrite it as the FULL article: 900–1300 words, every section with 2–4 substantial paragraphs or 4–8 concrete bullets. Same JSON shape.`),
    ]);
    const longer = parse(contentOf(retry));
    if (wordCount(longer) > words) {
      article = longer;
      words = wordCount(longer);
    }
  }
  return { ...article, words, readMinutes: Math.max(2, Math.round(words / 180)) };
}

/** Every slug in use (DB + static seed), so new ones never collide. */
export async function existingSlugs(): Promise<string[]> {
  await connectToDatabase();
  const db: string[] = await Article.distinct("slug");
  return [...new Set([...db, ...ARTICLES.map((a) => a.slug)])];
}

export async function existingTitles(): Promise<string[]> {
  await connectToDatabase();
  const db: any[] = await Article.find({ status: { $ne: "archived" } }).select("title").lean();
  return [...db.map((a) => a.title), ...ARTICLES.map((a) => a.title)];
}

export const uniqueSlug = (slug: string, taken: string[]): string => {
  if (!taken.includes(slug)) return slug;
  let i = 2;
  while (taken.includes(`${slug}-${i}`)) i++;
  return `${slug}-${i}`;
};

/** Write one article and store it (draft unless `publish`). */
export async function writeAndStoreArticle(input: { topic: string; angle?: string; audience?: string; publish?: boolean; runId?: string }): Promise<{ id: string; slug: string; title: string; status: string; words: number }> {
  const [facts, slugs] = await Promise.all([catalogFacts(), existingSlugs()]);
  const a = await generateArticle({ topic: input.topic, angle: input.angle, audience: input.audience, facts, existingSlugs: slugs });
  const slug = uniqueSlug(a.slug, slugs);
  const status = input.publish ? "published" : "draft";
  const doc = await Article.create({
    slug, title: a.title, excerpt: a.excerpt, tags: a.tags, readMinutes: a.readMinutes, sections: a.sections, seo: a.seo,
    status, publishedAt: input.publish ? new Date() : undefined, source: "agent", topic: input.topic, angle: input.angle || "", audience: input.audience || "", model: WRITER_MODEL, runId: input.runId, facts,
  });
  return { id: String(doc._id), slug, title: a.title, status, words: a.words };
}
