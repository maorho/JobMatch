import { registerAgent } from "../registry";
import type { Payloads } from "../types";
import { researchCompany } from "@/app/lib/interview/companyResearch";
import { ensureWebQuestions } from "@/app/lib/interview/webQuestions";
import { describeMissingCompanies } from "@/app/lib/companies/profiles";
import CompanySource from "@/app/models/CompanySource";

export const researcherAgent = registerAgent({
  name: "researcher",
  title: "Researcher",
  description: "Reads up on a company before an interview — products, recent news, size, culture, how their interviews run, and the interview questions candidates report publicly — with web search, cached.",
  handles: ["research.request", "companies.describe"],
  async handle(msg, ctx) {
    if (msg.type === "companies.describe") {
      const { limit } = msg.payload as Payloads["companies.describe"];
      // Each profile is a web-search LLM call (~20–40s): only take on as many as fit the
      // dispatcher's remaining budget, and renew the lease after every one.
      const perCompanyMs = 30_000;
      const affordable = Math.max(1, Math.floor((ctx.deadline - Date.now() - 10_000) / perCompanyMs));
      const want = limit ?? 15;
      const take = Math.min(want, affordable);
      if (take < want) ctx.log(`Only ${take} of ${want} fit the remaining time budget; the rest wait for the next tick.`);
      const r = await describeMissingCompanies({
        limit: take,
        log: (line) => {
          ctx.log(line);
          void ctx.heartbeat();
        },
      });
      return `Company profiles: ${r.described} written${r.skipped ? `, ${r.skipped} without enough to say` : ""}${r.failed ? `, ${r.failed} failed` : ""}; ${Math.max(0, r.due - r.described - r.skipped - r.failed)} of ${r.considered} still waiting.`;
    }
    const p = msg.payload as Payloads["research.request"];
    const src: any = p.domain ? null : await CompanySource.findOne({ companyName: p.company }).select("domain").lean().catch(() => null);
    const domain = p.domain || src?.domain || undefined;
    // The brief and the public interview questions are independent searches → run together.
    const [r, web] = await Promise.all([
      researchCompany(p.company, { domain }).catch((e) => {
        ctx.log(`research failed: ${(e as Error)?.message}`);
        return null;
      }),
      ensureWebQuestions(p.company, { domain }),
    ]);
    if (web) ctx.log(web.cached ? `web interview questions: ${web.found} on file (harvested this month)` : `web interview questions: ${web.found} found${web.searched ? "" : " (no search tool)"}, ${web.created} new`);
    const headline = r ? [r.brief.sizeAndStage, r.brief.recentNews[0]?.title].filter(Boolean).join(" · ") : "";
    await ctx.reply(
      "research.reply",
      { company: p.company, confidence: r?.brief.confidence || "low", searched: !!r?.searched, headline, context: p.context },
      r ? `${p.company}: ${headline || r.brief.summary.slice(0, 120)}${r.cached ? " (from this week's brief)" : r.searched ? " (fresh web research)" : " (from memory, low confidence)"}. Coach — build the plan on this.` : `Couldn't research ${p.company}; go with what the catalog knows.`
    );
    return r ? `Briefed on ${p.company}: ${r.brief.recentNews.length} news items, confidence ${r.brief.confidence}${r.cached ? ", cached" : ""}.` : `No brief for ${p.company}.`;
  },
});
