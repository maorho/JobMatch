"use client";
import { useState } from "react";
import Link from "next/link";

/**
 * "Tailor my résumé to this job" — calls the tailoring agent for the signed-in
 * user, shows the fit analysis, and exports the tailored résumé as a PDF via
 * the existing download-resume route.
 */
type Result = {
  job: { title: string; company: string };
  tailoredResume: unknown[];
  fitScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  keywordGaps: string[];
  suggestions: string[];
  changes: string[];
};

export default function TailorResumePanel({ jobId, source }: { jobId: string; source: "external" | "internal" }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "noResume" | "error">("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const run = async () => {
    setState("loading");
    setError("");
    setPdfUrl(null);
    try {
      const res = await fetch("/api/chat/tailor-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, source, language: "he" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 400 && data?.error === "NO_RESUME") {
        setState("noResume");
        return;
      }
      if (!res.ok) throw new Error(data?.error || "Tailoring failed");
      setResult(data);
      setState("done");
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  };

  const exportPdf = async () => {
    if (!result) return;
    setExporting(true);
    try {
      const res = await fetch("/api/chat/download-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ structuredResume: result.tailoredResume }),
      });
      if (!res.ok) throw new Error("PDF export failed");
      const blob = await res.blob();
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const scoreColor = (s: number) => (s >= 75 ? "text-[#24A8A2]" : s >= 50 ? "text-amber-500" : "text-red-500");

  return (
    <div className="mb-5 rounded-4xl border-[1px] border-[#232323]/10 py-6 px-5 lg:px-8 font-outfit" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-xl lg:text-2xl font-bold text-[#232323]">התאמת קורות החיים למשרה</h3>
          <p className="text-sm text-[#232323]/60 mt-1">
            הסוכן מתאים את קורות החיים שלך לדרישות המשרה — מדגיש את מה שרלוונטי, ומציג פערים. בלי להמציא ניסיון.
          </p>
        </div>
        {state !== "done" && (
          <button
            onClick={run}
            disabled={state === "loading"}
            className="shrink-0 bg-[#11AEFF] hover:bg-[#0d8ed6] text-white px-6 py-3 rounded-[14px] transition disabled:opacity-60"
          >
            {state === "loading" ? "מתאים את קורות החיים…" : "התאם את קו״ח שלי למשרה"}
          </button>
        )}
      </div>

      {state === "noResume" && (
        <div className="mt-4 rounded-2xl bg-[#F9F9F9] p-4 text-sm">
          עדיין אין לך קורות חיים במערכת.{" "}
          <Link href="/ResumeAI" className="text-[#11AEFF] underline">
            בנה או העלה קורות חיים ב-ResumeAI
          </Link>{" "}
          ואז חזור לכאן.
        </div>
      )}
      {state === "error" && <p className="mt-4 text-sm text-red-600">⚠️ {error}</p>}

      {state === "done" && result && (
        <div className="mt-5 space-y-5">
          <div className="flex items-center gap-4">
            <div className={`text-4xl font-bold ${scoreColor(result.fitScore)}`}>{result.fitScore}%</div>
            <div className="text-sm text-[#232323]/70">
              התאמה בין הפרופיל שלך לדרישות של <span className="font-semibold text-[#232323]">{result.job.title}</span> ב-{result.job.company}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-[#232323]/40 mb-2">יש לך ✓</div>
              <div className="flex flex-wrap gap-2">
                {result.matchedSkills.length ? result.matchedSkills.map((s) => (
                  <span key={s} dir="auto" className="rounded-full bg-[#24A8A2]/10 text-[#24A8A2] text-sm px-3 py-1">{s}</span>
                )) : <span className="text-sm text-[#232323]/50">—</span>}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-[#232323]/40 mb-2">חסר / לחזק</div>
              <div className="flex flex-wrap gap-2">
                {[...result.missingSkills, ...result.keywordGaps].length ? [...result.missingSkills, ...result.keywordGaps].map((s) => (
                  <span key={s} dir="auto" className="rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-sm px-3 py-1">{s}</span>
                )) : <span className="text-sm text-[#232323]/50">אין פערים משמעותיים</span>}
              </div>
            </div>
          </div>

          {result.suggestions.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-[#232323]/40 mb-2">המלצות להגשה הזו</div>
              <ul className="list-disc pe-5 space-y-1 text-sm text-[#232323]/80 marker:text-[#24A8A2]">
                {result.suggestions.map((s, i) => <li key={i} dir="auto">{s}</li>)}
              </ul>
            </div>
          )}

          {result.changes.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-[#232323]/60">מה שונה בקורות החיים המותאמים</summary>
              <ul className="list-disc pe-5 mt-2 space-y-1 text-[#232323]/80">
                {result.changes.map((c, i) => <li key={i} dir="auto">{c}</li>)}
              </ul>
            </details>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {!pdfUrl ? (
              <button onClick={exportPdf} disabled={exporting} className="bg-[#24A8A2] hover:bg-[#1d8f8a] text-white px-6 py-3 rounded-[14px] transition disabled:opacity-60">
                {exporting ? "מייצר PDF…" : "📄 צור קו״ח מותאם (PDF)"}
              </button>
            ) : (
              <a href={pdfUrl} download={`Resume_${result.job.company.replace(/\s+/g, "_")}.pdf`} className="bg-[#24A8A2] text-white px-6 py-3 rounded-[14px]">
                ⬇️ הורד את קו״ח המותאם
              </a>
            )}
            <button onClick={run} className="text-sm text-[#232323]/60 underline">התאם מחדש</button>
          </div>
        </div>
      )}
    </div>
  );
}
