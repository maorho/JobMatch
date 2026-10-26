import { registerAgent } from "../registry";
import type { Payloads } from "../types";
import { runScout } from "@/app/lib/scout/runScout";
import { discoverCompanies } from "@/app/lib/scout/discover";
import AgentMessage from "@/app/models/AgentMessage";

/** How long one chunk may poll before handing the rest back to the queue. */
const CHUNK_BUDGET_MS = 60_000;
/** Kept free before the dispatcher's deadline for the hand-off messages and the bus bookkeeping. */
const DEADLINE_MARGIN_MS = 10_000;

export const scoutAgent = registerAgent({
  name: "scout",
  title: "Scout",
  description: "Polls every company source (ATS feeds, career pages), adds new postings and retires the ones that disappeared — and keeps finding companies the catalogue doesn't cover yet.",
  handles: ["catalog.refresh", "catalog.discover"],
  async handle(msg, ctx) {
    if (msg.type === "catalog.discover") {
      const p = msg.payload as Payloads["catalog.discover"];
      const r = await discoverCompanies({ limit: p.limit ?? 20, search: p.search !== false, log: ctx.log, heartbeat: ctx.heartbeat, deadline: ctx.deadline });
      // A found company is polled right away so its postings show up today, not on the next full
      // refresh. The refresh is company-scoped: it must not fan out into a full digest (see jobs.ingested).
      for (const f of r.found) await ctx.send("catalog.refresh", { since: new Date().toISOString(), company: f.name }, `New source: ${f.name} (${f.atsType}). Polling it now.`);
      const c = r.collected;
      return `Discovery: ${c.contacts + c.insiders + c.search} new names (${c.contacts} from contacts, ${c.insiders} from insiders, ${c.search} from search${c.topic ? ` on "${c.topic}"` : ""}); probed ${r.probed}: ${r.found.length} new source${r.found.length === 1 ? "" : "s"}${r.found.length ? ` — ${r.found.map((f) => f.name).join(", ")}` : ""}, ${r.notFound} without a known ATS; ${r.pending} still to try${r.stoppedEarly ? " (stopped early: out of time)" : ""}.`;
    }

    const p = msg.payload as Payloads["catalog.refresh"];
    // The chunk lives inside the dispatcher's budget: never plan past ctx.deadline, and let
    // runScout refuse to start a source whose own deadline would not fit before it.
    const hardEnd = ctx.deadline - DEADLINE_MARGIN_MS;
    const res = await runScout({
      offset: p.offset ?? 0,
      company: p.company,
      timeBudgetMs: Math.max(0, Math.min(CHUNK_BUDGET_MS, hardEnd - Date.now())),
      deadlineAt: hardEnd,
      heartbeat: ctx.heartbeat,
    });
    const acc = {
      created: (p.acc?.created ?? 0) + res.created,
      removed: (p.acc?.removed ?? 0) + res.removed,
      sources: (p.acc?.sources ?? 0) + res.processed,
    };
    const errors = res.results.filter((r) => r.error);
    for (const e of errors.slice(0, 5)) ctx.log(`⚠ ${e.company} (${e.atsType}): ${e.error}`);
    const partial = res.results.filter((r) => r.partial);
    for (const e of partial.slice(0, 5)) ctx.log(`◐ ${e.company} (${e.atsType}): partial list, nothing closed${e.partialReason ? ` — ${e.partialReason}` : ""}`);

    // A retry of this message must not fork the walk. Its follow-up (next chunk or the
    // hand-off) is parented to this message by ctx.send, so "already sent" is keyed on
    // parentId — the offset can differ between attempts (the time budget varies).
    const alreadySent = (type: "catalog.refresh" | "jobs.ingested") => AgentMessage.exists({ runId: msg.runId, type, parentId: msg._id });

    if (res.nextOffset !== null) {
      ctx.log(`Progress: sources ${p.offset ?? 0}–${res.nextOffset - 1} of ${res.totalSources} polled.`);
      if (await alreadySent("catalog.refresh")) {
        ctx.log(`The next chunk was already queued by an earlier attempt of this message — not sending it again.`);
      } else {
        await ctx.send(
          "catalog.refresh",
          { ...p, offset: res.nextOffset, acc },
          `Polled ${res.processed} sources (+${res.created} / −${res.removed}); continuing from source #${res.nextOffset} of ${res.totalSources}.`
        );
      }
      return `Chunk done: sources ${p.offset ?? 0}–${res.nextOffset - 1} of ${res.totalSources}, +${res.created} new, −${res.removed} closed.`;
    }

    if (await alreadySent("jobs.ingested")) {
      ctx.log("The hand-off was already sent by an earlier attempt of this message — not sending it again.");
      return `Finished ${p.company ? p.company : "the catalog"} (hand-off already sent).`;
    }
    await ctx.send(
      "jobs.ingested",
      { since: p.since, created: acc.created, removed: acc.removed, sources: acc.sources, ...(p.company ? { company: p.company } : {}) },
      p.company
        ? `${p.company} polled: +${acc.created} new postings. Locator — clean their locations (company-scoped, no digest).`
        : `Catalog refreshed: ${acc.sources} sources, +${acc.created} new postings, −${acc.removed} closed. Locator — the new ones need clean locations.`
    );
    return `Finished ${p.company ? p.company : "the catalog"}: ${acc.sources} source${acc.sources === 1 ? "" : "s"}, +${acc.created} new, −${acc.removed} closed${errors.length ? `, ${errors.length} source${errors.length === 1 ? "" : "s"} errored` : ""}.`;
  },
});
