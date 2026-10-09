import { registerAgent } from "../registry";
import type { Payloads } from "../types";
import { catalogFacts, existingTitles, suggestTopics, writeAndStoreArticle } from "@/app/lib/content/writer";

export const writerAgent = registerAgent({
  name: "writer",
  title: "Writer",
  description: "Writes the articles: picks topics the catalog data makes timely, drafts a complete Hebrew piece with SEO metadata, and hands it to an admin to publish.",
  handles: ["content.plan", "content.request"],
  async handle(msg, ctx) {
    switch (msg.type) {
      case "content.plan": {
        const p = msg.payload as Payloads["content.plan"];
        const count = Math.min(Math.max(p.count || 1, 1), 5);
        const [facts, titles] = await Promise.all([catalogFacts(), existingTitles()]);
        const topics = await suggestTopics(facts, titles, count);
        for (const t of topics) {
          ctx.log(`• ${t.topic}${t.whyNow ? ` — ${t.whyNow}` : ""}`);
          await ctx.send("content.request", { topic: t.topic, angle: t.angle, audience: t.audience, publish: !!p.publish }, `Writing: "${t.topic}" (${t.angle || "my angle"}).`);
        }
        return `Looked at ${facts.totalJobs} postings (${facts.juniorJobs} junior, ${facts.newLast7Days} new this week) and ${titles.length} existing titles; queued ${topics.length} article${topics.length === 1 ? "" : "s"}.`;
      }
      case "content.request": {
        const p = msg.payload as Payloads["content.request"];
        const a = await writeAndStoreArticle({ topic: p.topic, angle: p.angle, audience: p.audience, publish: !!p.publish, runId: msg.runId });
        await ctx.send("content.ready", { articleId: a.id, slug: a.slug, title: a.title, status: a.status as "draft" | "published", words: a.words }, `"${a.title}" is ${a.status === "published" ? "live" : "drafted"} (${a.words} words). Notifier — tell the admins.`);
        return `Wrote "${a.title}" — ${a.words} words, /Articels/${a.slug} (${a.status}).`;
      }
    }
  },
});
