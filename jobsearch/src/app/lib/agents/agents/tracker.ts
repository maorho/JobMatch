import { registerAgent } from "../registry";
import type { Payloads } from "../types";
import { syncUserEmails } from "@/app/lib/email/track";

export const trackerAgent = registerAgent({
  name: "tracker",
  title: "Tracker",
  description: "Reads the candidate's Gmail (read-only), classifies recruiter emails and moves applications to their new status.",
  handles: ["inbox.sync"],
  async handle(msg, ctx) {
    const { userId } = msg.payload as Payloads["inbox.sync"];
    const r = await syncUserEmails(userId, {
      // Report every status change into THIS conversation so the coach picks it up.
      publish: (change) =>
        ctx.send("application.changed", change, `${change.title} @ ${change.company} moved to "${change.status}". Coach — anything to prepare?`),
    });
    if (r.error) throw new Error(r.error);
    return `Read ${r.fetched} emails, ${r.classified} new, ${r.updated} application${r.updated === 1 ? "" : "s"} advanced.`;
  },
});
