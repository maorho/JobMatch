import { registerAgent } from "../registry";
import type { Payloads } from "../types";
import { normalizeCatalogLocations } from "@/app/lib/locations/normalizeCatalog";

export const locatorAgent = registerAgent({
  name: "locator",
  title: "Locator",
  description: "Turns raw location strings into a clean city / country / remote (rules → cache → LLM for the leftovers).",
  handles: ["jobs.ingested"],
  async handle(msg, ctx) {
    const p = msg.payload as Payloads["jobs.ingested"];
    const r = await normalizeCatalogLocations({ useLLM: !!process.env.OPENAI_API_KEY });
    if (r.unresolvedCount) ctx.log(`Still unresolved: ${r.unresolved.slice(0, 8).join(" | ")}${r.unresolvedCount > 8 ? " …" : ""}`);
    await ctx.send(
      "jobs.normalized",
      { since: p.since, updatedDocs: r.updatedDocs, unresolved: r.unresolvedCount },
      `Locations are clean (${r.pairs} distinct, ${r.updatedDocs} postings rewritten, ${r.unresolvedCount} I couldn't place). Matcher — ready for embeddings.`
    );
    return `Checked ${r.pairs} location strings: rules ${r.bySource.rules ?? 0}, LLM ${r.bySource.llm ?? 0}; rewrote ${r.updatedDocs} postings.`;
  },
});
