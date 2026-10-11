import { registerAgent } from "../registry";
import type { Payloads } from "../types";
import { notify, notifyMany } from "@/app/lib/notifications/notify";
import User from "@/app/models/User";
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
  handles: ["jobs.embedded", "candidate.matched", "prep.ready", "apply.report", "content.ready", "outcome.prompt"],
  async handle(msg) {
    switch (msg.type) {
      case "outcome.prompt": {
        const p = msg.payload as Payloads["outcome.prompt"];
        const STAGE: Record<string, string> = { hr: "שיחת ה-HR", technical: "הראיון הטכני", final: "הראיון הסופי" };
        if (p.replies.length) {
          await notify(p.userId, {
            type: "application_status",
            title: p.replies.length === 1 ? `קיבלת תשובה מ-${p.replies[0].company}?` : `קיבלת תשובה? ${p.replies.length} הגשות מחכות לעדכון`,
            body: p.replies.map((r) => `${r.title} · ${r.company} — לפני ${r.daysAgo} ימים`).join("\n"),
            link: "/Dashboard#outcomes",
            meta: { agent: "tracker", applicationIds: p.replies.map((r) => r.applicationId) },
          });
        }
        if (p.questions.length) {
          await notify(p.userId, {
            type: "system",
            title: p.questions.length === 1 ? `מה שאלו אותך ב${STAGE[p.questions[0].stage] || "ראיון"} ב-${p.questions[0].company}?` : `מה שאלו אותך? ${p.questions.length} ראיונות לתעד`,
            body: "דקה אחת של תיעוד — והשאלות האמיתיות יחכו לך (ולאחרים) בהכנה הבאה.",
            link: "/Dashboard#outcomes",
            meta: { agent: "tracker", applicationIds: p.questions.map((q) => q.applicationId) },
          });
        }
        return `Asked about ${p.replies.length} application${p.replies.length === 1 ? "" : "s"} and ${p.questions.length} interview${p.questions.length === 1 ? "" : "s"}.`;
      }
      case "content.ready": {
        const p = msg.payload as Payloads["content.ready"];
        const admins: any[] = await User.find({ admin: true }).select("_id").limit(20).lean();
        await notifyMany(admins.map((a) => String(a._id)), {
          type: "system",
          title: p.status === "published" ? `מאמר חדש פורסם: ${p.title}` : `טיוטת מאמר מחכה לאישור: ${p.title}`,
          body: `${p.words} מילים · /Articels/${p.slug}`,
          link: "/AdminDashboard/articles",
          meta: { agent: "writer", articleId: p.articleId },
        });
        return `Told ${admins.length} admin${admins.length === 1 ? "" : "s"} about "${p.title}".`;
      }
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
