import { registerAgent } from "../registry";
import type { Payloads } from "../types";
import { normalizeCatalogLocations } from "@/app/lib/locations/normalizeCatalog";
import { resolveRawLocations, rawKey } from "@/app/lib/locations/resolveLocations";
import ExternalJobs from "@/app/models/ExternalJobs";

/**
 * Company-scoped pass (a discovery refresh): resolve only the raw location
 * strings of that company's postings ingested since `since`, instead of
 * re-walking every distinct pair in the catalog.
 */
async function normalizeCompanyLocations(company: string, since: Date, useLLM: boolean) {
  const jobs: any[] = await ExternalJobs.find({ company, firstSeenAt: { $gte: since } }).select("city country rawLocation").lean();
  const inputs = jobs.map((j) => (j.rawLocation ? { city: j.rawLocation, country: "" } : { city: j.city || "", country: j.country || "" }));
  const unique = [...new Map(inputs.map((i) => [rawKey(i), i])).values()];
  const resolved = unique.length ? await resolveRawLocations(unique, { useLLM }) : new Map();
  let updatedDocs = 0;
  let unresolved = 0;
  for (let i = 0; i < jobs.length; i++) {
    const key = rawKey(inputs[i]);
    const r = resolved.get(key);
    if (!r) continue;
    if (!r.country && !r.remote) unresolved++;
    const city = r.confidence === "low" ? jobs[i].city || "" : r.city;
    const country = r.country || (r.remote ? "Remote" : r.confidence === "low" ? jobs[i].country || "Unknown" : "Unknown");
    if (city === (jobs[i].city || "") && country === (jobs[i].country || "") && !r.remote) continue;
    const res = await ExternalJobs.updateOne({ _id: jobs[i]._id }, { $set: { city, country, remote: !!r.remote, rawLocation: jobs[i].rawLocation || key } });
    updatedDocs += res.modifiedCount ?? 0;
  }
  return { pairs: unique.length, updatedDocs, unresolved };
}

export const locatorAgent = registerAgent({
  name: "locator",
  title: "Locator",
  description: "Turns raw location strings into a clean city / country / remote (rules → cache → LLM for the leftovers).",
  handles: ["jobs.ingested"],
  async handle(msg, ctx) {
    const p = msg.payload as Payloads["jobs.ingested"];
    const useLLM = !!process.env.OPENAI_API_KEY;
    const pass = p.company ? { company: p.company } : {};
    if (p.company) {
      const r = await normalizeCompanyLocations(p.company, new Date(p.since), useLLM);
      await ctx.send(
        "jobs.normalized",
        { since: p.since, updatedDocs: r.updatedDocs, unresolved: r.unresolved, created: p.created, ...pass },
        `${p.company}: ${r.pairs} location string${r.pairs === 1 ? "" : "s"} checked, ${r.updatedDocs} postings rewritten. Matcher — embed the new ones (no digest, company-scoped).`
      );
      return `Company-scoped: ${r.pairs} location strings for ${p.company}, rewrote ${r.updatedDocs} postings.`;
    }
    const r = await normalizeCatalogLocations({ useLLM });
    if (r.unresolvedCount) ctx.log(`Still unresolved: ${r.unresolved.slice(0, 8).join(" | ")}${r.unresolvedCount > 8 ? " …" : ""}`);
    await ctx.send(
      "jobs.normalized",
      { since: p.since, updatedDocs: r.updatedDocs, unresolved: r.unresolvedCount, created: p.created },
      `Locations are clean (${r.pairs} distinct, ${r.updatedDocs} postings rewritten, ${r.unresolvedCount} I couldn't place). Matcher — ready for embeddings.`
    );
    return `Checked ${r.pairs} location strings: rules ${r.bySource.rules ?? 0}, LLM ${r.bySource.llm ?? 0}; rewrote ${r.updatedDocs} postings.`;
  },
});
