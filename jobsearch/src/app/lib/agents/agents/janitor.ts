import { registerAgent } from "../registry";
import type { Payloads } from "../types";
import { sweepStaleExternalJobs } from "@/app/lib/staleJobsSweep";

export const janitorAgent = registerAgent({
  name: "janitor",
  title: "Janitor",
  description: "Deletes postings that no source has reported for a while, so the feed never shows dead jobs.",
  handles: ["catalog.sweep"],
  async handle(msg) {
    const p = msg.payload as Payloads["catalog.sweep"];
    const r = await sweepStaleExternalJobs(p.staleDays ?? 14);
    return `Swept postings unseen since ${r.cutoff.slice(0, 10)}: ${r.deleted} removed (${r.applicationsDeleted} applications cleaned up).`;
  },
});
