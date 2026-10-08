import { registerAgent } from "../registry";
import type { Payloads } from "../types";
import { notify } from "@/app/lib/notifications/notify";
import { runJobMatchDigest } from "@/app/lib/notifications/digest";

const STAGE_TITLES: Record<string, string> = {
  hr: "שיחת ה-HR",
  technical: "הראיון הטכני",
  final: "הראיון הסופי",
};

export const notifierAgent = registerAgent({
  name: "notifier",
  title: "Notifier",
  description: "The only agent that talks to people: turns what the others found into in-app notifications.",
  handles: ["jobs.embedded", "candidate.matched", "prep.ready"],
  async handle(msg) {
    switch (msg.type) {
      case "jobs.embedded": {
        const r = await runJobMatchDigest();
        return `Digest: ${r.newJobs} new postings vs ${r.users} candidates → ${r.notified} people notified.`;
      }
      case "candidate.matched": {
        const p = msg.payload as Payloads["candidate.matched"];
        await notify(p.userId, {
          type: "job_match",
          title: p.top.length === 1 ? "מצאנו משרה שמתאימה לקו״ח שלך" : `${p.top.length} משרות שמתאימות לקו״ח החדש שלך`,
          body: p.top.map((t) => `${t.title} · ${t.company} (${t.score}%)`).join("\n"),
          link: "/",
          meta: { jobIds: p.top.map((t) => t.jobId), agent: "matcher" },
        });
        return `Told the candidate about ${p.top.length} matches.`;
      }
      case "prep.ready": {
        const p = msg.payload as Payloads["prep.ready"];
        const stage = STAGE_TITLES[p.stage] || p.status;
        await notify(p.userId, {
          type: "application_status",
          title: `הכנה ל${stage} ב-${p.company}`,
          body: `${p.title}${p.score !== null ? ` · התאמה ${p.score}%` : ""}${p.generated ? " — הכנו לך תוכנית הכנה לשלב הזה." : " — פתח/י את עמוד ההכנה לראיון."}`,
          link: `/interview-prep/${p.source}/${p.jobId}`,
          meta: { stage: p.stage, score: p.score, agent: "coach" },
        });
        return `Sent the ${p.stage} prep invitation.`;
      }
    }
  },
});
