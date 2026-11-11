"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useCurrentUser } from "../../../lib/hooks/useCurrentUser";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { EmptyState, Spinner } from "../../../components/ui";
import VoiceInterview, { type VoiceTurn } from "../../../components/VoiceInterview";
import ProgressCard from "../../../components/ProgressCard";
import ReportedQuestionsCard from "../../../components/ReportedQuestionsCard";

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
type PresenceSummary = { measuredAnswers: number; faceVisible: number | null; eyeContact: number | null; smile: number | null; furrow: number | null; headMovementDeg: number | null; framing: "centred" | "turned away" | "looking down" | "looking up" | null };
type Delivery = { answers: number; totalSpeakingSeconds: number; avgAnswerSeconds: number; wordsPerMinute: number | null; fillerWords: number; fillersPerMinute: number | null; shortAnswers: number; tone: { pitchVarSemitones: number | null; expressiveness: string | null; loudnessDb: number | null; volume: string | null; pauseRatio: number | null; trailingOffAnswers: number; measuredAnswers: number }; impression?: { confidence: number; energy: number; clarity: number; warmth: number; pace: string; notes: string }; presence?: PresenceSummary | null };
type Feedback = {
  overallScore: number;
  delivery?: { score: number; notes: string };
  presence?: { score: number; notes: string };
  progress?: { note: string; improved: string[]; stillOpen: string[] };
  verdict: string;
  summary: string;
  dimensions: { name: string; score: number; notes: string }[];
  strengths: string[];
  improvements: string[];
  answerReviews: { question: string; answerSummary: string; score: number; whatWorked: string; betterAnswer: string }[];
  nextSteps: string[];
  peerComparison?: { company: string; stage: string; sameStage: { n: number; median: number | null; percentile: number | null }; anyStage: { n: number; median: number | null; percentile: number | null }; ownPrevious: number } | null;
  calibration?: { scope: "company" | "global"; company: string; samples: number; medianReachedInterview: number | null; medianRejected: number | null } | null;
  codeTask?: { title: string; score: number | null; verdict: string } | null;
};
type CodeTask = { attemptId: string; title: string; timeLimitMin: number; status: "open" | "done"; score: number | null };
type RealQ = { count: number; stageCount: number; harvest: string };
type Session = { sessionId: string; stage: string; status: string; mode?: "chat" | "voice"; delivery?: Delivery | null; wrappedUp: boolean; targetQuestions: number; asked: number; transcript: Turn[]; feedback: Feedback | null; startedAt: string; finishedAt: string | null; persona?: string; codeTask?: CodeTask | null; realQuestions?: RealQ | null };
type SessionRow = { sessionId: string; stage: string; status: string; asked: number; targetQuestions: number; overallScore: number | null; verdict: string; startedAt: string };

const STAGE_ICON: Record<string, string> = { hr: "☎️", technical: "💻", home_assignment: "🏠", system_design: "🧩", behavioral: "🤝", final: "🏁" };
const bulletList = "list-disc ps-5 space-y-1.5 text-ink-600 leading-relaxed";
const scoreColor = (s: number, max = 100) => ((s / max) >= 0.7 ? "bg-teal" : (s / max) >= 0.5 ? "bg-sky" : "bg-red-500");

export default function InterviewPrepPage() {
  const { source, jobId } = useParams() as { source: string; jobId: string };
  const { t, lang, dir } = useT();
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
  const [mode, setMode] = useState<"voice" | "chat" | "phone">("voice");
  const [phone, setPhone] = useState("");
  const [phoneCfg, setPhoneCfg] = useState<{ configured: boolean } | null>(null);
  const [calling, setCalling] = useState<{ sessionId: string; to: string; interviewer?: { name: string; gender: "female" | "male" } } | null>(null);
  useEffect(() => {
    fetch("/api/interview/phone/status").then(async (r) => r.ok && setPhoneCfg(await r.json())).catch(() => setPhoneCfg({ configured: false }));
  }, []);
  const [voice, setVoice] = useState<{ sessionId: string; clientSecret: string; model: string; endpoint: "calls" | "legacy"; targetQuestions: number; interviewer?: { name: string; gender: "female" | "male" }; longAnswerSec?: number; timeLimitSec?: number } | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState<"" | "start" | "turn" | "finish">("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const generate = async (force = false) => {
    setState("loading");
    setError("");
    try {
      const res = await fetch("/api/interview/prep", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, source, force, language: "he" }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || data?.error || (res.status === 429 ? t("interview.quota") : t("interview.prepFailed")));
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

  // While the phone rings/runs, poll the session until it is finished (feedback
  // written by the bridge + finish job). A timeout re-armed after each response
  // (never overlapping requests); `prep` is read through a ref so the closure
  // never goes stale; everything stops on unmount or when the call ends.
  const prepRef = useRef<Prep | null>(null);
  useEffect(() => {
    prepRef.current = prep;
  }, [prep]);
  useEffect(() => {
    if (!calling) return;
    const sessionId = calling.sessionId;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stopped) return;
      let done = false;
      try {
        const r = await fetch(`/api/interview/session?sessionId=${sessionId}`, { cache: "no-store" });
        if (stopped) return;
        if (r.ok) {
          const d = await r.json();
          if (stopped) return;
          setSession(d.session);
          if (d.session.wrappedUp && !d.session.feedback) {
            const f = await fetch("/api/interview/session/finish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) });
            if (stopped) return;
            if (f.ok) { const fd = await f.json(); setSession((s) => s && { ...s, status: "finished", feedback: fd.feedback, delivery: fd.delivery }); }
          }
          if (d.session.status === "finished" || d.session.feedback) {
            done = true;
            setCalling(null);
            const p = prepRef.current;
            if (p) loadHistory(p.prepId);
          }
        }
      } catch {
        // transient network error: just try again on the next tick
      }
      if (!stopped && !done) timer = setTimeout(tick, 4000);
    };
    timer = setTimeout(tick, 4000);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calling]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [session?.transcript.length, busy]);

  const stage = prep?.plan.stages.find((s) => s.key === stageKey) || prep?.plan.stages[0];

  const call = async (url: string, method: string, body: object) => {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.message || d?.error || (r.status === 429 ? t("interview.quota") : t("common.somethingWrong")));
    return d;
  };

  const start = async () => {
    if (!prep) return;
    setBusy("start");
    setError("");
    try {
      if (mode === "phone") {
        const d = await call("/api/interview/phone", "POST", { prepId: prep.prepId, stage: stageKey, questions, phone });
        setCalling({ sessionId: d.sessionId, to: d.to, interviewer: d.interviewer });
        setSession({ sessionId: d.sessionId, stage: stageKey, status: "active", mode: "voice", wrappedUp: false, targetQuestions: questions, asked: 0, transcript: [], feedback: null, startedAt: new Date().toISOString(), finishedAt: null });
      } else if (mode === "voice") {
        const d = await call("/api/interview/voice", "POST", { prepId: prep.prepId, stage: stageKey, language: "he", questions });
        setVoice({ sessionId: d.sessionId, clientSecret: d.clientSecret, model: d.model, endpoint: d.endpoint, targetQuestions: d.targetQuestions, interviewer: d.interviewer, longAnswerSec: d.longAnswerSec, timeLimitSec: d.timeLimitSec });
        setSession({ sessionId: d.sessionId, stage: stageKey, status: "active", mode: "voice", wrappedUp: false, targetQuestions: d.targetQuestions, asked: 0, transcript: [], feedback: null, startedAt: new Date().toISOString(), finishedAt: null, realQuestions: d.realQuestions || null });
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
      setError(reason === "error" ? t("interview.callNotConnected") : t("interview.callEndedEarly"));
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
  // The coding exercise lives on /practice: poll its attempt until it is handed in, then feed the solution back into the interview.
  const codeContinue = async () => {
    if (!session?.codeTask || session.codeTask.status !== "open") return;
    setBusy("turn");
    setError("");
    try {
      const d = await call("/api/interview/session", "PATCH", { sessionId: session.sessionId, codeSubmitted: true });
      setSession(d.session);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const openCode = session?.codeTask?.status === "open" ? session.codeTask.attemptId : "";
  useEffect(() => {
    if (!openCode) return;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const r = await fetch(`/api/practice/attempts/${openCode}`, { cache: "no-store" });
        const d = r.ok ? await r.json() : null;
        // Hand-in and grading happen in one request on /practice; wait for the grade so the interviewer sees a score, not "pending".
        if (d?.attempt?.status === "graded" || d?.attempt?.status === "failed") {
          stopped = true;
          codeContinue();
          return;
        }
      } catch {}
      if (!stopped) timer = setTimeout(tick, 6000);
    };
    let timer = setTimeout(tick, 6000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCode]);

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

  if (userLoading) return <div className="jm-page" dir={dir}><Spinner label={t("common.loading")} /></div>;
  if (!user) {
    return (
      <div className="jm-page" dir={dir}>
        <EmptyState icon="🔒" title={t("interview.needSignIn")} text={t("interview.needSignInText")} action={<Link href={`/Login?next=${encodeURIComponent(`/interview-prep/${source}/${jobId}`)}`} className="jm-btn jm-btn-primary">{t("common.signIn")}</Link>} />
      </div>
    );
  }

  return (
    <div className="jm-page" dir={dir}>
      {state === "loading" && <Spinner label={t("interview.building")} />}
      {state === "error" && (
        <div className="jm-alert jm-alert-err flex flex-wrap items-center justify-between gap-2">
          <span>{error}</span>
          <button onClick={() => generate(true)} className="jm-btn jm-btn-secondary jm-btn-sm">{t("interview.retry")}</button>
        </div>
      )}

      {state === "ready" && prep && stage && (
        <div className="space-y-5">
          <section className="jm-card p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wider text-teal mb-1">{t("job.prep")}</div>
                <h1 className="jm-title">{prep.job.title}</h1>
                <p className="jm-subtitle">{prep.job.company}{prep.plan.company.whatTheyDo ? ` · ${prep.plan.company.whatTheyDo}` : ""}</p>
              </div>
              <div className="flex gap-2">
                <Link href={`/job/${source}/${jobId}`} className="jm-btn jm-btn-ghost jm-btn-sm">{t("interview.backToJob")}</Link>
                <button onClick={() => generate(true)} className="jm-btn jm-btn-secondary jm-btn-sm">{t("interview.regenerate")}</button>
              </div>
            </div>
            {prep.plan.company.summary && <p className="mt-4 text-ink-600 leading-relaxed" dir={dir}>{prep.plan.company.summary}</p>}
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
              <button onClick={() => setTab("plan")} aria-pressed={tab === "plan"} className={`jm-btn jm-btn-sm ${tab === "plan" ? "jm-btn-accent" : "jm-btn-secondary"}`}>{t("interview.tabPlan")}</button>
              <button onClick={() => setTab("interview")} aria-pressed={tab === "interview"} className={`jm-btn jm-btn-sm ${tab === "interview" ? "jm-btn-accent" : "jm-btn-secondary"}`}>{t("interview.tabMock")}</button>
            </div>
          </div>

          {tab === "plan" ? (
            <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
              <section className="jm-card p-5 sm:p-6 space-y-5">
                <div>
                  <h2 className="jm-h2">{stage.title}</h2>
                  <p className="text-sm text-ink-600 mt-1" dir={dir}>{stage.description}{stage.durationHint ? ` · ${stage.durationHint}` : ""}</p>
                </div>
                <ol className="space-y-3">
                  {stage.likelyQuestions.map((q, i) => (
                    <li key={i} className="rounded-control border border-line p-4">
                      <div className="font-semibold text-navy" dir={dir}>{i + 1}. {q.question}</div>
                      {q.whyAsked && <p className="text-xs text-ink-400 mt-1" dir={dir}>{t("interview.whyAsked")}{q.whyAsked}</p>}
                      {q.howToAnswer && <p className="text-sm text-ink-600 mt-2 leading-relaxed" dir={dir}>{q.howToAnswer}</p>}
                      {q.sampleAnswer && (
                        <details className="mt-2">
                          <summary className="text-sm text-teal cursor-pointer">{t("interview.sampleAnswer")}</summary>
                          <p className="text-sm text-ink-600 mt-1 leading-relaxed" dir={dir}>{q.sampleAnswer}</p>
                        </details>
                      )}
                    </li>
                  ))}
                </ol>
                {stage.tips.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-navy mb-2">{t("interview.stageTips")}</h3>
                    <ul className={bulletList}>{stage.tips.map((t, i) => <li key={i} dir={dir}>{t}</li>)}</ul>
                  </div>
                )}
              </section>
              <aside className="space-y-4">
                {prep.plan.gaps.length > 0 && (
                  <section className="jm-card p-5">
                    <h3 className="jm-h2 mb-2">{t("interview.gaps")}</h3>
                    <ul className="space-y-2">
                      {prep.plan.gaps.map((g, i) => (
                        <li key={i} className="text-sm" dir={dir}>
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
                    <h3 className="jm-h2 mb-2">{t("interview.questionsToAsk")}</h3>
                    <ul className={bulletList + " text-sm"}>{prep.plan.questionsToAsk.map((q, i) => <li key={i} dir={dir}>{q}</li>)}</ul>
                  </section>
                )}
                {prep.plan.checklist.length > 0 && (
                  <section className="jm-card p-5">
                    <h3 className="jm-h2 mb-2">{t("interview.checklist")}</h3>
                    <ul className="space-y-1.5 text-sm">{prep.plan.checklist.map((c, i) => <li key={i} className="flex items-start gap-2" dir={dir}><input type="checkbox" className="mt-1 accent-teal" />{c}</li>)}</ul>
                  </section>
                )}
              </aside>
            </div>
          ) : (
            <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
              <section className="jm-card overflow-hidden flex flex-col">
                {!session ? (
                  <div className="p-6 space-y-4">
                    <h2 className="jm-h2">{t("interview.mockTitle", { stage: stage.title, company: prep.job.company })}</h2>
                    <p className="text-sm text-ink-600 leading-relaxed">
                      {t("interview.mockIntro")}
                      <span className="font-medium text-navy">{t("interview.mockIntroEmph")}</span>
                    </p>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {phoneCfg?.configured && (
                        <button type="button" onClick={() => setMode("phone")} aria-pressed={mode === "phone"} className={`rounded-control border p-3 text-start transition-colors ${mode === "phone" ? "border-navy bg-navy text-white" : "border-line hover:border-navy/40"}`}>
                          <div className="font-semibold">{t("interview.modePhone")}</div>
                          <div className={`text-xs mt-1 ${mode === "phone" ? "text-white/80" : "text-ink-600"}`}>{t("interview.modePhoneDesc")}</div>
                        </button>
                      )}
                      <button type="button" onClick={() => setMode("voice")} aria-pressed={mode === "voice"} className={`rounded-control border p-3 text-start transition-colors ${mode === "voice" ? "border-navy bg-navy text-white" : "border-line hover:border-navy/40"}`}>
                        <div className="font-semibold">{t("interview.modeVoice")}</div>
                        <div className={`text-xs mt-1 ${mode === "voice" ? "text-white/80" : "text-ink-600"}`}>{t("interview.modeVoiceDesc")}</div>
                      </button>
                      <button type="button" onClick={() => setMode("chat")} aria-pressed={mode === "chat"} className={`rounded-control border p-3 text-start transition-colors ${mode === "chat" ? "border-navy bg-navy text-white" : "border-line hover:border-navy/40"}`}>
                        <div className="font-semibold">{t("interview.modeChat")}</div>
                        <div className={`text-xs mt-1 ${mode === "chat" ? "text-white/80" : "text-ink-600"}`}>{t("interview.modeChatDesc")}</div>
                      </button>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      {mode === "phone" && (
                        <label className="flex-1 min-w-[200px]">
                          <span className="jm-label">{t("interview.yourPhone")}</span>
                          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("interview.phonePlaceholder")} className="jm-input" dir="ltr" />
                        </label>
                      )}
                      <label>
                        <span className="jm-label">{t("interview.numQuestions")}</span>
                        <select value={questions} onChange={(e) => setQuestions(Number(e.target.value))} className="jm-input jm-select w-32">
                          {[4, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </label>
                      <button onClick={start} disabled={busy === "start"} className="jm-btn jm-btn-primary">{busy === "start" ? t("interview.preparing") : mode === "phone" ? t("interview.startPhone") : mode === "voice" ? t("interview.startVoice") : t("interview.startChat")}</button>
                    </div>
                    {error && <div className="jm-alert jm-alert-err">{error}</div>}
                  </div>
                ) : calling ? (
                  <div className="p-8 text-center space-y-3">
                    <div className="text-5xl animate-pulse">📞</div>
                    <h3 className="jm-h2">{t("interview.calling", { name: calling.interviewer?.name || t("interview.interviewerFallback") })} <span dir="ltr">{calling.to}</span></h3>
                    <p className="text-sm text-ink-600">{t("interview.answerPhone")}</p>
                    {session && session.transcript.length > 0 && <p className="jm-muted">{t("interview.turnsSoFar", { n: session.transcript.length })}</p>}
                    <button onClick={async () => { await fetch("/api/interview/phone", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: calling.sessionId }) }); setCalling(null); setSession(null); }} className="jm-btn jm-btn-secondary jm-btn-sm">{t("interview.cancelCall")}</button>
                  </div>
                ) : voice ? (
                  <VoiceInterview sessionId={voice.sessionId} clientSecret={voice.clientSecret} model={voice.model} endpoint={voice.endpoint} targetQuestions={voice.targetQuestions} stageTitle={stage.title} company={prep.job.company} interviewer={voice.interviewer} longAnswerSec={voice.longAnswerSec} timeLimitSec={voice.timeLimitSec} onEnded={onVoiceEnded} />
                ) : session.feedback ? (
                  <FeedbackView fb={session.feedback} delivery={session.delivery || null} onNew={() => setSession(null)} stageTitle={stage.title} />
                ) : session.mode === "voice" ? (
                  <div className="p-6"><Spinner label={t("interview.writingFeedback")} />{error && <div className="jm-alert jm-alert-err">{error}</div>}</div>
                ) : (
                  <>
                    <div className="p-3 border-b border-line flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium text-navy">{STAGE_ICON[session.stage]} {t("interview.chatTitle", { stage: stage.title })}</span>
                      <span className="jm-chip">{t("interview.questionOf", { a: Math.min(session.asked, session.targetQuestions), b: session.targetQuestions })}</span>
                      {session.realQuestions && (
                        <span className={`jm-chip ${session.realQuestions.stageCount ? "jm-chip-teal" : session.realQuestions.count ? "jm-chip-sky" : ""}`} title={t("interview.realQ.title")}>
                          {session.realQuestions.stageCount
                            ? t("interview.realQ.some", { n: session.realQuestions.stageCount, company: prep.job.company })
                            : session.realQuestions.count
                              ? t("interview.realQ.other", { n: session.realQuestions.count, company: prep.job.company })
                              : t("interview.realQ.none", { company: prep.job.company })}
                        </span>
                      )}
                      <button onClick={finish} disabled={busy !== "" || session.transcript.filter((t) => t.role === "candidate").length === 0} className="jm-btn jm-btn-secondary jm-btn-sm ms-auto">
                        {busy === "finish" ? t("interview.writingShort") : session.wrappedUp ? t("interview.getFeedback") : t("interview.finishAndFeedback")}
                      </button>
                    </div>
                    <div className="jm-scroll flex-1 overflow-y-auto p-4 space-y-3 min-h-[260px] max-h-[60vh]">
                      {session.transcript.map((t, i) => (
                        <div key={i} className={`flex ${t.role === "candidate" ? "justify-end" : "justify-start"}`}>
                          <div dir={dir} className={`max-w-[85%] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line ${t.role === "candidate" ? "bg-navy text-white rounded-2xl rounded-ee-sm" : "bg-canvas border border-line rounded-2xl rounded-es-sm"}`}>
                            {t.content}
                          </div>
                        </div>
                      ))}
                      {session.codeTask && (
                        <div className={`rounded-control border p-4 space-y-2 ${session.codeTask.status === "open" ? "border-teal/40 bg-teal-50" : "border-line bg-canvas"}`} dir={dir}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold text-navy">💻 {t("interview.code.title")}</span>
                            <span className="jm-chip">{session.codeTask.status === "done" ? t("interview.code.submitted", { score: session.codeTask.score ?? "–" }) : session.codeTask.timeLimitMin ? t("interview.code.minutes", { n: session.codeTask.timeLimitMin }) : ""}</span>
                          </div>
                          <div className="text-sm text-ink" dir={dir}>{session.codeTask.title}</div>
                          {session.codeTask.status === "open" && (
                            <>
                              <p className="text-sm text-ink-600 leading-relaxed">{t("interview.code.text")}</p>
                              <div className="flex flex-wrap items-center gap-2">
                                <a href={`/practice/${session.codeTask.attemptId}`} target="_blank" rel="noopener noreferrer" className="jm-btn jm-btn-primary jm-btn-sm">{t("interview.code.open")}</a>
                                <button type="button" onClick={codeContinue} disabled={busy !== ""} className="jm-btn jm-btn-secondary jm-btn-sm">{t("interview.code.continue")}</button>
                                <span className="jm-muted text-xs">{t("interview.code.waiting")}</span>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      {busy === "turn" && <div className="jm-muted flex items-center gap-2"><span className="h-4 w-4 rounded-full border-2 border-teal border-t-transparent animate-spin" /> {t("interview.thinking")}</div>}
                      {session.wrappedUp && !session.feedback && (
                        <div className="jm-alert jm-alert-info">{t("interview.wrappedUp")}</div>
                      )}
                      <div ref={bottomRef} />
                    </div>
                    {!session.wrappedUp && (
                      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="p-3 border-t border-line flex flex-col sm:flex-row gap-2">
                        <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }} rows={2} placeholder={t("interview.answerPlaceholder")} className="jm-input flex-1" dir={dir} disabled={busy !== ""} />
                        <button type="submit" disabled={busy !== "" || !answer.trim()} className="jm-btn jm-btn-primary">{t("interview.send")}</button>
                      </form>
                    )}
                    {error && <div className="m-3 jm-alert jm-alert-err">{error}</div>}
                  </>
                )}
              </section>

              <aside className="space-y-4">
               <ProgressCard refreshKey={history.length} />
               <ReportedQuestionsCard company={prep.job.company} stage={stage?.key} />
               <div className="jm-card p-4 space-y-2">
                <h3 className="jm-h2 text-base">{t("interview.history")}</h3>
                {history.length === 0 && <p className="jm-muted">{t("interview.historyEmpty")}</p>}
                {history.map((h) => (
                  <button key={h.sessionId} onClick={() => openSession(h.sessionId)} className="w-full text-start rounded-xl border border-line px-3 py-2 hover:bg-canvas">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium text-navy">{STAGE_ICON[h.stage]} {prep.plan.stages.find((s) => s.key === h.stage)?.title || h.stage}</span>
                      {h.overallScore !== null ? <span className={`jm-chip ${h.overallScore >= 70 ? "jm-chip-teal" : "jm-chip-sky"}`}>{h.overallScore}</span> : <span className="jm-chip">{h.status === "active" ? t("interview.statusOpen") : t("interview.noFeedback")}</span>}
                    </div>
                    <div className="jm-muted text-xs" dir="ltr">{new Date(h.startedAt).toLocaleString(lang === "he" ? "he-IL" : "en-GB")} · {h.asked}/{h.targetQuestions}</div>
                  </button>
                ))}
               </div>
              </aside>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PeerBlock({ fb, stageTitle }: { fb: Feedback; stageTitle: string }) {
  const { t, dir } = useT();
  const p = fb.peerComparison;
  const c = fb.calibration;
  if (!p && !c) return null;
  const line = p
    ? p.sameStage.median !== null && p.sameStage.percentile !== null
      ? t("interview.peers.sameStage", { n: p.sameStage.n, stage: stageTitle, company: p.company, median: p.sameStage.median, pct: p.sameStage.percentile })
      : p.anyStage.median !== null && p.anyStage.percentile !== null
        ? t("interview.peers.anyStage", { n: p.anyStage.n, company: p.company, median: p.anyStage.median, pct: p.anyStage.percentile })
        : t("interview.peers.few", { company: p.company, n: p.anyStage.n, min: 3 })
    : "";
  return (
    <div className="rounded-control border border-sky/30 bg-sky-50 p-4 space-y-2">
      <h3 className="font-semibold text-sky-600">👥 {t("interview.peers.title", { company: p?.company || c?.company || "" })}</h3>
      {line && <p className="text-sm text-ink-600 leading-relaxed">{line}</p>}
      {p && p.ownPrevious > 0 && <p className="text-xs text-ink-600">{t("interview.peers.own", { n: p.ownPrevious + 1, company: p.company })}</p>}
      {c && c.medianReachedInterview !== null && c.medianRejected !== null && (
        <p className="text-sm text-ink-600 leading-relaxed">
          {t("interview.peers.calibration", { samples: c.samples, where: c.scope === "company" ? t("interview.peers.atCompany", { company: c.company }) : t("interview.peers.everywhere"), good: c.medianReachedInterview, bad: c.medianRejected })}
        </p>
      )}
      {fb.codeTask && <p className="text-xs text-ink-600">💻 {t("interview.code.inFeedback", { title: fb.codeTask.title, score: fb.codeTask.score ?? "–" })}</p>}
      <p className="text-xs text-ink-400">{t("interview.peers.anon")}</p>
    </div>
  );
}

function FeedbackView({ fb, delivery, onNew, stageTitle }: { fb: Feedback; delivery?: Delivery | null; onNew: () => void; stageTitle: string }) {
  const { t, dir } = useT();
  const tone = delivery?.tone;
  const imp = delivery?.impression;
  const stars = (n: number) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));
  const toneLabel = (v: string) => (v === "monotone" || v === "flat" || v === "natural" || v === "expressive" ? t(`interview.tone.${v}`) : v);
  const volumeLabel = (v: string) => (v === "quiet" || v === "normal" || v === "loud" ? t(`interview.vol.${v}`) : v);
  return (
    <div className="p-5 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className={`h-20 w-20 rounded-full flex items-center justify-center text-2xl font-bold text-white ${scoreColor(fb.overallScore)}`}>{fb.overallScore}</div>
        <div className="min-w-0 flex-1">
          <h2 className="jm-h2">{t("interview.feedbackTitle", { stage: stageTitle })}</h2>
          {fb.verdict && <div className="text-sm font-medium text-navy mt-0.5" dir={dir}>{fb.verdict}</div>}
          <p className="text-sm text-ink-600 mt-1 leading-relaxed" dir={dir}>{fb.summary}</p>
        </div>
        <button onClick={onNew} className="jm-btn jm-btn-secondary jm-btn-sm">{t("interview.newInterview")}</button>
      </div>

      <PeerBlock fb={fb} stageTitle={stageTitle} />

      {fb.progress?.note && (
        <div className="rounded-control border border-teal/30 bg-teal-50 p-4 space-y-2">
          <h3 className="font-semibold text-teal-600">{t("interview.progress")}</h3>
          <p className="text-sm text-ink-600 leading-relaxed" dir={dir}>{fb.progress.note}</p>
          <div className="flex flex-wrap gap-1.5">
            {fb.progress.improved.map((x, i) => <span key={`i${i}`} className="jm-chip jm-chip-teal">↑ {x}</span>)}
            {fb.progress.stillOpen.map((x, i) => <span key={`o${i}`} className="jm-chip jm-chip-sky">{t("interview.stillOpen", { t: x })}</span>)}
          </div>
        </div>
      )}

      {(fb.delivery || (tone && tone.measuredAnswers > 0) || imp) && (
        <div className="rounded-control border border-line p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-navy">{t("interview.voiceTone")}</h3>
            {fb.delivery && <span className={`jm-chip ${fb.delivery.score >= 7 ? "jm-chip-teal" : fb.delivery.score >= 5 ? "jm-chip-sky" : "bg-red-50 text-red-700 border-red-200"}`}>{fb.delivery.score}/10</span>}
          </div>
          {fb.delivery?.notes && <p className="text-sm text-ink-600 leading-relaxed whitespace-pre-line" dir={dir}>{fb.delivery.notes}</p>}
          {delivery && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              {delivery.wordsPerMinute !== null && <span className="jm-chip">{t("interview.wpm", { n: delivery.wordsPerMinute })}</span>}
              <span className="jm-chip">{t("interview.avgAnswer", { s: delivery.avgAnswerSeconds })}</span>
              <span className="jm-chip">{t("interview.fillers", { n: delivery.fillerWords })}{delivery.fillersPerMinute !== null ? t("interview.fillersPerMin", { n: delivery.fillersPerMinute }) : ""}</span>
              {tone?.expressiveness && <span className={`jm-chip ${tone.expressiveness === "monotone" || tone.expressiveness === "flat" ? "jm-chip-sky" : "jm-chip-teal"}`}>{t("interview.intonation", { v: toneLabel(tone.expressiveness) })}</span>}
              {tone?.volume && <span className="jm-chip">{t("interview.volume", { v: volumeLabel(tone.volume) })}</span>}
              {tone && tone.pauseRatio !== null && <span className="jm-chip">{t("interview.pauses", { pct: Math.round(tone.pauseRatio * 100) })}</span>}
              {!!tone?.trailingOffAnswers && <span className="jm-chip jm-chip-sky">{t("interview.trailingOff", { n: tone.trailingOffAnswers })}</span>}
            </div>
          )}
          {imp && (
            <div className="grid sm:grid-cols-2 gap-2 text-sm">
              <div><span className="jm-muted">{t("interview.confidence")}</span><span className="text-teal">{stars(imp.confidence)}</span></div>
              <div><span className="jm-muted">{t("interview.energy")}</span><span className="text-teal">{stars(imp.energy)}</span></div>
              <div><span className="jm-muted">{t("interview.clarity")}</span><span className="text-teal">{stars(imp.clarity)}</span></div>
              <div><span className="jm-muted">{t("interview.warmth")}</span><span className="text-teal">{stars(imp.warmth)}</span></div>
              <div className="sm:col-span-2 text-ink-600" dir={dir}><span className="jm-muted">{t("interview.heard")}</span>{imp.notes}{imp.pace && imp.pace !== "good" ? t("interview.pace", { pace: imp.pace }) : ""}</div>
            </div>
          )}
        </div>
      )}

      {(fb.presence || (delivery?.presence && delivery.presence.measuredAnswers > 0)) && (
        <div className="rounded-control border border-line p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-navy">{t("interview.presence")}</h3>
            {fb.presence && <span className={`jm-chip ${fb.presence.score >= 7 ? "jm-chip-teal" : fb.presence.score >= 5 ? "jm-chip-sky" : "bg-red-50 text-red-700 border-red-200"}`}>{fb.presence.score}/10</span>}
          </div>
          {fb.presence?.notes && <p className="text-sm text-ink-600 leading-relaxed whitespace-pre-line">{fb.presence.notes}</p>}
          {delivery?.presence && delivery.presence.measuredAnswers > 0 && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              {delivery.presence.eyeContact !== null && <span className={`jm-chip ${delivery.presence.eyeContact >= 0.7 ? "jm-chip-teal" : delivery.presence.eyeContact < 0.4 ? "jm-chip-sky" : ""}`}>{t("interview.presence.eye", { pct: Math.round(delivery.presence.eyeContact * 100) })}</span>}
              {delivery.presence.smile !== null && <span className="jm-chip">{t("interview.presence.smile", { pct: Math.round(delivery.presence.smile * 100) })}</span>}
              {delivery.presence.furrow !== null && <span className="jm-chip">{t("interview.presence.furrow", { pct: Math.round(delivery.presence.furrow * 100) })}</span>}
              {delivery.presence.headMovementDeg !== null && <span className={`jm-chip ${delivery.presence.headMovementDeg > 8 ? "jm-chip-sky" : ""}`}>{t("interview.presence.move", { deg: delivery.presence.headMovementDeg })}</span>}
              {delivery.presence.framing && <span className="jm-chip">{t(`interview.presence.framing.${delivery.presence.framing}`)}</span>}
            </div>
          )}
          <p className="text-xs text-ink-400">{t("interview.presence.onDevice")}</p>
        </div>
      )}

      {fb.dimensions.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {fb.dimensions.map((d, i) => (
            <div key={i} className="rounded-control border border-line p-3">
              <div className="flex items-center justify-between text-sm"><span className="font-medium text-navy" dir={dir}>{d.name}</span><span className="jm-muted">{d.score}/10</span></div>
              <div className="h-2 rounded-full bg-line mt-2 overflow-hidden"><div className={`h-full ${scoreColor(d.score, 10)}`} style={{ width: `${d.score * 10}%` }} /></div>
              {d.notes && <p className="text-xs text-ink-600 mt-2 leading-relaxed" dir={dir}>{d.notes}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-control bg-teal-50 border border-teal/20 p-4">
          <h3 className="font-semibold text-teal-600 mb-2">{t("interview.whatWorked")}</h3>
          <ul className={bulletList + " text-sm"}>{fb.strengths.map((s, i) => <li key={i} dir={dir}>{s}</li>)}</ul>
        </div>
        <div className="rounded-control bg-sky-50 border border-sky/20 p-4">
          <h3 className="font-semibold text-sky-600 mb-2">{t("interview.toImprove")}</h3>
          <ul className={bulletList + " text-sm"}>{fb.improvements.map((s, i) => <li key={i} dir={dir}>{s}</li>)}</ul>
        </div>
      </div>

      {fb.answerReviews.length > 0 && (
        <div>
          <h3 className="jm-h2 mb-3">{t("interview.perQuestion")}</h3>
          <ol className="space-y-3">
            {fb.answerReviews.map((r, i) => (
              <li key={i} className="rounded-control border border-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-semibold text-navy" dir={dir}>{i + 1}. {r.question}</div>
                  <span className={`jm-chip shrink-0 ${r.score >= 7 ? "jm-chip-teal" : r.score >= 5 ? "jm-chip-sky" : "bg-red-50 text-red-700 border-red-200"}`}>{r.score}/10</span>
                </div>
                {r.answerSummary && <p className="text-xs text-ink-400 mt-1" dir={dir}>{t("interview.youAnswered")}{r.answerSummary}</p>}
                {r.whatWorked && <p className="text-sm text-ink-600 mt-2" dir={dir}>{r.whatWorked}</p>}
                {r.betterAnswer && (
                  <details className="mt-2">
                    <summary className="text-sm text-teal cursor-pointer">{t("interview.betterAnswer")}</summary>
                    <p className="text-sm text-ink-600 mt-1 leading-relaxed whitespace-pre-line" dir={dir}>{r.betterAnswer}</p>
                  </details>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {fb.nextSteps.length > 0 && (
        <div>
          <h3 className="jm-h2 mb-2">{t("interview.nextSteps")}</h3>
          <ul className={bulletList + " text-sm"}>{fb.nextSteps.map((s, i) => <li key={i} dir={dir}>{s}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
