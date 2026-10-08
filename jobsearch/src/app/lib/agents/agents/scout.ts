import { registerAgent } from "../registry";
import type { Payloads } from "../types";
import { runScout } from "@/app/lib/scout/runScout";

/** How long one chunk may poll before handing the rest back to the queue. */
const CHUNK_BUDGET_MS = 60_000;

export const scoutAgent = registerAgent({
  name: "scout",
  title: "Scout",
  description: "Polls every company source (ATS feeds, career pages), adds new postings and retires the ones that disappeared.",
  handles: ["catalog.refresh"],
  async handle(msg, ctx) {
    const p = msg.payload as Payloads["catalog.refresh"];
    const res = await runScout({ offset: p.offset ?? 0, company: p.company, timeBudgetMs: CHUNK_BUDGET_MS });
    const acc = {
      created: (p.acc?.created ?? 0) + res.created,
      removed: (p.acc?.removed ?? 0) + res.removed,
      sources: (p.acc?.sources ?? 0) + res.processed,
    };
    const errors = res.results.filter((r) => r.error);
    for (const e of errors.slice(0, 5)) ctx.log(`⚠ ${e.company} (${e.atsType}): ${e.error}`);

    if (res.nextOffset !== null) {
      await ctx.send(
        "catalog.refresh",
        { ...p, offset: res.nextOffset, acc },
        `Polled ${res.processed} sources (+${res.created} / −${res.removed}); continuing from source #${res.nextOffset} of ${res.totalSources}.`
      );
      return `Chunk done: sources ${p.offset ?? 0}–${res.nextOffset - 1} of ${res.totalSources}, +${res.created} new, −${res.removed} gone.`;
    }

    await ctx.send(
      "jobs.ingested",
      { since: p.since, created: acc.created, removed: acc.removed, sources: acc.sources },
      `Catalog refreshed: ${acc.sources} sources, +${acc.created} new postings, −${acc.removed} retired. Locator — the new ones need clean locations.`
    );
    return `Finished the catalog: ${acc.sources} sources, +${acc.created} new, −${acc.removed} retired${errors.length ? `, ${errors.length} sources errored` : ""}.`;
  },
});
