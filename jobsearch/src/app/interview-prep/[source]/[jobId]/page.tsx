"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useCurrentUser } from "../../../lib/hooks/useCurrentUser";

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

  if (userLoading) return <p className="text-center mt-10 font-outfit">טוען…</p>;
  if (!user) {
    return (
      <div className="text-center mt-10 font-outfit">
        <p className="text-red-500">צריך להתחבר כדי להתכונן לראיון.</p>
        <Link href="/Login" className="text-[#11AEFF] underline">התחברות</Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 font-outfit" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          <Link href={`/job/${source}/${jobId}`} className="text-sm text-[#11AEFF] hover:underline">← חזרה למשרה</Link>
          <h1 className="text-2xl lg:text-[34px] font-semibold text-[#232323] mt-1">הכנה לראיון</h1>
          {prep && <p className="text-[#232323]/60">{prep.job.title} · {prep.job.company}</p>}
        </div>
        {state === "ready" && (
          <button onClick={() => generate(true)} className="text-sm text-[#232323]/60 underline">צור תוכנית מחדש</button>
        )}
      </div>

      {state === "loading" && (
        <div className="rounded-4xl border border-[#232323]/10 p-10 text-center">
          <div className="text-lg font-medium text-[#232323]">הסוכן אוסף מידע על התפקיד והחברה ובונה לך תוכנית הכנה…</div>
          <p className="text-sm text-[#232323]/50 mt-2">תיאור המשרה · משרות נוספות של החברה · אתר החברה · קורות החיים שלך (כ-30–60 שניות)</p>
        </div>
      )}
      {state === "error" && <p className="text-red-600">⚠️ {error} <button onClick={() => generate()} className="underline">נסה שוב</button></p>}

      {state === "ready" && prep && stage && (
        <>
          {/* Company + role */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="rounded-4xl border border-[#232323]/10 p-5">
              <h2 className="font-semibold text-lg text-[#232323] mb-2">על החברה</h2>
              <p className="text-sm text-[#232323]/80" dir="auto">{prep.plan.company.summary || prep.plan.company.whatTheyDo}</p>
              {prep.plan.company.techStack.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {prep.plan.company.techStack.map((t) => <span key={t} className="rounded-full bg-[#F9F9F9] border border-[#232323]/10 px-3 py-1 text-xs">{t}</span>)}
                </div>
              )}
              {prep.plan.company.cultureHints.length > 0 && (
                <ul className="list-disc pe-5 mt-3 text-sm text-[#232323]/70 space-y-1">{prep.plan.company.cultureHints.map((c, i) => <li key={i} dir="auto">{c}</li>)}</ul>
              )}
            </div>
            <div className="rounded-4xl border border-[#232323]/10 p-5">
              <h2 className="font-semibold text-lg text-[#232323] mb-2">על התפקיד</h2>
              <p className="text-sm text-[#232323]/80" dir="auto">{prep.plan.roleSummary}</p>
              {prep.plan.gaps.length > 0 && (
                <>
                  <h3 className="font-medium text-[#232323] mt-4 mb-1">פערים לסגור לפני הראיון</h3>
                  <ul className="space-y-2">
                    {prep.plan.gaps.map((g, i) => (
                      <li key={i} className="text-sm rounded-2xl bg-amber-50 border border-amber-200 p-3" dir="auto">
                        <div className="font-medium text-amber-800">{g.topic}</div>
                        <div className="text-amber-900/80">{g.whyItMatters}</div>
                        {g.studyPlan && <div className="text-[#232323]/70 mt-1">📚 {g.studyPlan}</div>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </section>

          {/* Stages */}
          <div className="flex flex-wrap gap-2 mb-4">
            {prep.plan.stages.map((s, i) => (
              <button key={s.key} onClick={() => setStageKey(s.key)} className={`rounded-full px-4 py-2 text-sm border transition ${stageKey === s.key ? "bg-[#24A8A2] text-white border-[#24A8A2]" : "bg-white text-[#232323] border-[#232323]/15 hover:bg-[#F9F9F9]"}`}>
                {i + 1}. {STAGE_ICON[s.key] ?? "•"} {s.title}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mb-4 text-sm">
            <button onClick={() => setTab("plan")} className={`px-4 py-2 rounded-[14px] ${tab === "plan" ? "bg-[#11AEFF] text-white" : "bg-[#F9F9F9] text-[#232323]"}`}>שאלות וטיפים</button>
            <button onClick={() => setTab("practice")} className={`px-4 py-2 rounded-[14px] ${tab === "practice" ? "bg-[#11AEFF] text-white" : "bg-[#F9F9F9] text-[#232323]"}`}>תרגול ראיון</button>
          </div>

          {tab === "plan" ? (
            <section className="rounded-4xl border border-[#232323]/10 p-5 space-y-4">
              <div>
                <h2 className="font-semibold text-xl text-[#232323]">{stage.title}</h2>
                <p className="text-sm text-[#232323]/70 mt-1" dir="auto">{stage.description}{stage.durationHint ? ` · ${stage.durationHint}` : ""}</p>
              </div>
              <ul className="space-y-3">
                {stage.likelyQuestions.map((q, i) => (
                  <li key={i}>
                    <details className="group rounded-2xl border border-[#232323]/10 p-4">
                      <summary className="cursor-pointer font-medium text-[#232323]" dir="auto">{q.question}</summary>
                      <div className="mt-3 space-y-2 text-sm">
                        {q.whyAsked && <p dir="auto"><span className="font-medium">למה שואלים: </span>{q.whyAsked}</p>}
                        {q.howToAnswer && <p dir="auto"><span className="font-medium">איך לענות: </span>{q.howToAnswer}</p>}
                        {q.sampleAnswer && <p dir="auto" className="rounded-xl bg-[#24A8A2]/5 p-3"><span className="font-medium">תשובה לדוגמה: </span>{q.sampleAnswer}</p>}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
              {stage.tips.length > 0 && (
                <div>
                  <h3 className="font-medium text-[#232323] mb-1">טיפים לשלב הזה</h3>
                  <ul className="list-disc pe-5 text-sm text-[#232323]/80 space-y-1">{stage.tips.map((t, i) => <li key={i} dir="auto">{t}</li>)}</ul>
                </div>
              )}
            </section>
          ) : (
            <section className="rounded-4xl border border-[#232323]/10 flex flex-col">
              <div className="p-4 border-b border-[#232323]/10 text-sm text-[#232323]/70">
                ראיון מדומה לשלב <span className="font-medium text-[#232323]">{stage.title}</span>: המראיין שואל שאלה אחת בכל פעם ונותן משוב על כל תשובה.
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[50vh]">
                {chat.length === 0 && !busy && (
                  <button onClick={() => practice()} className="bg-[#24A8A2] text-white px-5 py-3 rounded-[14px] text-sm">התחל תרגול</button>
                )}
                {chat.map((t, i) => (
                  <div key={i} className={`flex ${t.role === "user" ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-line ${t.role === "user" ? "bg-[#11AEFF] text-white" : "bg-[#F9F9F9] text-[#232323]"}`} dir="auto">{t.content}</div>
                  </div>
                ))}
                {busy && <div className="text-sm text-[#232323]/50">המראיין חושב…</div>}
                <div ref={bottomRef} />
              </div>
              {chat.length > 0 && (
                <form onSubmit={(e) => { e.preventDefault(); if (answer.trim()) practice(answer.trim()); }} className="p-3 border-t border-[#232323]/10 flex gap-2">
                  <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={2} placeholder="התשובה שלך…" className="flex-1 border border-[#232323]/15 rounded-[14px] px-4 py-3 text-sm focus:outline-none focus:border-[#24A8A2]" dir="auto" />
                  <button type="submit" disabled={busy || !answer.trim()} className="bg-[#24A8A2] text-white px-5 rounded-[14px] text-sm disabled:opacity-60">שלח</button>
                </form>
              )}
            </section>
          )}

          {/* Questions to ask + checklist */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <div className="rounded-4xl border border-[#232323]/10 p-5">
              <h2 className="font-semibold text-lg text-[#232323] mb-2">שאלות שכדאי לך לשאול</h2>
              <ul className="list-disc pe-5 text-sm text-[#232323]/80 space-y-1">{prep.plan.questionsToAsk.map((q, i) => <li key={i} dir="auto">{q}</li>)}</ul>
            </div>
            <div className="rounded-4xl border border-[#232323]/10 p-5">
              <h2 className="font-semibold text-lg text-[#232323] mb-2">צ&apos;קליסט לפני הראיון</h2>
              <ul className="space-y-1 text-sm text-[#232323]/80">{prep.plan.checklist.map((c, i) => <li key={i} dir="auto">☐ {c}</li>)}</ul>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
