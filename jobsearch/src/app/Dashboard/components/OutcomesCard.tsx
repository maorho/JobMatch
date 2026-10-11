"use client";
import { useState } from "react";
import useSWR from "swr";
import { MessageCircleQuestion, Reply } from "lucide-react";

type ReplyPrompt = { outcomeId: string; applicationId: string; title: string; company: string; daysAgo: number; askCount: number };
type QuestionPrompt = { outcomeId: string; applicationId: string; title: string; company: string; stage: "hr" | "technical" | "final" };
type Data = { replies: ReplyPrompt[]; questions: QuestionPrompt[]; stats: { total: number; replied: number; interviews: number; offers: number; rejected: number; medianResponseDays: number | null } };

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
const STAGE_HE: Record<string, string> = { hr: "שיחת ה-HR", technical: "הראיון הטכני", final: "הראיון הסופי" };
const ANSWERS: { outcome: string; label: string; cls: string }[] = [
  { outcome: "no_reply", label: "עדיין לא", cls: "jm-btn-ghost" },
  { outcome: "rejected", label: "נדחיתי", cls: "jm-btn-ghost text-red-600" },
  { outcome: "screen", label: "זומנתי לשיחת HR", cls: "jm-btn-secondary" },
  { outcome: "interview", label: "ראיון טכני", cls: "jm-btn-secondary" },
  { outcome: "offer", label: "קיבלתי הצעה", cls: "jm-btn-primary" },
];

/**
 * Dashboard: closes the loop after every application ("did you get a reply?")
 * and after every real interview ("what did they ask?"). The answers are what
 * the interview-likelihood score and the company question bank learn from.
 */
export default function OutcomesCard() {
  const { data, mutate } = useSWR<Data>("/api/outcomes", fetcher, { refreshInterval: 120_000 });
  const [busy, setBusy] = useState("");
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [share, setShare] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<Record<string, string>>({});

  if (!data) return null;
  const { replies, questions, stats } = data;
  if (!replies.length && !questions.length && stats.total === 0) return null;

  const answer = async (p: ReplyPrompt, outcome: string) => {
    setBusy(p.outcomeId);
    const r = await fetch("/api/outcomes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationId: p.applicationId, outcome }) });
    if (r.ok) setDone((d) => ({ ...d, [p.outcomeId]: outcome === "no_reply" ? "נשאל שוב בעוד שבוע" : "תודה, עודכן" }));
    setBusy("");
    mutate();
  };
  const submitQuestions = async (q: QuestionPrompt) => {
    const text = (texts[q.outcomeId] || "").trim();
    if (text.length < 5) return;
    setBusy(q.outcomeId);
    const r = await fetch("/api/outcomes/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationId: q.applicationId, stage: q.stage, text, shareable: share[q.outcomeId] !== false }) });
    const d = r.ok ? await r.json() : null;
    setDone((s) => ({ ...s, [q.outcomeId]: d ? `נשמרו ${d.created} שאלות — הן יופיעו בהכנה הבאה שלך` : "משהו השתבש, נסה/י שוב" }));
    setBusy("");
    mutate();
  };
  const skip = async (q: QuestionPrompt) => {
    setBusy(q.outcomeId);
    await fetch("/api/outcomes/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationId: q.applicationId, stage: q.stage, skip: true }) });
    setDone((s) => ({ ...s, [q.outcomeId]: "בסדר, לא נשאל שוב" }));
    setBusy("");
    mutate();
  };

  return (
    <section id="outcomes" className="jm-card p-5 sm:p-6 space-y-4" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h2 className="jm-h2">🔁 מה קרה עם ההגשות?</h2>
          <p className="text-sm text-ink-600 mt-1">כל תשובה מלמדת את המערכת מה באמת מוביל לראיון — ומשפרת את ציון &quot;סיכוי לראיון&quot; שלך.</p>
        </div>
        {stats.total > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="jm-chip">{stats.total} הגשות</span>
            <span className="jm-chip jm-chip-sky">{stats.replied} תשובות</span>
            <span className="jm-chip jm-chip-teal">{stats.interviews} ראיונות</span>
            {stats.offers > 0 && <span className="jm-chip bg-emerald-50 text-emerald-700 border-emerald-200">{stats.offers} הצעות</span>}
            {stats.medianResponseDays !== null && <span className="jm-chip">תשובה תוך ~{stats.medianResponseDays} ימים</span>}
          </div>
        )}
      </div>

      {replies.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-navy inline-flex items-center gap-2"><Reply className="h-4 w-4 text-teal" /> קיבלת תשובה?</h3>
          {replies.map((p) => (
            <div key={p.outcomeId} className="rounded-control border border-line p-3 flex flex-col gap-2">
              <div className="text-sm"><span className="font-medium text-navy">{p.title}</span> · {p.company} <span className="jm-muted">· הגשת לפני {p.daysAgo} ימים</span></div>
              {done[p.outcomeId] ? (
                <p className="text-sm text-teal">{done[p.outcomeId]}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {ANSWERS.map((a) => (
                    <button key={a.outcome} type="button" disabled={busy === p.outcomeId} onClick={() => answer(p, a.outcome)} className={`jm-btn jm-btn-sm ${a.cls}`}>{a.label}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {questions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-navy inline-flex items-center gap-2"><MessageCircleQuestion className="h-4 w-4 text-teal" /> מה שאלו אותך?</h3>
          {questions.map((q) => (
            <div key={q.outcomeId} className="rounded-control border border-line p-3 flex flex-col gap-2">
              <div className="text-sm"><span className="font-medium text-navy">{STAGE_HE[q.stage]} ב-{q.company}</span> <span className="jm-muted">· {q.title}</span></div>
              {done[q.outcomeId] ? (
                <p className="text-sm text-teal">{done[q.outcomeId]}</p>
              ) : (
                <>
                  <textarea
                    value={texts[q.outcomeId] || ""}
                    onChange={(e) => setTexts((t) => ({ ...t, [q.outcomeId]: e.target.value }))}
                    placeholder="כתוב/י בחופשיות — שאלה בכל שורה, או סתם מה זכור לך. המערכת תסדר את זה לשאלות."
                    rows={4}
                    className="jm-input"
                    dir="auto"
                  />
                  <label className="flex items-center gap-2 text-xs text-ink-600">
                    <input type="checkbox" checked={share[q.outcomeId] !== false} onChange={(e) => setShare((s) => ({ ...s, [q.outcomeId]: e.target.checked }))} />
                    לשתף אנונימית במאגר השאלות של {q.company} (מומלץ — כך גם אחרים עוזרים לך)
                  </label>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy === q.outcomeId || (texts[q.outcomeId] || "").trim().length < 5} onClick={() => submitQuestions(q)} className="jm-btn jm-btn-primary jm-btn-sm">שמור שאלות</button>
                    <button type="button" disabled={busy === q.outcomeId} onClick={() => skip(q)} className="jm-btn jm-btn-ghost jm-btn-sm">עוד לא היה / דלג</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
