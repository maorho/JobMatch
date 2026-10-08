import { startFlow, kick } from "./bus";

/**
 * Entry points for product events that should wake the agents. Each starts a
 * run on the bus and nudges the dispatcher; all best-effort, never throws.
 */
export function announceResumeUpdate(userId: string): void {
  startFlow("resume.updated", { userId }, { from: "resumeai", startedBy: `user:${userId}`, title: "Résumé updated", says: "A candidate just updated their résumé. Matcher — what fits them now?" })
    .then(() => kick())
    .catch((e) => console.warn("[agents] resume.updated skipped:", e?.message));
}

export async function announceCatalogIngested(input: { since: Date; created: number; removed: number; sources: number }): Promise<void> {
  await startFlow(
    "jobs.ingested",
    { since: input.since.toISOString(), created: input.created, removed: input.removed, sources: input.sources },
    { from: "scout", startedBy: "cron", title: "Catalog refreshed (cron)", says: `Catalog refreshed: +${input.created} / −${input.removed}. Locator — the new ones need clean locations.` }
  );
}
