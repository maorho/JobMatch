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
  handles: ["jobs.embedded", "candidate.matched", "prep.ready", "apply.report"],
  async handle(msg) {
    switch (msg.type) {
      case "apply.report": {
        const p = msg.payload as Payloads["apply.report"];
        if (p.submitted.length) {
          await notify(p.userId, {
            type: "application_status",
            title: p.submitted.length === 1 ? `הגשנו בשבילך מועמדות: ${p.submitted[0].title}` : `הגשנו בשבילך ${p.submitted.length} מועמדויות`,
            body: p.submitted.map((s) => `${s.title} · ${s.company} (${s.score}%)`).join("\n"),
            link: "/Dashboard",
            meta: { agent: "applier", jobIds: p.submitted.map((s) => s.jobId) },
          });
        }
        if (p.needsUser.length) {
          await notify(p.userId, {
            type: "system",
            title: p.needsUser.length === 1 ? `משרה מתאימה מחכה להגשה שלך: ${p.needsUser[0].title}` : `${p.needsUser.length} משרות מתאימות מחכות להגשה שלך`,
            body: p.needsUser.map((n) => `${n.title} · ${n.company} — ${n.reason}`).join("\n"),
            link: "/Dashboard#auto-apply",
            meta: { agent: "applier", jobIds: p.needsUser.map((n) => n.jobId) },
          });
        }
        return `Reported ${p.submitted.length} submissions and ${p.needsUser.length} hand-offs.`;
      }
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
