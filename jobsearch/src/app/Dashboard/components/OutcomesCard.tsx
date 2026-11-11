"use client";
import { useState } from "react";
import useSWR from "swr";
import { MessageCircleQuestion, Reply } from "lucide-react";
import { useT } from "../../lib/i18n/LanguageProvider";

type ReplyPrompt = { outcomeId: string; applicationId: string; title: string; company: string; daysAgo: number; askCount: number };
type QuestionPrompt = { outcomeId: string; applicationId: string; title: string; company: string; stage: "hr" | "technical" | "final" };
type Data = { replies: ReplyPrompt[]; questions: QuestionPrompt[]; stats: { total: number; replied: number; interviews: number; offers: number; rejected: number; medianResponseDays: number | null } };
/** What the person did with a prompt; rendered in the current language, so a language switch never leaves stale text. */
type Done = { kind: "askAgain" | "thanks" | "failed" | "skipped" } | { kind: "saved"; n: number };

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
const STAGE_KEY = { hr: "dashboard.outcomes.stage.hr", technical: "dashboard.outcomes.stage.technical", final: "dashboard.outcomes.stage.final" } as const;
const ANSWERS = [
  { outcome: "no_reply", key: "dashboard.outcomes.ans.noReply", cls: "jm-btn-ghost" },
  { outcome: "rejected", key: "dashboard.outcomes.ans.rejected", cls: "jm-btn-ghost text-red-600" },
  { outcome: "screen", key: "dashboard.outcomes.ans.screen", cls: "jm-btn-secondary" },
  { outcome: "interview", key: "dashboard.outcomes.ans.interview", cls: "jm-btn-secondary" },
  { outcome: "offer", key: "dashboard.outcomes.ans.offer", cls: "jm-btn-primary" },
] as const;

/**
 * Dashboard: closes the loop after every application ("did you get a reply?")
 * and after every real interview ("what did they ask?"). The answers are what
 * the interview-likelihood score and the company question bank learn from.
 */
export default function OutcomesCard() {
  const { t, dir } = useT();
  const { data, mutate } = useSWR<Data>("/api/outcomes", fetcher, { refreshInterval: 120_000 });
  const [busy, setBusy] = useState("");
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [share, setShare] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<Record<string, Done>>({});

  if (!data) return null;
  const { replies, questions, stats } = data;
  if (!replies.length && !questions.length && stats.total === 0) return null;

  const doneText = (d: Done) => (d.kind === "saved" ? t("dashboard.outcomes.saved", { n: d.n }) : t(`dashboard.outcomes.${d.kind}`));

  const answer = async (p: ReplyPrompt, outcome: string) => {
    setBusy(p.outcomeId);
    const r = await fetch("/api/outcomes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationId: p.applicationId, outcome }) });
    if (r.ok) setDone((d) => ({ ...d, [p.outcomeId]: { kind: outcome === "no_reply" ? "askAgain" : "thanks" } }));
    setBusy("");
    mutate();
  };
  const submitQuestions = async (q: QuestionPrompt) => {
    const text = (texts[q.outcomeId] || "").trim();
    if (text.length < 5) return;
    setBusy(q.outcomeId);
    const r = await fetch("/api/outcomes/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationId: q.applicationId, stage: q.stage, text, shareable: share[q.outcomeId] !== false }) });
    const d = r.ok ? await r.json() : null;
    setDone((s) => ({ ...s, [q.outcomeId]: d ? { kind: "saved", n: d.created } : { kind: "failed" } }));
    setBusy("");
    mutate();
  };
  const skip = async (q: QuestionPrompt) => {
    setBusy(q.outcomeId);
    await fetch("/api/outcomes/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationId: q.applicationId, stage: q.stage, skip: true }) });
    setDone((s) => ({ ...s, [q.outcomeId]: { kind: "skipped" } }));
    setBusy("");
    mutate();
  };

  return (
    <section id="outcomes" className="jm-card p-5 sm:p-6 space-y-4" dir={dir}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h2 className="jm-h2">{t("dashboard.outcomes.title")}</h2>
          <p className="text-sm text-ink-600 mt-1">{t("dashboard.outcomes.sub")}</p>
        </div>
        {stats.total > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="jm-chip">{t("dashboard.outcomes.statApps", { n: stats.total })}</span>
            <span className="jm-chip jm-chip-sky">{t("dashboard.outcomes.statReplies", { n: stats.replied })}</span>
            <span className="jm-chip jm-chip-teal">{t("dashboard.outcomes.statInterviews", { n: stats.interviews })}</span>
            {stats.offers > 0 && <span className="jm-chip bg-emerald-50 text-emerald-700 border-emerald-200">{t("dashboard.outcomes.statOffers", { n: stats.offers })}</span>}
            {stats.medianResponseDays !== null && <span className="jm-chip">{t("dashboard.outcomes.statMedian", { n: stats.medianResponseDays })}</span>}
          </div>
        )}
      </div>

      {replies.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-navy inline-flex items-center gap-2"><Reply className="h-4 w-4 text-teal" /> {t("dashboard.outcomes.gotReply")}</h3>
          {replies.map((p) => (
            <div key={p.outcomeId} className="rounded-control border border-line p-3 flex flex-col gap-2">
              <div className="text-sm"><span className="font-medium text-navy">{p.title}</span> · {p.company} <span className="jm-muted">{t("dashboard.outcomes.appliedAgo", { n: p.daysAgo })}</span></div>
              {done[p.outcomeId] ? (
                <p className="text-sm text-teal">{doneText(done[p.outcomeId])}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {ANSWERS.map((a) => (
                    <button key={a.outcome} type="button" disabled={busy === p.outcomeId} onClick={() => answer(p, a.outcome)} className={`jm-btn jm-btn-sm ${a.cls}`}>{t(a.key)}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {questions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-navy inline-flex items-center gap-2"><MessageCircleQuestion className="h-4 w-4 text-teal" /> {t("dashboard.outcomes.whatAsked")}</h3>
          {questions.map((q) => (
            <div key={q.outcomeId} className="rounded-control border border-line p-3 flex flex-col gap-2">
              <div className="text-sm"><span className="font-medium text-navy">{t("dashboard.outcomes.stageAt", { stage: t(STAGE_KEY[q.stage]), company: q.company })}</span> <span className="jm-muted">· {q.title}</span></div>
              {done[q.outcomeId] ? (
                <p className="text-sm text-teal">{doneText(done[q.outcomeId])}</p>
              ) : (
                <>
                  <textarea
                    value={texts[q.outcomeId] || ""}
                    onChange={(e) => setTexts((prev) => ({ ...prev, [q.outcomeId]: e.target.value }))}
                    placeholder={t("dashboard.outcomes.placeholder")}
                    rows={4}
                    className="jm-input"
                    dir={dir}
                  />
                  <label className="flex items-center gap-2 text-xs text-ink-600">
                    <input type="checkbox" checked={share[q.outcomeId] !== false} onChange={(e) => setShare((s) => ({ ...s, [q.outcomeId]: e.target.checked }))} />
                    {t("dashboard.outcomes.share", { company: q.company })}
                  </label>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy === q.outcomeId || (texts[q.outcomeId] || "").trim().length < 5} onClick={() => submitQuestions(q)} className="jm-btn jm-btn-primary jm-btn-sm">{t("dashboard.outcomes.save")}</button>
                    <button type="button" disabled={busy === q.outcomeId} onClick={() => skip(q)} className="jm-btn jm-btn-ghost jm-btn-sm">{t("dashboard.outcomes.skip")}</button>
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
