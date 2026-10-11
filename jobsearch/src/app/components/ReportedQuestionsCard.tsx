"use client";
import Link from "next/link";
import useSWR from "swr";
import { MessageSquareQuote } from "lucide-react";
import { companyKey } from "@/app/lib/outcomes/companyKey";

type Bank = { company: string; total: number; reported: number; reporters: number; webCount: number; gated: boolean; questions: { question: string; topic: string; stage: string; count: number; web: number; sources: { url: string; name: string }[] }[] };
const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));
const STAGE: Record<string, string> = { hr: "HR", technical: "טכני", final: "סופי", other: "" };

/** Interview-prep sidebar: the questions candidates were really asked at this company (ours + public reports). */
export default function ReportedQuestionsCard({ company, stage }: { company: string; stage?: string }) {
  const { data } = useSWR<Bank>(company ? `/api/outcomes/questions?company=${encodeURIComponent(company)}${stage && stage !== "other" ? `&stage=${stage}` : ""}` : null, fetcher);
  if (!data || data.total === 0) return null;
  const key = companyKey(company);
  const parts = [
    data.reported > 0 && `${data.reported} מ-${data.reporters} ${data.reporters === 1 ? "מועמד/ת של JobMatch" : "מועמדים של JobMatch"}`,
    data.webCount > 0 && `${data.webCount} מדיווחים פומביים ברשת`,
  ].filter(Boolean);
  return (
    <div className="jm-card p-4 space-y-2">
      <h3 className="jm-h2 text-base inline-flex items-center gap-2"><MessageSquareQuote className="h-4 w-4 text-teal" /> נשאל באמת ב-{data.company}</h3>
      <p className="jm-muted">{data.total} שאלות ({parts.join(" · ")}) — המראיין מכיר אותן.</p>
      <ul className="space-y-1.5">
        {data.questions.slice(0, 6).map((q, i) => (
          <li key={i} className="text-sm text-ink" dir="auto">
            <span className="text-ink-400 text-xs">{STAGE[q.stage] ? `[${STAGE[q.stage]}] ` : ""}</span>{q.question}
            {q.count > 1 && <span className="jm-muted text-xs"> ×{q.count}</span>}
            {q.count === 0 && <span className="jm-muted text-xs"> · מהרשת{q.sources[0]?.name ? ` (${q.sources[0].name})` : ""}</span>}
          </li>
        ))}
      </ul>
      {data.total > 6 && <Link href={`/interview-questions/${encodeURIComponent(key)}`} className="text-sm text-sky hover:underline">לכל {data.total} השאלות</Link>}
    </div>
  );
}
