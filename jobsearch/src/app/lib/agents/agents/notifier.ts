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
  handles: ["jobs.embedded", "candidate.matched", "prep.ready", "apply.report", "content.ready", "outcome.prompt", "practice.graded"],
  async handle(msg) {
    switch (msg.type) {
      case "practice.graded": {
        const p = msg.payload as Payloads["practice.graded"];
        const VERDICT: Record<string, string> = { pass: "עברת", borderline: "על הגבול", fail: "עוד לא" };
        await notify(p.userId, {
          type: "system",
          title: `${p.kind === "coding" ? "הבוחן בדק" : "המשוב על עבודת הבית מוכן"}: ${p.title} — ${p.score}/100`,
          body: `${VERDICT[p.verdict] || p.verdict}. המשוב המפורט, לפי קריטריונים, מחכה לך.`,
          link: `/practice/${p.attemptId}`,
          meta: { agent: p.kind === "coding" ? "examiner" : "assigner", attemptId: p.attemptId, score: p.score },
        });
        return `Told the candidate: ${p.score}/100 on "${p.title}".`;
      }
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
        const deferred = p.deferred ?? 0;
        // Failures and deferrals ride along as a trailer line, so the person sees the whole picture.
        const trailer = [p.failed ? `${p.failed} הגשות נכשלו (ראה/י את יומן ההגשה האוטומטית)` : "", deferred ? `${deferred} הגשות נדחו — שרת ההגשה לא היה זמין, ננסה שוב בסבב הבא` : ""].filter(Boolean).join("\n");
        if (p.submitted.length) {
          await notify(p.userId, {
            type: "application_status",
            title: p.submitted.length === 1 ? `הגשנו בשבילך מועמדות: ${p.submitted[0].title}` : `הגשנו בשבילך ${p.submitted.length} מועמדויות`,
            body: [p.submitted.map((s) => `${s.title} · ${s.company} (${s.score}%)`).join("\n"), trailer].filter(Boolean).join("\n"),
            link: "/Dashboard",
            meta: { agent: "applier", jobIds: p.submitted.map((s) => s.jobId), failed: p.failed, deferred },
          });
        }
        if (p.needsUser.length) {
          await notify(p.userId, {
            type: "system",
            title: p.needsUser.length === 1 ? `משרה מתאימה מחכה להגשה שלך: ${p.needsUser[0].title}` : `${p.needsUser.length} משרות מתאימות מחכות להגשה שלך`,
            body: [p.needsUser.map((n) => `${n.title} · ${n.company} — ${n.reason}`).join("\n"), p.submitted.length ? "" : trailer].filter(Boolean).join("\n"),
            link: "/Dashboard#auto-apply",
            meta: { agent: "applier", jobIds: p.needsUser.map((n) => n.jobId) },
          });
        }
        if (!p.submitted.length && !p.needsUser.length && trailer) {
          await notify(p.userId, {
            type: "system",
            title: deferred && !p.failed ? "ההגשה האוטומטית נדחתה לסבב הבא" : "ההגשה האוטומטית לא הצליחה",
            body: trailer,
            link: "/Dashboard#auto-apply",
            meta: { agent: "applier", failed: p.failed, deferred },
          });
        }
        return `Reported ${p.submitted.length} submissions, ${p.needsUser.length} hand-offs, ${p.failed} failed, ${deferred} deferred.`;
      }
      case "jobs.embedded": {
        const p = msg.payload as Payloads["jobs.embedded"];
        // No new postings → nobody has anything new to hear about; a company-scoped
        // refresh (discovery) is too small for a digest and must not fan out to every user.
        if (p.created === 0) return "Nothing new was ingested — digest skipped.";
        if (p.company) return `Company-scoped refresh (${p.company}) — digest left to the next full catalog run.`;
        const r = await runJobMatchDigest();
        return `Digest: ${r.newJobs} new postings vs ${r.users} candidates → ${r.notified} people notified${r.skippedRecent ? ` (${r.skippedRecent} heard from us in the last ${r.minHours}h)` : ""}.`;
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
