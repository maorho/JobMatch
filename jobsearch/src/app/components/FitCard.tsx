"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Target } from "lucide-react";
import { useT } from "../lib/i18n/LanguageProvider";
import type { Key } from "../lib/i18n/dict";

type Fit = { ready: boolean; reason?: string; level?: string; fit: number | null; why: string; gaps: string[]; reranked: boolean; likelihood?: { pct: number; basis: "prior" | "blended" | "learned"; samples: number } };
const LEVEL_KEY: Record<string, Key> = { junior: "widgets.fit.level.junior", mid: "widgets.fit.level.mid", senior: "widgets.fit.level.senior" };

/** Job page sidebar: the reranker's verdict for this user — fit score, why, what's missing. */
export default function FitCard({ jobId }: { jobId: string }) {
  const { t, dir } = useT();
  const [fit, setFit] = useState<Fit | null>(null);
  useEffect(() => {
    fetch(`/api/matcher/explain?jobId=${jobId}`)
      .then(async (r) => r.ok && setFit(await r.json()))
      .catch(() => {});
  }, [jobId]);
  if (!fit) return null;
  if (!fit.ready) {
    return (
      <section className="jm-card p-5" dir={dir}>
        <h3 className="jm-h2 mb-2 inline-flex items-center gap-2"><Target className="h-5 w-5 text-teal" /> {t("widgets.fit.howFit")}</h3>
        <p className="text-sm text-ink-600">{t("widgets.fit.uploadText")}</p>
        <Link href="/ResumeAI" className="jm-btn jm-btn-secondary jm-btn-sm mt-3">{t("widgets.fit.toResumeAI")}</Link>
      </section>
    );
  }
  const score = fit.fit ?? 0;
  const color = score >= 75 ? "bg-teal" : score >= 55 ? "bg-sky" : "bg-red-500";
  const verdict = score >= 75 ? t("widgets.fit.good") : score >= 55 ? t("widgets.fit.possible") : t("widgets.fit.unrealistic");
  const level = fit.level ? t("widgets.fit.yourLevel", { level: LEVEL_KEY[fit.level] ? t(LEVEL_KEY[fit.level]) : fit.level }) : "";
  const lk = fit.likelihood;
  return (
    <section className="jm-card p-5 space-y-3" dir={dir}>
      <div className="flex items-center gap-3">
        <div className={`h-14 w-14 shrink-0 rounded-full ${color} text-white font-bold text-lg flex items-center justify-center`}>{score}</div>
        <div className="min-w-0">
          <h3 className="jm-h2 inline-flex items-center gap-2"><Target className="h-5 w-5 text-teal" /> {t("widgets.fit.title")}</h3>
          <p className="jm-muted">{verdict}{level}</p>
        </div>
      </div>
      {lk && (
        <p className="text-sm text-ink-600" title={lk.basis === "prior" ? t("widgets.fit.priorTitle") : t("widgets.fit.learnedTitle", { n: lk.samples })}>
          <span className="font-medium text-navy">{t("widgets.fit.interviewOdds", { pct: lk.pct })}</span>
          <span className="jm-muted"> · {lk.basis === "prior" ? t("widgets.fit.prior") : lk.basis === "blended" ? t("widgets.fit.blended", { n: lk.samples }) : t("widgets.fit.learned", { n: lk.samples })}</span>
        </p>
      )}
      {fit.why && <p className="text-sm text-ink-600 leading-relaxed" dir="auto">{fit.why}</p>}
      {fit.gaps.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-ink-400 mb-1">{t("widgets.fit.missing")}</div>
          <ul className="list-disc ps-5 text-sm text-ink-600 space-y-0.5">{fit.gaps.map((g, i) => <li key={i} dir="auto">{g}</li>)}</ul>
        </div>
      )}
      {!fit.reranked && <p className="text-[11px] text-ink-400">{t("widgets.fit.notReranked")}</p>}
    </section>
  );
}
