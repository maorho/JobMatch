"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useCurrentUser } from "../../../lib/hooks/useCurrentUser";
import { EmptyState, Spinner } from "../../../components/ui";

type Question = { question: string; whyAsked: string; howToAnswer: string; sampleAnswer?: string };
type Stage = { key: string; title: string; description: string; durationHint?: string; likelyQuestions: Question[]; tips: string[] };
type Plan = {
  company: { summary: string; whatTheyDo: string; techStack: string[]; cultureHints: string[] };
  roleSummary: string;
  stages: Stage[];
  gaps: { topic: string; whyItMatters: string; studyPlan: string }[];
  questionsToAsk: string[];
  checklist: string[];
};
type Prep = { prepId: string; job: { title: string; company: string }; plan: Plan; cached: boolean };
type Turn = { role: "user" | "assistant"; content: string };

const STAGE_ICON: Record<string, string> = { hr: "☎️", technical: "💻", home_assignment: "🏠", system_design: "🧩", behavioral: "🤝", final: "🏁" };

export default function InterviewPrepPage() {
  const { source, jobId } = useParams() as { source: string; jobId: string };
  const { user, loading: userLoading } = useCurrentUser();
  const [prep, setPrep] = useState<Prep | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const [stageKey, setStageKey] = useState<string>("");
  const [tab, setTab] = useState<"plan" | "practice">("plan");

  // Practice chat (per stage, kept client-side).
  const [turns, setTurns] = useState<Record<string, Turn[]>>({});
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const generate = async (force = false) => {
    setState("loading");
    setError("");
    try {
      const res = await fetch("/api/interview/prep", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, source, force, language: "he" }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "ההכנה נכשלה");
      setPrep(data);
      setStageKey(data.plan.stages[0]?.key || "");
      setState("ready");
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  };

  useEffect(() => {
    if (!user || state !== "idle") return;
    // Cached plan first; generate only if there is none.
    fetch(`/api/interview/prep?jobId=${jobId}&source=${source}`).then(async (r) => {
      if (r.ok) {
        const data = await r.json();
        setPrep(data);
        setStageKey(data.plan.stages[0]?.key || "");
        setState("ready");
      } else generate();
    });
  }, [user, jobId, source, state]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [turns, stageKey, tab]);

  const stage = prep?.plan.stages.find((s) => s.key === stageKey) || prep?.plan.stages[0];
  const chat = turns[stageKey] || [];

  const practice = async (userText?: string) => {
    if (!prep || busy) return;
    const next: Turn[] = userText ? [...chat, { role: "user", content: userText }] : chat;
    setTurns((t) => ({ ...t, [stageKey]: next }));
    setAnswer("");
    setBusy(true);
    try {
      const res = await fetch("/api/interview/practice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prepId: prep.prepId, stage: stageKey, transcript: next, language: "he" }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "התרגול נכשל");
      setTurns((t) => ({ ...t, [stageKey]: [...next, { role: "assistant", content: data.reply }] }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (userLoading) {
    return (
      <div className="jm-page" dir="rtl">
        <Spinner label="טוען…" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="jm-page" dir="rtl">
        <EmptyState
          icon="🔒"
          title="צריך להתחבר כדי להתכונן לראיון."
          action={<Link href="/Login" className="jm-btn jm-btn-primary">התחברות</Link>}
        />
      </div>
    );
  }

  const sectionTitle = "jm-h2 mb-2";
  const bulletList = "list-disc ps-5 text-sm text-ink-600 space-y-1 marker:text-teal";

  return (
    <div className="jm-page" dir="rtl">
      {/* Header card */}
      <section className="jm-card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div className="min-w-0">
          <Link href={`/job/${source}/${jobId}`} className="text-sm font-medium text-sky hover:underline">← חזרה למשרה</Link>
          <h1 className="jm-title mt-2">הכנה לראיון</h1>
          {prep && <p className="jm-subtitle">{prep.job.title} · {prep.job.company}</p>}
        </div>
        {state === "ready" && (
          <button onClick={() => generate(true)} className="jm-btn jm-btn-secondary jm-btn-sm shrink-0">צור תוכנית מחדש</button>
        )}
      </section>

      {state === "loading" && (
        <div className="jm-card p-8 sm:p-12 text-center flex flex-col items-center gap-3">
          <span className="h-8 w-8 rounded-full border-2 border-teal border-t-transparent animate-spin" aria-hidden />
          <div className="jm-h2">הסוכן אוסף מידע על התפקיד והחברה ובונה לך תוכנית הכנה…</div>
          <p className="jm-muted">תיאור המשרה · משרות נוספות של החברה · אתר החברה · קורות החיים שלך (כ-30–60 שניות)</p>
        </div>
      )}
      {state === "error" && (
        <p className="jm-alert jm-alert-err" role="alert">
          ⚠️ {error} <button onClick={() => generate()} className="font-medium underline">נסה שוב</button>
        </p>
      )}

      {state === "ready" && prep && stage && (
        <div className="space-y-6">
          {/* Company + role */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            <div className="jm-card p-5 sm:p-6">
              <h2 className={sectionTitle}>על החברה</h2>
              <p className="text-sm text-ink-600 leading-relaxed" dir="auto">{prep.plan.company.summary || prep.plan.company.whatTheyDo}</p>
              {prep.plan.company.techStack.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {prep.plan.company.techStack.map((t) => <span key={t} className="jm-chip">{t}</span>)}
                </div>
              )}
              {prep.plan.company.cultureHints.length > 0 && (
                <ul className={`${bulletList} mt-3`}>{prep.plan.company.cultureHints.map((c, i) => <li key={i} dir="auto">{c}</li>)}</ul>
              )}
            </div>
            <div className="jm-card p-5 sm:p-6">
              <h2 className={sectionTitle}>על התפקיד</h2>
              <p className="text-sm text-ink-600 leading-relaxed" dir="auto">{prep.plan.roleSummary}</p>
              {prep.plan.gaps.length > 0 && (
                <>
                  <h3 className="font-medium text-navy mt-4 mb-2">פערים לסגור לפני הראיון</h3>
                  <ul className="space-y-2">
                    {prep.plan.gaps.map((g, i) => (
                      <li key={i} className="text-sm rounded-control bg-amber-50 border border-amber-200 p-3" dir="auto">
                        <div className="font-medium text-amber-800">{g.topic}</div>
                        <div className="text-amber-900/80">{g.whyItMatters}</div>
                        {g.studyPlan && <div className="text-ink-600 mt-1">📚 {g.studyPlan}</div>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </section>

          {/* Stages */}
          <div className="space-y-3">
            <div className="flex gap-2 overflow-x-auto jm-scroll pb-1 -mx-1 px-1">
              {prep.plan.stages.map((s, i) => (
                <button
                  key={s.key}
                  onClick={() => setStageKey(s.key)}
                  aria-pressed={stageKey === s.key}
                  className={`shrink-0 cursor-pointer transition-colors ${stageKey === s.key ? "jm-chip jm-chip-navy" : "jm-chip hover:border-navy/40"}`}
                >
                  {i + 1}. {STAGE_ICON[s.key] ?? "•"} {s.title}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setTab("plan")} aria-pressed={tab === "plan"} className={`jm-btn jm-btn-sm ${tab === "plan" ? "jm-btn-accent" : "jm-btn-secondary"}`}>שאלות וטיפים</button>
              <button onClick={() => setTab("practice")} aria-pressed={tab === "practice"} className={`jm-btn jm-btn-sm ${tab === "practice" ? "jm-btn-accent" : "jm-btn-secondary"}`}>תרגול ראיון</button>
            </div>
          </div>

          {tab === "plan" ? (
            <section className="jm-card p-5 sm:p-6 space-y-5">
              <div>
                <h2 className="jm-h2">{stage.title}</h2>
                <p className="text-sm text-ink-600 mt-1" dir="auto">{stage.description}{stage.durationHint ? ` · ${stage.durationHint}` : ""}</p>
              </div>
              <ul className="space-y-3">
                {stage.likelyQuestions.map((q, i) => (
                  <li key={i}>
                    <details className="group rounded-control border border-line bg-surface p-4 open:bg-canvas transition-colors">
                      <summary className="cursor-pointer flex items-start gap-3 font-medium text-navy" dir="auto">
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy text-white text-xs font-semibold">{i + 1}</span>
                        <span className="min-w-0 flex-1">{q.question}</span>
                      </summary>
                      <div className="mt-3 ps-9 space-y-2 text-sm text-ink-600">
                        {q.whyAsked && <p dir="auto"><span className="font-medium text-navy">למה שואלים: </span>{q.whyAsked}</p>}
                        {q.howToAnswer && <p dir="auto"><span className="font-medium text-navy">איך לענות: </span>{q.howToAnswer}</p>}
                        {q.sampleAnswer && <p dir="auto" className="rounded-control bg-teal-50 border border-teal/20 p-3"><span className="font-medium text-navy">תשובה לדוגמה: </span>{q.sampleAnswer}</p>}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
              {stage.tips.length > 0 && (
                <div>
                  <h3 className="font-medium text-navy mb-2">טיפים לשלב הזה</h3>
                  <ul className={bulletList}>{stage.tips.map((t, i) => <li key={i} dir="auto">{t}</li>)}</ul>
                </div>
              )}
            </section>
          ) : (
            <section className="jm-card overflow-hidden flex flex-col">
              <div className="p-4 border-b border-line text-sm text-ink-600">
                ראיון מדומה לשלב <span className="font-medium text-navy">{stage.title}</span>: המראיין שואל שאלה אחת בכל פעם ונותן משוב על כל תשובה.
              </div>
              <div className="jm-scroll flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] max-h-[60vh]">
                {chat.length === 0 && !busy && (
                  <button onClick={() => practice()} className="jm-btn jm-btn-primary">התחל תרגול</button>
                )}
                {chat.map((t, i) => (
                  <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      dir="auto"
                      className={`max-w-[85%] px-4 py-2.5 text-sm sm:text-base whitespace-pre-line break-words ${
                        t.role === "user"
                          ? "bg-navy text-white rounded-2xl rounded-ee-sm"
                          : "bg-canvas border border-line text-ink rounded-2xl rounded-es-sm"
                      }`}
                    >
                      {t.content}
                    </div>
                  </div>
                ))}
                {busy && <div className="text-sm text-ink-400 italic">המראיין חושב…</div>}
                <div ref={bottomRef} />
              </div>
              {chat.length > 0 && (
                <form onSubmit={(e) => { e.preventDefault(); if (answer.trim()) practice(answer.trim()); }} className="p-3 border-t border-line flex flex-col sm:flex-row gap-2 sm:items-end">
                  <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={2} placeholder="התשובה שלך…" className="jm-input flex-1 resize-y" dir="auto" />
                  <button type="submit" disabled={busy || !answer.trim()} className="jm-btn jm-btn-primary">שלח</button>
                </form>
              )}
            </section>
          )}

          {/* Questions to ask + checklist */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            <div className="jm-card p-5 sm:p-6">
              <h2 className={sectionTitle}>שאלות שכדאי לך לשאול</h2>
              <ul className={bulletList}>{prep.plan.questionsToAsk.map((q, i) => <li key={i} dir="auto">{q}</li>)}</ul>
            </div>
            <div className="jm-card p-5 sm:p-6">
              <h2 className={sectionTitle}>צ&apos;קליסט לפני הראיון</h2>
              <ul className="space-y-1.5 text-sm text-ink-600">{prep.plan.checklist.map((c, i) => <li key={i} dir="auto">☐ {c}</li>)}</ul>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
