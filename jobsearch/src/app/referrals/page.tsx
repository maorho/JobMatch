"use client";
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Inbox, Send, UserCheck } from "lucide-react";
import { useCurrentUser } from "@/app/lib/hooks/useCurrentUser";
import { PageHeader, Spinner, SignInGate, EmptyState } from "@/app/components/ui";

type Mine = { _id: string; company: string; jobTitle: string; jobId: string; jobModel: string; status: string; referrer: string; referrerNote: string; createdAt: string };
type InboxItem = { _id: string; company: string; jobTitle: string; jobUrl: string; jobId: string; jobModel: string; status: string; message: string; matchScore: number | null; candidate: { id: string; name: string; level: string; currentJob: string; hasResume: boolean }; createdAt: string };
type Profile = { _id: string; company: string; verified: boolean; active: boolean; capacity: number; open: number };
type Data = { mine: Mine[]; inbox: InboxItem[]; profiles: Profile[] };

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
const STATUS: Record<string, { he: string; cls: string }> = {
  requested: { he: "ממתין", cls: "jm-chip-sky" },
  accepted: { he: "אושר", cls: "jm-chip-teal" },
  submitted: { he: "הוגש", cls: "jm-chip-teal" },
  declined: { he: "נדחה", cls: "" },
  withdrawn: { he: "בוטל", cls: "" },
  expired: { he: "פג תוקף", cls: "" },
};
const jobHref = (r: { jobId: string; jobModel: string }) => `/job/${r.jobModel === "Job" ? "internal" : "external"}/${r.jobId}`;

/** /referrals — as a candidate: the referrals I asked for; as an insider: requests waiting for me. */
export default function ReferralsPage() {
  const { user, loading } = useCurrentUser();
  const { data, mutate } = useSWR<Data>(user ? "/api/referrals/requests" : null, fetcher);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");

  if (!loading && !user) return <div className="jm-page" dir="rtl"><SignInGate text="הפניות מבפנים זמינות למשתמשים רשומים." next="/referrals" /></div>;
  if (!data) return <div className="jm-page" dir="rtl"><Spinner label="טוען…" /></div>;

  const act = async (id: string, action: string) => {
    setBusy(id + action);
    await fetch(`/api/referrals/requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, note: notes[id] || "" }) });
    setBusy("");
    mutate();
  };
  const isInsider = data.profiles.some((p) => p.verified);
  const pending = data.inbox.filter((r) => r.status === "requested" || r.status === "accepted");
  const done = data.inbox.filter((r) => !["requested", "accepted"].includes(r.status));

  return (
    <div className="jm-page" dir="rtl">
      <PageHeader title="הפניות מבפנים" subtitle="עובדים מאומתים בחברות מגישים קו״ח של מועמדים מתאימים ישירות למגייס. כאן רואים את הבקשות שלך, ואם את/ה ממליץ/ה, את מי שמחכה לך." actions={<Link href="/Settings#insider" className="jm-btn jm-btn-secondary jm-btn-sm"><UserCheck className="h-4 w-4" /> {isInsider ? "הגדרות ממליץ/ה" : "אני עובד/ת בהייטק"}</Link>} />

      {isInsider && (
        <section className="mb-10">
          <h2 className="jm-h2 mb-1 inline-flex items-center gap-2"><Inbox className="h-5 w-5 text-teal" /> תיבת ההפניות שלי</h2>
          <p className="jm-muted mb-4">{data.profiles.filter((p) => p.verified).map((p) => `${p.company}: ${p.open}/${p.capacity} פתוחות`).join(" · ")}</p>
          {pending.length === 0 ? (
            <EmptyState icon="📭" title="אין בקשות שמחכות לך" text="כשמועמד/ת מתאים/ה יבקש/תבקש הפניה למשרה בחברה שלך, זה יופיע כאן ובהתראות." />
          ) : (
            <div className="space-y-4">
              {pending.map((r) => (
                <div key={r._id} className="jm-card p-5 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-navy">{r.candidate.name}{r.candidate.currentJob ? ` · ${r.candidate.currentJob}` : ""}{r.candidate.level ? ` · ${r.candidate.level}` : ""}</div>
                      <div className="jm-muted">מבקש/ת הפניה ל: <Link href={jobHref(r)} className="text-sky hover:underline">{r.jobTitle}</Link> ב-{r.company}{r.matchScore != null ? ` · התאמה ${r.matchScore}%` : ""} · {new Date(r.createdAt).toLocaleDateString("he-IL")}</div>
                    </div>
                    <span className={`jm-chip ${STATUS[r.status]?.cls || ""}`}>{STATUS[r.status]?.he || r.status}</span>
                  </div>
                  {r.message && <blockquote className="text-sm text-ink border-s-2 border-teal ps-3 whitespace-pre-wrap" dir="auto">{r.message}</blockquote>}
                  <div className="flex flex-wrap items-center gap-2">
                    {r.candidate.hasResume && <a href={`/api/referrals/requests/${r._id}/resume`} target="_blank" rel="noopener noreferrer" className="jm-btn jm-btn-secondary jm-btn-sm">קו״ח</a>}
                    {r.jobUrl && <a href={r.jobUrl} target="_blank" rel="noopener noreferrer" className="jm-btn jm-btn-ghost jm-btn-sm">המשרה באתר החברה ↗</a>}
                    <input value={notes[r._id] || ""} onChange={(e) => setNotes({ ...notes, [r._id]: e.target.value })} placeholder="הערה למועמד/ת (אופציונלי)" className="jm-input flex-1 min-w-[12rem] py-2 text-sm" />
                    {r.status === "requested" && <button onClick={() => act(r._id, "accept")} disabled={!!busy} className="jm-btn jm-btn-secondary jm-btn-sm">אקח את זה</button>}
                    <button onClick={() => act(r._id, "submitted")} disabled={!!busy} className="jm-btn jm-btn-primary jm-btn-sm"><Send className="h-4 w-4" /> הגשתי את הקו״ח</button>
                    <button onClick={() => act(r._id, "decline")} disabled={!!busy} className="jm-btn jm-btn-ghost jm-btn-sm text-red-600">לא הפעם</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {done.length > 0 && (
            <details className="mt-4">
              <summary className="jm-muted cursor-pointer">היסטוריה ({done.length})</summary>
              <ul className="mt-2 space-y-1 text-sm">
                {done.map((r) => <li key={r._id} className="flex items-center gap-2"><span className={`jm-chip ${STATUS[r.status]?.cls || ""}`}>{STATUS[r.status]?.he || r.status}</span> {r.candidate.name} · {r.jobTitle}</li>)}
              </ul>
            </details>
          )}
        </section>
      )}

      <section>
        <h2 className="jm-h2 mb-1 inline-flex items-center gap-2"><Send className="h-5 w-5 text-sky" /> הבקשות שלי</h2>
        <p className="jm-muted mb-4">עד 5 בקשות פתוחות במקביל. בקשה בלי תשובה פגה אחרי שבועיים.</p>
        {data.mine.length === 0 ? (
          <EmptyState icon="🤝" title="עוד לא ביקשת הפניה" text="בעמוד של משרה שיש בה עובדים מאומתים תראה/י 'מישהו מבפנים'. משם שולחים בקשה עם כמה משפטים." action={<Link href="/" className="jm-btn jm-btn-primary">למשרות</Link>} />
        ) : (
          <div className="jm-card divide-y divide-line">
            {data.mine.map((r) => (
              <div key={r._id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link href={jobHref(r)} className="font-medium text-navy hover:underline">{r.jobTitle}</Link>
                  <div className="jm-muted">{r.company}{r.referrer ? ` · ${r.referrer}` : ""} · {new Date(r.createdAt).toLocaleDateString("he-IL")}{r.referrerNote ? ` · "${r.referrerNote}"` : ""}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`jm-chip ${STATUS[r.status]?.cls || ""}`}>{STATUS[r.status]?.he || r.status}</span>
                  {(r.status === "requested" || r.status === "accepted") && <button onClick={() => act(r._id, "withdraw")} disabled={!!busy} className="jm-btn jm-btn-ghost jm-btn-sm">בטל</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
