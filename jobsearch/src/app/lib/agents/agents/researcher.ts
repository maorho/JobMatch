import { registerAgent } from "../registry";
import type { Payloads } from "../types";
import { researchCompany } from "@/app/lib/interview/companyResearch";
import CompanySource from "@/app/models/CompanySource";

export const researcherAgent = registerAgent({
  name: "researcher",
  title: "Researcher",
  description: "Reads up on a company before an interview — products, recent news, size, culture, how their interviews run — with web search, cached for a week.",
  handles: ["research.request"],
  async handle(msg, ctx) {
    const p = msg.payload as Payloads["research.request"];
    const src: any = p.domain ? null : await CompanySource.findOne({ companyName: p.company }).select("domain").lean().catch(() => null);
    const r = await researchCompany(p.company, { domain: p.domain || src?.domain || undefined }).catch((e) => {
      ctx.log(`research failed: ${(e as Error)?.message}`);
      return null;
    });
    const headline = r ? [r.brief.sizeAndStage, r.brief.recentNews[0]?.title].filter(Boolean).join(" · ") : "";
    await ctx.reply(
      "research.reply",
      { company: p.company, confidence: r?.brief.confidence || "low", searched: !!r?.searched, headline, context: p.context },
      r ? `${p.company}: ${headline || r.brief.summary.slice(0, 120)}${r.cached ? " (from this week's brief)" : r.searched ? " (fresh web research)" : " (from memory, low confidence)"}. Coach — build the plan on this.` : `Couldn't research ${p.company}; go with what the catalog knows.`
    );
    return r ? `Briefed on ${p.company}: ${r.brief.recentNews.length} news items, confidence ${r.brief.confidence}${r.cached ? ", cached" : ""}.` : `No brief for ${p.company}.`;
  },
});
