"use client";
import Link from "next/link";
import useSWR from "swr";
import { MessageSquareQuote } from "lucide-react";
import { companyKey } from "@/app/lib/outcomes/companyKey";
import { useT } from "@/app/lib/i18n/LanguageProvider";
import type { Key } from "@/app/lib/i18n/dict";

type Bank = { company: string; total: number; reported: number; reporters: number; webCount: number; gated: boolean; questions: { question: string; topic: string; stage: string; count: number; web: number; sources: { url: string; name: string }[] }[] };
const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));
const STAGE_KEY: Record<string, Key | undefined> = { hr: "widgets.rq.stage.hr", technical: "widgets.rq.stage.technical", final: "widgets.rq.stage.final", other: undefined };

/** Interview-prep sidebar: the questions candidates were really asked at this company (ours + public reports). */
export default function ReportedQuestionsCard({ company, stage }: { company: string; stage?: string }) {
  const { t, dir } = useT();
  const { data } = useSWR<Bank>(company ? `/api/outcomes/questions?company=${encodeURIComponent(company)}${stage && stage !== "other" ? `&stage=${stage}` : ""}` : null, fetcher);
  if (!data || data.total === 0) return null;
  const key = companyKey(company);
  const parts = [
    data.reported > 0 && t(data.reporters === 1 ? "widgets.rq.fromOne" : "widgets.rq.fromMany", { reported: data.reported, reporters: data.reporters }),
    data.webCount > 0 && t("widgets.rq.fromWeb", { n: data.webCount }),
  ].filter(Boolean);
  return (
    <div className="jm-card p-4 space-y-2" dir={dir}>
      <h3 className="jm-h2 text-base inline-flex items-center gap-2"><MessageSquareQuote className="h-4 w-4 text-teal" /> {t("widgets.rq.title", { company: data.company })}</h3>
      <p className="jm-muted">{t("widgets.rq.summary", { total: data.total, parts: parts.join(" · ") })}</p>
      <ul className="space-y-1.5">
        {data.questions.slice(0, 6).map((q, i) => {
          const stageKey = STAGE_KEY[q.stage];
          return (
            <li key={i} className="text-sm text-ink" dir={dir}>
              <span className="text-ink-400 text-xs">{stageKey ? `[${t(stageKey)}] ` : ""}</span>{q.question}
              {q.count > 1 && <span className="jm-muted text-xs"> ×{q.count}</span>}
              {q.count === 0 && <span className="jm-muted text-xs">{t("widgets.rq.fromTheWeb")}{q.sources[0]?.name ? ` (${q.sources[0].name})` : ""}</span>}
            </li>
          );
        })}
      </ul>
      {data.total > 6 && <Link href={`/interview-questions/${encodeURIComponent(key)}`} className="text-sm text-sky hover:underline">{t("widgets.rq.all", { n: data.total })}</Link>}
    </div>
  );
}
