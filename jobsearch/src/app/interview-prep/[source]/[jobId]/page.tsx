"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useCurrentUser } from "../../../lib/hooks/useCurrentUser";
import { EmptyState, Spinner } from "../../../components/ui";
import VoiceInterview, { type VoiceTurn } from "../../../components/VoiceInterview";

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
type Turn = { role: "interviewer" | "candidate"; content: string };
type Delivery = { answers: number; totalSpeakingSeconds: number; avgAnswerSeconds: number; wordsPerMinute: number | null; fillerWords: number; fillersPerMinute: number | null; shortAnswers: number; tone: { pitchVarSemitones: number | null; expressiveness: string | null; loudnessDb: number | null; volume: string | null; pauseRatio: number | null; trailingOffAnswers: number; measuredAnswers: number }; impression?: { confidence: number; energy: number; clarity: number; warmth: number; pace: string; notes: string } };
type Feedback = {
  overallScore: number;
  delivery?: { score: number; notes: string };
  verdict: string;
  summary: string;
  dimensions: { name: string; score: number; notes: string }[];
  strengths: string[];
  improvements: string[];
  answerReviews: { question: string; answerSummary: string; score: number; whatWorked: string; betterAnswer: string }[];
  nextSteps: string[];
};
type Session = { sessionId: string; stage: string; status: string; mode?: "chat" | "voice"; delivery?: Delivery | null; wrappedUp: boolean; targetQuestions: number; asked: number; transcript: Turn[]; feedback: Feedback | null; startedAt: string; finishedAt: string | null };
type SessionRow = { sessionId: string; stage: string; status: string; asked: number; targetQuestions: number; overallScore: number | null; verdict: string; startedAt: string };

const STAGE_ICON: Record<string, string> = { hr: "☎️", technical: "💻", home_assignment: "🏠", system_design: "🧩", behavioral: "🤝", final: "🏁" };
const bulletList = "list-disc ps-5 space-y-1.5 text-ink-600 leading-relaxed";
const scoreColor = (s: number, max = 100) => ((s / max) >= 0.7 ? "bg-teal" : (s / max) >= 0.5 ? "bg-sky" : "bg-red-500");

export default function InterviewPrepPage() {
  const { source, jobId } = useParams() as { source: string; jobId: string };
  const { user, loading: userLoading } = useCurrentUser();
  const [prep, setPrep] = useState<Prep | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const [stageKey, setStageKey] = useState<string>("");
  const [tab, setTab] = useState<"plan" | "interview">("plan");

  // Mock interview
  const [session, setSession] = useState<Session | null>(null);
  const [history, setHistory] = useState<SessionRow[]>([]);
  const [questions, setQuestions] = useState(6);
  const [mode, setMode] = useState<"voice" | "chat">("voice");
  const [voice, setVoice] = useState<{ sessionId: string; clientSecret: string; model: string; endpoint: "calls" | "legacy"; targetQuestions: number; interviewer?: { name: string; gender: "female" | "male" } } | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState<"" | "start" | "turn" | "finish">("");
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
    fetch(`/api/interview/prep?jobId=${jobId}&source=${source}`).then(async (r) => {
      if (r.ok) {
        const data = await r.json();
        setPrep(data);
        setStageKey(data.plan.stages[0]?.key || "");
        setState("ready");
      } else generate();
    });
  }, [user, jobId, source, state]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadHistory = async (prepId: string) => {
    const r = await fetch(`/api/interview/session?prepId=${prepId}`, { cache: "no-store" });
    if (r.ok) setHistory((await r.json()).sessions);
  };
  useEffect(() => {
    if (prep?.prepId) loadHistory(prep.prepId);
  }, [prep?.prepId]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [session?.transcript.length, busy]);

  const stage = prep?.plan.stages.find((s) => s.key === stageKey) || prep?.plan.stages[0];

  const call = async (url: string, method: string, body: object) => {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.error || "משהו השתבש");
    return d;
  };

  const start = async () => {
    if (!prep) return;
    setBusy("start");
    setError("");
    try {
      if (mode === "voice") {
        const d = await call("/api/interview/voice", "POST", { prepId: prep.prepId, stage: stageKey, language: "he", questions });
        setVoice({ sessionId: d.sessionId, clientSecret: d.clientSecret, model: d.model, endpoint: d.endpoint, targetQuestions: d.targetQuestions, interviewer: d.interviewer });
        setSession({ sessionId: d.sessionId, stage: stageKey, status: "active", mode: "voice", wrappedUp: false, targetQuestions: d.targetQuestions, asked: 0, transcript: [], feedback: null, startedAt: new Date().toISOString(), finishedAt: null });
      } else {
        const d = await call("/api/interview/session", "POST", { prepId: prep.prepId, stage: stageKey, language: "he", questions });
        setSession(d.session);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  // Voice call ended (by the interviewer, the candidate, or an error): save the transcript and go straight to the debrief.
  const onVoiceEnded = async (turns: VoiceTurn[], reason: "interviewer" | "candidate" | "error") => {
    if (!voice) return;
    const answered = turns.filter((t) => t.role === "candidate").length;
    setVoice(null);
    setSession((s) => s && { ...s, transcript: turns.map((t) => ({ role: t.role, content: t.content })), asked: turns.filter((t) => t.role === "interviewer").length, wrappedUp: true });
    if (answered === 0) {
      setError(reason === "error" ? "השיחה לא התחברה." : "השיחה הסתיימה לפני שענית על שאלה — אין על מה לתת משוב.");
      setSession(null);
      return;
    }
    setBusy("finish");
    try {
      const d = await call("/api/interview/session/finish", "POST", { sessionId: voice.sessionId });
      setSession((s) => s && { ...s, status: "finished", feedback: d.feedback, delivery: d.delivery });
      if (prep) loadHistory(prep.prepId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const send = async () => {
    if (!session || !answer.trim()) return;
    const text = answer.trim();
    setAnswer("");
    setBusy("turn");
    setSession((s) => s && { ...s, transcript: [...s.transcript, { role: "candidate", content: text }] });
    try {
      const d = await call("/api/interview/session", "PATCH", { sessionId: session.sessionId, answer: text });
      setSession(d.session);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const finish = async () => {
    if (!session) return;
    setBusy("finish");
    try {
      const d = await call("/api/interview/session/finish", "POST", { sessionId: session.sessionId });
      setSession((s) => s && { ...s, status: "finished", feedback: d.feedback });
      if (prep) loadHistory(prep.prepId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const openSession = async (id: string) => {
    const r = await fetch(`/api/interview/session?sessionId=${id}`, { cache: "no-store" });
    if (r.ok) {
      setSession((await r.json()).session);
      setTab("interview");
    }
  };

  if (userLoading) return <div className="jm-page" dir="rtl"><Spinner label="טוען…" /></div>;
  if (!user) {
    return (
      <div className="jm-page" dir="rtl">
        <EmptyState icon="🔒" title="צריך להתחבר" text="ההכנה לראיון נבנית מקורות החיים שלך." action={<Link href="/Login" className="jm-btn jm-btn-primary">התחברות</Link>} />
      </div>
    );
  }

  return (
    <div className="jm-page" dir="rtl">
      {state === "loading" && <Spinner label="הסוכן אוסף מידע על החברה ובונה את התוכנית…" />}
      {state === "error" && (
        <div className="jm-alert jm-alert-err flex flex-wrap items-center justify-between gap-2">
          <span>{error}</span>
          <button onClick={() => generate(true)} className="jm-btn jm-btn-secondary jm-btn-sm">נסה שוב</button>
        </div>
      )}

      {state === "ready" && prep && stage && (
        <div className="space-y-5">
          <section className="jm-card p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wider text-teal mb-1">הכנה לראיון</div>
                <h1 className="jm-title">{prep.job.title}</h1>
                <p className="jm-subtitle">{prep.job.company}{prep.plan.company.whatTheyDo ? ` · ${prep.plan.company.whatTheyDo}` : ""}</p>
              </div>
              <div className="flex gap-2">
                <Link href={`/job/${source}/${jobId}`} className="jm-btn jm-btn-ghost jm-btn-sm">← למשרה</Link>
                <button onClick={() => generate(true)} className="jm-btn jm-btn-secondary jm-btn-sm">צור תוכנית מחדש</button>
              </div>
            </div>
            {prep.plan.company.summary && <p className="mt-4 text-ink-600 leading-relaxed" dir="auto">{prep.plan.company.summary}</p>}
            {prep.plan.company.techStack.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">{prep.plan.company.techStack.map((t) => <span key={t} className="jm-chip">{t}</span>)}</div>
            )}
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-2 overflow-x-auto jm-scroll pb-1 flex-1 min-w-0">
              {prep.plan.stages.map((s) => (
                <button key={s.key} onClick={() => { setStageKey(s.key); if (session && !session.feedback) setSession(null); }} aria-pressed={stageKey === s.key} className={`shrink-0 cursor-pointer transition-colors ${stageKey === s.key ? "jm-chip jm-chip-navy" : "jm-chip hover:border-navy/40"}`}>
                  {STAGE_ICON[s.key] ?? "•"} {s.title}
                </button>
              ))}
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => setTab("plan")} aria-pressed={tab === "plan"} className={`jm-btn jm-btn-sm ${tab === "plan" ? "jm-btn-accent" : "jm-btn-secondary"}`}>תוכנית</button>
              <button onClick={() => setTab("interview")} aria-pressed={tab === "interview"} className={`jm-btn jm-btn-sm ${tab === "interview" ? "jm-btn-accent" : "jm-btn-secondary"}`}>🎙️ ראיון מדומה</button>
            </div>
          </div>

          {tab === "plan" ? (
            <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
              <section className="jm-card p-5 sm:p-6 space-y-5">
                <div>
                  <h2 className="jm-h2">{stage.title}</h2>
                  <p className="text-sm text-ink-600 mt-1" dir="auto">{stage.description}{stage.durationHint ? ` · ${stage.durationHint}` : ""}</p>
                </div>
                <ol className="space-y-3">
                  {stage.likelyQuestions.map((q, i) => (
                    <li key={i} className="rounded-control border border-line p-4">
                      <div className="font-semibold text-navy" dir="auto">{i + 1}. {q.question}</div>
                      {q.whyAsked && <p className="text-xs text-ink-400 mt-1" dir="auto">למה שואלים: {q.whyAsked}</p>}
                      {q.howToAnswer && <p className="text-sm text-ink-600 mt-2 leading-relaxed" dir="auto">{q.howToAnswer}</p>}
                      {q.sampleAnswer && (
                        <details className="mt-2">
                          <summary className="text-sm text-teal cursor-pointer">תשובה לדוגמה</summary>
                          <p className="text-sm text-ink-600 mt-1 leading-relaxed" dir="auto">{q.sampleAnswer}</p>
                        </details>
                      )}
                    </li>
                  ))}
                </ol>
                {stage.tips.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-navy mb-2">טיפים לשלב</h3>
                    <ul className={bulletList}>{stage.tips.map((t, i) => <li key={i} dir="auto">{t}</li>)}</ul>
                  </div>
                )}
              </section>
              <aside className="space-y-4">
                {prep.plan.gaps.length > 0 && (
                  <section className="jm-card p-5">
                    <h3 className="jm-h2 mb-2">פערים לסגור</h3>
                    <ul className="space-y-2">
                      {prep.plan.gaps.map((g, i) => (
                        <li key={i} className="text-sm" dir="auto">
                          <span className="font-medium text-navy">{g.topic}</span>
                          {g.whyItMatters && <span className="text-ink-600"> — {g.whyItMatters}</span>}
                          {g.studyPlan && <p className="text-xs text-ink-400 mt-0.5">{g.studyPlan}</p>}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {prep.plan.questionsToAsk.length > 0 && (
                  <section className="jm-card p-5">
                    <h3 className="jm-h2 mb-2">שאלות שכדאי לשאול</h3>
                    <ul className={bulletList + " text-sm"}>{prep.plan.questionsToAsk.map((q, i) => <li key={i} dir="auto">{q}</li>)}</ul>
                  </section>
                )}
                {prep.plan.checklist.length > 0 && (
                  <section className="jm-card p-5">
                    <h3 className="jm-h2 mb-2">צ׳קליסט</h3>
                    <ul className="space-y-1.5 text-sm">{prep.plan.checklist.map((c, i) => <li key={i} className="flex items-start gap-2" dir="auto"><input type="checkbox" className="mt-1 accent-teal" />{c}</li>)}</ul>
                  </section>
                )}
              </aside>
            </div>
          ) : (
            <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
              <section className="jm-card overflow-hidden flex flex-col">
                {!session ? (
                  <div className="p-6 space-y-4">
                    <h2 className="jm-h2">ראיון {stage.title} ב-{prep.job.company}</h2>
                    <p className="text-sm text-ink-600 leading-relaxed">
                      המראיין/ת מכיר/ה את החברה, את התפקיד ואת קורות החיים שלך, ומנהל/ת שיחה כמו בראיון אמיתי: שאלה אחת בכל פעם, שאלות המשך, ובלי רמזים.
                      <span className="font-medium text-navy"> המשוב המלא — ציון, חוזקות, מה לשפר ותשובות טובות יותר — מגיע רק בסיום.</span>
                    </p>
                    <div className="grid sm:grid-cols-2 gap-2">
                      <button type="button" onClick={() => setMode("voice")} aria-pressed={mode === "voice"} className={`rounded-control border p-3 text-start transition-colors ${mode === "voice" ? "border-navy bg-navy text-white" : "border-line hover:border-navy/40"}`}>
                        <div className="font-semibold">🎙️ שיחה קולית (מומלץ)</div>
                        <div className={`text-xs mt-1 ${mode === "voice" ? "text-white/80" : "text-ink-600"}`}>מראיין/ת (גבר או אישה) שמציג/ה את עצמו/ה והחברה, שואל/ת באיזו שפה לנהל את הראיון, ומגיב/ה לשתיקות. המשוב כולל ניתוח קול וטון ומוכן מיד בסיום.</div>
                      </button>
                      <button type="button" onClick={() => setMode("chat")} aria-pressed={mode === "chat"} className={`rounded-control border p-3 text-start transition-colors ${mode === "chat" ? "border-navy bg-navy text-white" : "border-line hover:border-navy/40"}`}>
                        <div className="font-semibold">⌨️ בכתב</div>
                        <div className={`text-xs mt-1 ${mode === "chat" ? "text-white/80" : "text-ink-600"}`}>אותו מראיין/ת, בצ&apos;אט. מתאים כשאין מיקרופון או כשרוצים לחשוב על כל תשובה.</div>
                      </button>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <label>
                        <span className="jm-label">מספר שאלות</span>
                        <select value={questions} onChange={(e) => setQuestions(Number(e.target.value))} className="jm-input jm-select w-32">
                          {[4, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </label>
                      <button onClick={start} disabled={busy === "start"} className="jm-btn jm-btn-primary">{busy === "start" ? "המראיין/ת מתכונן/ת…" : mode === "voice" ? "🎙️ התחל שיחה" : "⌨️ התחל ראיון"}</button>
                    </div>
                    {error && <div className="jm-alert jm-alert-err">{error}</div>}
                  </div>
                ) : voice ? (
                  <VoiceInterview sessionId={voice.sessionId} clientSecret={voice.clientSecret} model={voice.model} endpoint={voice.endpoint} targetQuestions={voice.targetQuestions} stageTitle={stage.title} company={prep.job.company} interviewer={voice.interviewer} onEnded={onVoiceEnded} />
                ) : session.feedback ? (
                  <FeedbackView fb={session.feedback} delivery={session.delivery || null} onNew={() => setSession(null)} stageTitle={stage.title} />
                ) : session.mode === "voice" ? (
                  <div className="p-6"><Spinner label="המראיין/ת כותב/ת את המשוב על הראיון…" />{error && <div className="jm-alert jm-alert-err">{error}</div>}</div>
                ) : (
                  <>
                    <div className="p-3 border-b border-line flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium text-navy">{STAGE_ICON[session.stage]} ראיון {stage.title}</span>
                      <span className="jm-chip">שאלה {Math.min(session.asked, session.targetQuestions)} מתוך {session.targetQuestions}</span>
                      <button onClick={finish} disabled={busy !== "" || session.transcript.filter((t) => t.role === "candidate").length === 0} className="jm-btn jm-btn-secondary jm-btn-sm ms-auto">
                        {busy === "finish" ? "כותב משוב…" : session.wrappedUp ? "קבל משוב" : "סיים ראיון וקבל משוב"}
                      </button>
                    </div>
                    <div className="jm-scroll flex-1 overflow-y-auto p-4 space-y-3 min-h-[260px] max-h-[60vh]">
                      {session.transcript.map((t, i) => (
                        <div key={i} className={`flex ${t.role === "candidate" ? "justify-end" : "justify-start"}`}>
                          <div dir="auto" className={`max-w-[85%] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line ${t.role === "candidate" ? "bg-navy text-white rounded-2xl rounded-ee-sm" : "bg-canvas border border-line rounded-2xl rounded-es-sm"}`}>
                            {t.content}
                          </div>
                        </div>
                      ))}
                      {busy === "turn" && <div className="jm-muted flex items-center gap-2"><span className="h-4 w-4 rounded-full border-2 border-teal border-t-transparent animate-spin" /> המראיין/ת חושב/ת…</div>}
                      {session.wrappedUp && !session.feedback && (
                        <div className="jm-alert jm-alert-info">הראיון הסתיים. לחץ/י על “קבל משוב” כדי לראות את הניתוח המלא.</div>
                      )}
                      <div ref={bottomRef} />
                    </div>
                    {!session.wrappedUp && (
                      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="p-3 border-t border-line flex flex-col sm:flex-row gap-2">
                        <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }} rows={2} placeholder="ענה/י כמו בראיון אמיתי… (Ctrl+Enter לשליחה)" className="jm-input flex-1" dir="auto" disabled={busy !== ""} />
                        <button type="submit" disabled={busy !== "" || !answer.trim()} className="jm-btn jm-btn-primary">שלח</button>
                      </form>
                    )}
                    {error && <div className="m-3 jm-alert jm-alert-err">{error}</div>}
                  </>
                )}
              </section>

              <aside className="jm-card p-4 space-y-2">
                <h3 className="jm-h2 text-base">ראיונות קודמים</h3>
                {history.length === 0 && <p className="jm-muted">עדיין לא תרגלת. הציונים יישמרו כאן.</p>}
                {history.map((h) => (
                  <button key={h.sessionId} onClick={() => openSession(h.sessionId)} className="w-full text-start rounded-xl border border-line px-3 py-2 hover:bg-canvas">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium text-navy">{STAGE_ICON[h.stage]} {prep.plan.stages.find((s) => s.key === h.stage)?.title || h.stage}</span>
                      {h.overallScore !== null ? <span className={`jm-chip ${h.overallScore >= 70 ? "jm-chip-teal" : "jm-chip-sky"}`}>{h.overallScore}</span> : <span className="jm-chip">{h.status === "active" ? "פתוח" : "ללא משוב"}</span>}
                    </div>
                    <div className="jm-muted text-xs" dir="ltr">{new Date(h.startedAt).toLocaleString("he-IL")} · {h.asked}/{h.targetQuestions}</div>
                  </button>
                ))}
              </aside>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FeedbackView({ fb, delivery, onNew, stageTitle }: { fb: Feedback; delivery?: Delivery | null; onNew: () => void; stageTitle: string }) {
  const tone = delivery?.tone;
  const imp = delivery?.impression;
  const stars = (n: number) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));
  return (
    <div className="p-5 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className={`h-20 w-20 rounded-full flex items-center justify-center text-2xl font-bold text-white ${scoreColor(fb.overallScore)}`}>{fb.overallScore}</div>
        <div className="min-w-0 flex-1">
          <h2 className="jm-h2">משוב על ראיון ה{stageTitle}</h2>
          {fb.verdict && <div className="text-sm font-medium text-navy mt-0.5" dir="auto">{fb.verdict}</div>}
          <p className="text-sm text-ink-600 mt-1 leading-relaxed" dir="auto">{fb.summary}</p>
        </div>
        <button onClick={onNew} className="jm-btn jm-btn-secondary jm-btn-sm">ראיון חדש</button>
      </div>

      {(fb.delivery || (tone && tone.measuredAnswers > 0) || imp) && (
        <div className="rounded-control border border-line p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-navy">🎙️ קול וטון</h3>
            {fb.delivery && <span className={`jm-chip ${fb.delivery.score >= 7 ? "jm-chip-teal" : fb.delivery.score >= 5 ? "jm-chip-sky" : "bg-red-50 text-red-700 border-red-200"}`}>{fb.delivery.score}/10</span>}
          </div>
          {fb.delivery?.notes && <p className="text-sm text-ink-600 leading-relaxed whitespace-pre-line" dir="auto">{fb.delivery.notes}</p>}
          {delivery && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              {delivery.wordsPerMinute !== null && <span className="jm-chip">קצב {delivery.wordsPerMinute} מילים/דק׳</span>}
              <span className="jm-chip">ממוצע תשובה {delivery.avgAnswerSeconds}s</span>
              <span className="jm-chip">{delivery.fillerWords} מילות מילוי{delivery.fillersPerMinute !== null ? ` (${delivery.fillersPerMinute}/דק׳)` : ""}</span>
              {tone?.expressiveness && <span className={`jm-chip ${tone.expressiveness === "monotone" || tone.expressiveness === "flat" ? "jm-chip-sky" : "jm-chip-teal"}`}>אינטונציה: {{ monotone: "מונוטונית", flat: "שטוחה", natural: "טבעית", expressive: "אקספרסיבית" }[tone.expressiveness] ?? tone.expressiveness}</span>}
              {tone?.volume && <span className="jm-chip">עוצמה: {{ quiet: "שקטה", normal: "רגילה", loud: "חזקה" }[tone.volume] ?? tone.volume}</span>}
              {tone && tone.pauseRatio !== null && <span className="jm-chip">הפסקות {Math.round(tone.pauseRatio * 100)}%</span>}
              {!!tone?.trailingOffAnswers && <span className="jm-chip jm-chip-sky">{tone.trailingOffAnswers} תשובות &quot;נמוגות&quot; בסוף</span>}
            </div>
          )}
          {imp && (
            <div className="grid sm:grid-cols-2 gap-2 text-sm">
              <div><span className="jm-muted">ביטחון </span><span className="text-teal">{stars(imp.confidence)}</span></div>
              <div><span className="jm-muted">אנרגיה </span><span className="text-teal">{stars(imp.energy)}</span></div>
              <div><span className="jm-muted">בהירות </span><span className="text-teal">{stars(imp.clarity)}</span></div>
              <div><span className="jm-muted">חום </span><span className="text-teal">{stars(imp.warmth)}</span></div>
              <div className="sm:col-span-2 text-ink-600" dir="auto"><span className="jm-muted">מה המראיין/ת שמע/ה: </span>{imp.notes}{imp.pace && imp.pace !== "good" ? ` · קצב: ${imp.pace}` : ""}</div>
            </div>
          )}
        </div>
      )}

      {fb.dimensions.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {fb.dimensions.map((d, i) => (
            <div key={i} className="rounded-control border border-line p-3">
              <div className="flex items-center justify-between text-sm"><span className="font-medium text-navy" dir="auto">{d.name}</span><span className="jm-muted">{d.score}/10</span></div>
              <div className="h-2 rounded-full bg-line mt-2 overflow-hidden"><div className={`h-full ${scoreColor(d.score, 10)}`} style={{ width: `${d.score * 10}%` }} /></div>
              {d.notes && <p className="text-xs text-ink-600 mt-2 leading-relaxed" dir="auto">{d.notes}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-control bg-teal-50 border border-teal/20 p-4">
          <h3 className="font-semibold text-teal-600 mb-2">מה עבד</h3>
          <ul className={bulletList + " text-sm"}>{fb.strengths.map((s, i) => <li key={i} dir="auto">{s}</li>)}</ul>
        </div>
        <div className="rounded-control bg-sky-50 border border-sky/20 p-4">
          <h3 className="font-semibold text-sky-600 mb-2">מה לשפר</h3>
          <ul className={bulletList + " text-sm"}>{fb.improvements.map((s, i) => <li key={i} dir="auto">{s}</li>)}</ul>
        </div>
      </div>

      {fb.answerReviews.length > 0 && (
        <div>
          <h3 className="jm-h2 mb-3">שאלה-שאלה</h3>
          <ol className="space-y-3">
            {fb.answerReviews.map((r, i) => (
              <li key={i} className="rounded-control border border-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-semibold text-navy" dir="auto">{i + 1}. {r.question}</div>
                  <span className={`jm-chip shrink-0 ${r.score >= 7 ? "jm-chip-teal" : r.score >= 5 ? "jm-chip-sky" : "bg-red-50 text-red-700 border-red-200"}`}>{r.score}/10</span>
                </div>
                {r.answerSummary && <p className="text-xs text-ink-400 mt-1" dir="auto">ענית: {r.answerSummary}</p>}
                {r.whatWorked && <p className="text-sm text-ink-600 mt-2" dir="auto">{r.whatWorked}</p>}
                {r.betterAnswer && (
                  <details className="mt-2">
                    <summary className="text-sm text-teal cursor-pointer">תשובה חזקה יותר (בקול שלך)</summary>
                    <p className="text-sm text-ink-600 mt-1 leading-relaxed whitespace-pre-line" dir="auto">{r.betterAnswer}</p>
                  </details>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {fb.nextSteps.length > 0 && (
        <div>
          <h3 className="jm-h2 mb-2">מה לעשות לפני הראיון האמיתי</h3>
          <ul className={bulletList + " text-sm"}>{fb.nextSteps.map((s, i) => <li key={i} dir="auto">{s}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
