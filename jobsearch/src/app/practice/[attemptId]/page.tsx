"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Timer, CheckCircle2, AlertTriangle, Lightbulb } from "lucide-react";
import { Spinner } from "@/app/components/ui";

type Task = { _id: string; kind: "coding" | "assignment"; role: string; level: string; title: string; prompt: string; language: string; starterCode: string; examples: { input: string; output: string; explanation: string }[]; constraints: string[]; deliverables: string[]; rubric: { criterion: string; weight: number; description: string }[]; hints: string[]; tags: string[]; timeLimitMin: number; estimatedHours: number };
type Attempt = { _id: string; status: "in_progress" | "submitted" | "graded" | "failed"; startedAt: string; deadlineAt: string; submittedAt?: string; durationSec: number; timedOut: boolean; answer: string; repoUrl: string; score: number | null; verdict: string; breakdown: { criterion: string; weight: number; score: number; comment: string }[]; feedback: string; strengths: string[]; improvements: string[]; gradedBy: string; model: string };
type Data = { attempt: Attempt; task: Task; serverNow: string };

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
const VERDICT: Record<string, { label: string; cls: string }> = { pass: { label: "עברת", cls: "text-teal" }, borderline: { label: "על הגבול", cls: "text-amber-600" }, fail: { label: "עוד לא", cls: "text-red-600" } };
const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60).toString().padStart(2, "0")}:${(Math.max(0, s) % 60).toString().padStart(2, "0")}`;

function Paragraphs({ text }: { text: string }) {
  return <div className="space-y-3 text-ink leading-relaxed" dir="auto">{text.split(/\n{2,}/).map((p, i) => <p key={i} className="whitespace-pre-wrap">{p}</p>)}</div>;
}

/** One attempt: the statement, the clock, the editor, and after submission the agent's verdict. */
export default function AttemptPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { data, mutate } = useSWR<Data>(attemptId ? `/api/practice/attempts/${attemptId}` : null, fetcher, { revalidateOnFocus: false });
  const [answer, setAnswer] = useState<string | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [left, setLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const autoSubmitted = useRef(false);
  const skewRef = useRef(0);

  // The clock: server time minus local time keeps it honest across devices.
  useEffect(() => {
    if (!data) return;
    skewRef.current = new Date(data.serverNow).getTime() - Date.now();
    if (data.attempt.status !== "in_progress") return setLeft(null);
    const tick = () => setLeft(Math.round((new Date(data.attempt.deadlineAt).getTime() - (Date.now() + skewRef.current)) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [data]);

  useEffect(() => {
    if (data && answer === null) {
      setAnswer(data.attempt.answer || data.task?.starterCode || "");
      setRepoUrl(data.attempt.repoUrl || "");
    }
  }, [data, answer]);

  const submit = async (auto = false) => {
    if (!data || submitting) return;
    setSubmitting(true);
    setError("");
    const r = await fetch(`/api/practice/attempts/${attemptId}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answer: answer || "", repoUrl }) });
    const j = await r.json().catch(() => null);
    setSubmitting(false);
    if (!r.ok) return setError(j?.error || "ההגשה נכשלה, נסו שוב.");
    await mutate();
    if (auto) window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Coding: when the clock hits zero, hand in whatever is there (the Examiner marks it late only past the grace).
  useEffect(() => {
    if (left !== null && left <= 0 && data?.task.kind === "coding" && !autoSubmitted.current && data.attempt.status === "in_progress") {
      autoSubmitted.current = true;
      submit(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  if (!data) return <div className="jm-page" dir="rtl"><Spinner label="טוען…" /></div>;
  const { attempt, task } = data;
  if (!task) return <div className="jm-page" dir="rtl"><p className="text-ink-600">המשימה כבר לא קיימת.</p></div>;
  const open = attempt.status === "in_progress";
  const coding = task.kind === "coding";
  const urgent = left !== null && left <= 300;

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const s = el.selectionStart;
      const v = el.value;
      const next = v.slice(0, s) + "  " + v.slice(el.selectionEnd);
      setAnswer(next);
      requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
    }
  };

  return (
    <div className="jm-page" dir="rtl">
      <Link href="/practice" className="jm-btn jm-btn-ghost jm-btn-sm -ms-3.5">← כל המשימות</Link>
      <header className="mt-3 mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5 mb-2">
            <span className="jm-chip">{coding ? "שאלת קוד" : "עבודת בית"}</span>
            <span className="jm-chip jm-chip-sky">{task.role} · {task.level}</span>
            {task.tags.slice(0, 3).map((g) => <span key={g} className="jm-chip">{g}</span>)}
          </div>
          <h1 className="jm-title" dir="auto">{task.title}</h1>
        </div>
        {open ? (
          <div className={`jm-card px-4 py-3 text-center min-w-[9rem] ${urgent ? "border-red-400" : ""}`}>
            <div className="jm-muted inline-flex items-center gap-1"><Timer className="h-3.5 w-3.5" /> {coding ? "זמן שנותר" : "חלון הגשה"}</div>
            <div className={`text-2xl font-bold tabular-nums ${urgent ? "text-red-600" : "text-navy"}`}>{left === null ? "—" : coding ? mmss(left) : left > 0 ? `${Math.floor(left / 3600)}:${mmss(left % 3600)}` : "נגמר"}</div>
            {left !== null && left <= 0 && <div className="text-xs text-red-600">אפשר עדיין להגיש, יסומן באיחור</div>}
          </div>
        ) : (
          <div className="jm-card px-4 py-3 text-center min-w-[9rem]">
            <div className="jm-muted">{attempt.status === "graded" ? "הציון" : "נבדק…"}</div>
            {attempt.status === "graded" ? (
              <>
                <div className={`text-3xl font-bold ${VERDICT[attempt.verdict]?.cls || "text-navy"}`}>{attempt.score}<span className="text-base text-ink-400">/100</span></div>
                <div className={`text-sm font-medium ${VERDICT[attempt.verdict]?.cls || ""}`}>{VERDICT[attempt.verdict]?.label || ""}</div>
              </>
            ) : (
              <Spinner />
            )}
          </div>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="space-y-5">
          <div className="jm-card p-5 space-y-4">
            <Paragraphs text={task.prompt} />
            {task.examples.length > 0 && (
              <div>
                <h3 className="font-semibold text-navy mb-2">דוגמאות</h3>
                <div className="space-y-2">
                  {task.examples.map((e, i) => (
                    <div key={i} className="rounded-control bg-canvas border border-line p-3 text-sm font-mono" dir="ltr">
                      <div><span className="text-ink-400">in: </span>{e.input}</div>
                      <div><span className="text-ink-400">out: </span>{e.output}</div>
                      {e.explanation && <div className="text-ink-600 font-sans mt-1" dir="auto">{e.explanation}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {task.constraints.length > 0 && (
              <div>
                <h3 className="font-semibold text-navy mb-1">אילוצים</h3>
                <ul className="list-disc ps-5 text-sm text-ink-600 space-y-0.5">{task.constraints.map((c, i) => <li key={i} dir="auto">{c}</li>)}</ul>
              </div>
            )}
            {task.deliverables.length > 0 && (
              <div>
                <h3 className="font-semibold text-navy mb-1">מה להגיש</h3>
                <ul className="space-y-1 text-sm text-ink">{task.deliverables.map((d, i) => <li key={i} className="flex gap-2" dir="auto"><CheckCircle2 className="h-4 w-4 text-teal shrink-0 mt-0.5" />{d}</li>)}</ul>
              </div>
            )}
            <div>
              <h3 className="font-semibold text-navy mb-1">איך נבדק</h3>
              <ul className="text-sm text-ink-600 space-y-0.5">{task.rubric.map((r, i) => <li key={i} dir="auto"><span className="font-medium text-ink">{r.criterion}</span> <span className="text-ink-400">×{r.weight}</span>{r.description ? ` — ${r.description}` : ""}</li>)}</ul>
            </div>
            {!open && task.hints.length > 0 && (
              <div className="rounded-control bg-canvas border border-line p-3 text-sm">
                <div className="font-semibold text-navy inline-flex items-center gap-1 mb-1"><Lightbulb className="h-4 w-4 text-amber-500" /> רמזים</div>
                <ul className="list-disc ps-5 text-ink-600">{task.hints.map((h, i) => <li key={i} dir="auto">{h}</li>)}</ul>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-5">
          {open ? (
            <div className="jm-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-navy">{coding ? `הפתרון שלך (${task.language || "code"})` : "מה בנית ואיך החלטת"}</h3>
                {attempt.status === "in_progress" && <span className="jm-muted">נשמר מקומית עד ההגשה</span>}
              </div>
              <textarea
                value={answer ?? ""}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={coding ? onKey : undefined}
                spellCheck={false}
                dir={coding ? "ltr" : "auto"}
                className={`jm-input w-full min-h-[22rem] ${coding ? "font-mono text-sm leading-relaxed" : "leading-relaxed"}`}
                placeholder={coding ? "// כתבו כאן את הפתרון" : "תארו: מבנה הפרויקט, ההחלטות המרכזיות ולמה, מה עובד, מה לא הספקתם, ומה הייתם משפרים עם עוד זמן."}
              />
              {!coding && <input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} dir="ltr" className="jm-input w-full" placeholder="https://github.com/you/repo (אופציונלי אבל מומלץ)" />}
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex items-center justify-between gap-3">
                <p className="jm-muted">{coding ? "הבוחן בודק נכונות, סיבוכיות, קריאות ומקרי קצה." : "מנהל הגיוס בודק עמידה בדרישות, ארכיטקטורה, איכות קוד, בדיקות ו-README."}</p>
                <button onClick={() => submit()} disabled={submitting || !(answer || "").trim()} className="jm-btn jm-btn-primary">{submitting ? (coding ? "הבוחן בודק…" : "מנהל הגיוס קורא…") : "הגשה"}</button>
              </div>
            </div>
          ) : (
            <>
              {attempt.status === "graded" && (
                <div className="jm-card p-5 space-y-4">
                  {attempt.timedOut && <p className="text-sm text-amber-700 inline-flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> הוגש אחרי הזמן ({Math.round(attempt.durationSec / 60)} דקות). נבדק בכל זאת.</p>}
                  <div>
                    <h3 className="font-semibold text-navy mb-2">לפי קריטריונים</h3>
                    <div className="space-y-2">
                      {attempt.breakdown.map((b, i) => (
                        <div key={i}>
                          <div className="flex items-center justify-between text-sm"><span className="font-medium text-ink" dir="auto">{b.criterion} <span className="text-ink-400">×{b.weight}</span></span><span className="tabular-nums">{b.score}</span></div>
                          <div className="h-1.5 rounded-full bg-line overflow-hidden"><div className={`h-full ${b.score >= 70 ? "bg-teal" : b.score >= 45 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${b.score}%` }} /></div>
                          {b.comment && <p className="jm-muted mt-0.5" dir="auto">{b.comment}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-navy mb-1">המשוב של {attempt.gradedBy === "examiner" ? "הבוחן" : "מנהל הגיוס"}</h3>
                    <Paragraphs text={attempt.feedback} />
                  </div>
                  {attempt.strengths.length > 0 && <div><h4 className="font-medium text-teal mb-1">מה היה טוב</h4><ul className="list-disc ps-5 text-sm text-ink space-y-0.5">{attempt.strengths.map((s, i) => <li key={i} dir="auto">{s}</li>)}</ul></div>}
                  {attempt.improvements.length > 0 && <div><h4 className="font-medium text-amber-700 mb-1">מה לשפר</h4><ul className="list-disc ps-5 text-sm text-ink space-y-0.5">{attempt.improvements.map((s, i) => <li key={i} dir="auto">{s}</li>)}</ul></div>}
                  {attempt.model === "heuristic" && <p className="jm-muted">הערכה בסיסית ללא מודל (אין מפתח OpenAI בסביבה).</p>}
                  <div className="flex gap-2 pt-1">
                    <Link href="/practice" className="jm-btn jm-btn-primary">משימה הבאה</Link>
                  </div>
                </div>
              )}
              <div className="jm-card p-5">
                <h3 className="font-semibold text-navy mb-2">{coding ? "מה הגשת" : "ההגשה שלך"}</h3>
                {attempt.repoUrl && <a href={attempt.repoUrl} target="_blank" rel="noopener noreferrer" dir="ltr" className="text-sky hover:underline text-sm block mb-2">{attempt.repoUrl}</a>}
                <pre className={`rounded-control bg-canvas border border-line p-3 text-sm overflow-x-auto whitespace-pre-wrap ${coding ? "font-mono" : ""}`} dir={coding ? "ltr" : "auto"}>{attempt.answer || "(ריק)"}</pre>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
