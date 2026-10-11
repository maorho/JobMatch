"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Target } from "lucide-react";

type Fit = { ready: boolean; reason?: string; level?: string; fit: number | null; why: string; gaps: string[]; reranked: boolean };
const LEVEL_HE: Record<string, string> = { junior: "ג'וניור", mid: "ביניים", senior: "בכיר/ה" };

/** Job page sidebar: the reranker's verdict for this user — fit score, why, what's missing. */
export default function FitCard({ jobId }: { jobId: string }) {
  const [fit, setFit] = useState<Fit | null>(null);
  useEffect(() => {
    fetch(`/api/matcher/explain?jobId=${jobId}`)
      .then(async (r) => r.ok && setFit(await r.json()))
      .catch(() => {});
  }, [jobId]);
  if (!fit) return null;
  if (!fit.ready) {
    return (
      <section className="jm-card p-5" dir="rtl">
        <h3 className="jm-h2 mb-2 inline-flex items-center gap-2"><Target className="h-5 w-5 text-teal" /> כמה זה מתאים לך?</h3>
        <p className="text-sm text-ink-600">העלה/י קו״ח ב-ResumeAI ונגיד לך בדיוק למה זה מתאים — ומה חסר.</p>
        <Link href="/ResumeAI" className="jm-btn jm-btn-secondary jm-btn-sm mt-3">ל-ResumeAI</Link>
      </section>
    );
  }
  const score = fit.fit ?? 0;
  const color = score >= 75 ? "bg-teal" : score >= 55 ? "bg-sky" : "bg-red-500";
  return (
    <section className="jm-card p-5 space-y-3" dir="rtl">
      <div className="flex items-center gap-3">
        <div className={`h-14 w-14 shrink-0 rounded-full ${color} text-white font-bold text-lg flex items-center justify-center`}>{score}</div>
        <div className="min-w-0">
          <h3 className="jm-h2 inline-flex items-center gap-2"><Target className="h-5 w-5 text-teal" /> התאמה אליך</h3>
          <p className="jm-muted">{score >= 75 ? "מתאים — שווה להגיש" : score >= 55 ? "אפשרי, עם פער קטן" : "לא ריאלי כרגע"}{fit.level ? ` · הרמה שלך: ${LEVEL_HE[fit.level] || fit.level}` : ""}</p>
        </div>
      </div>
      {fit.why && <p className="text-sm text-ink-600 leading-relaxed" dir="auto">{fit.why}</p>}
      {fit.gaps.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-ink-400 mb-1">מה חסר</div>
          <ul className="list-disc ps-5 text-sm text-ink-600 space-y-0.5">{fit.gaps.map((g, i) => <li key={i} dir="auto">{g}</li>)}</ul>
        </div>
      )}
      {!fit.reranked && <p className="text-[11px] text-ink-400">הערכה ראשונית לפי דמיון סמנטי ורמה; ההסבר המלא מחושב בפיד האישי.</p>}
    </section>
  );
}
