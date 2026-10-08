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

  const scoreColor = (s: number) => (s >= 75 ? "text-teal" : s >= 50 ? "text-amber-500" : "text-red-500");
  const gaps = result ? [...result.missingSkills, ...result.keywordGaps] : [];

  return (
    <section className="jm-card p-5" dir="rtl">
      <div className="flex flex-col gap-3">
        <div>
          <h3 className="jm-h2">התאמת קורות החיים למשרה</h3>
          <p className="text-sm text-ink-600 mt-1">
            הסוכן מתאים את קורות החיים שלך לדרישות המשרה — מדגיש את מה שרלוונטי, ומציג פערים. בלי להמציא ניסיון.
          </p>
        </div>
        {state !== "done" && (
          <button
            onClick={run}
            disabled={state === "loading"}
            className="jm-btn jm-btn-accent w-full"
          >
            {state === "loading" && (
              <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" aria-hidden />
            )}
            {state === "loading" ? "מתאים את קורות החיים…" : "התאם את קו״ח שלי למשרה"}
          </button>
        )}
      </div>

      {state === "noResume" && (
        <div className="jm-alert jm-alert-info mt-4">
          עדיין אין לך קורות חיים במערכת.{" "}
          <Link href="/ResumeAI" className="font-medium underline">
            בנה או העלה קורות חיים ב-ResumeAI
          </Link>{" "}
          ואז חזור לכאן.
        </div>
      )}
      {state === "error" && (
        <p className="jm-alert jm-alert-err mt-4" role="alert">
          ⚠️ {error}
        </p>
      )}

      {state === "done" && result && (
        <div className="mt-5 space-y-5">
          <div>
            <div className="flex items-end justify-between gap-3">
              <div className={`text-4xl font-semibold leading-none ${scoreColor(result.fitScore)}`}>{result.fitScore}%</div>
              <div className="text-sm text-ink-600 text-start">
                התאמה בין הפרופיל שלך לדרישות של <span className="font-semibold text-navy">{result.job.title}</span> ב-{result.job.company}
              </div>
            </div>
            <div
              className="mt-3 h-2 w-full rounded-full bg-line overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={result.fitScore}
            >
              <div className="h-full rounded-full bg-teal transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, result.fitScore))}%` }} />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-2">יש לך ✓</div>
              <div className="flex flex-wrap gap-2">
                {result.matchedSkills.length ? result.matchedSkills.map((s) => (
                  <span key={s} dir="auto" className="jm-chip jm-chip-teal">{s}</span>
                )) : <span className="jm-muted">—</span>}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-2">חסר / לחזק</div>
              <div className="flex flex-wrap gap-2">
                {gaps.length ? gaps.map((s) => (
                  <span key={s} dir="auto" className="jm-chip">{s}</span>
                )) : <span className="jm-muted">אין פערים משמעותיים</span>}
              </div>
            </div>
          </div>

          {result.suggestions.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-2">המלצות להגשה הזו</div>
              <ul className="list-disc ps-5 space-y-1 text-sm text-ink-600 marker:text-teal">
                {result.suggestions.map((s, i) => <li key={i} dir="auto">{s}</li>)}
              </ul>
            </div>
          )}

          {result.changes.length > 0 && (
            <details className="text-sm rounded-control border border-line bg-canvas px-4 py-3">
              <summary className="cursor-pointer font-medium text-navy">מה שונה בקורות החיים המותאמים</summary>
              <ul className="list-disc ps-5 mt-2 space-y-1 text-ink-600 marker:text-teal">
                {result.changes.map((c, i) => <li key={i} dir="auto">{c}</li>)}
              </ul>
            </details>
          )}

          <div className="flex flex-col gap-2 pt-1">
            {!pdfUrl ? (
              <button onClick={exportPdf} disabled={exporting} className="jm-btn jm-btn-primary w-full">
                {exporting ? "מייצר PDF…" : "📄 צור קו״ח מותאם (PDF)"}
              </button>
            ) : (
              <a href={pdfUrl} download={`Resume_${result.job.company.replace(/\s+/g, "_")}.pdf`} className="jm-btn jm-btn-primary w-full">
                ⬇️ הורד את קו״ח המותאם
              </a>
            )}
            <button onClick={run} className="jm-btn jm-btn-ghost jm-btn-sm">התאם מחדש</button>
          </div>
        </div>
      )}
    </section>
  );
}
