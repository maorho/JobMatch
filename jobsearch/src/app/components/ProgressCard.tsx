"use client";
import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";

type Point = { sessionId: string; at: string; stage: string; mode: string; score: number; fillersPerMinute?: number | null; wordsPerMinute?: number | null; company: string };
type Memory = { sessions: number; points: Point[]; trend: { scoreDelta: number | null; fillersDelta: number | null; paceDelta: number | null }; themes: { theme: string; count: number; status: string }[] };

const STATUS: Record<string, { label: string; cls: string }> = { improving: { label: "משתפר", cls: "jm-chip jm-chip-teal" }, persistent: { label: "חוזר", cls: "jm-chip bg-red-50 text-red-700 border-red-200" }, new: { label: "חדש", cls: "jm-chip jm-chip-sky" } };

/** Interview page: the coach's memory — scores over time, delivery trends, recurring themes. */
export default function ProgressCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [m, setM] = useState<Memory | null>(null);
  useEffect(() => {
    fetch("/api/interview/progress", { cache: "no-store" }).then(async (r) => r.ok && setM((await r.json()).memory)).catch(() => {});
  }, [refreshKey]);
  if (!m || m.sessions < 1) return null;
  const pts = m.points;
  const max = 100;
  const w = 220;
  const h = 56;
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${pts.length === 1 ? w / 2 : (i / (pts.length - 1)) * w},${h - (p.score / max) * h}`).join(" ");
  const delta = (v: number | null, good: "up" | "down", unit = "") => (v === null ? null : <span className={`font-medium ${(good === "up" ? v >= 0 : v <= 0) ? "text-teal-600" : "text-red-600"}`}>{v > 0 ? "+" : ""}{v}{unit}</span>);
  return (
    <section className="jm-card p-4 space-y-3" dir="rtl">
      <h3 className="jm-h2 text-base inline-flex items-center gap-2"><TrendingUp className="h-4 w-4 text-teal" /> ההתקדמות שלך · {m.sessions} ראיונות</h3>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-14" aria-label="ציונים לאורך זמן">
        <line x1="0" y1={h - 0.7 * h} x2={w} y2={h - 0.7 * h} stroke="#e6ebf0" strokeDasharray="3 3" />
        <path d={path} fill="none" stroke="#24a8a2" strokeWidth="2" />
        {pts.map((p, i) => <circle key={p.sessionId} cx={pts.length === 1 ? w / 2 : (i / (pts.length - 1)) * w} cy={h - (p.score / max) * h} r="3" fill={p.score >= 70 ? "#24a8a2" : "#11aeff"}><title>{`${p.score} · ${p.stage}${p.company ? ` @ ${p.company}` : ""}`}</title></circle>)}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-600">
        <span>ציון אחרון <span className="font-semibold text-navy">{pts.at(-1)?.score}</span></span>
        {m.trend.scoreDelta !== null && <span>מגמה {delta(m.trend.scoreDelta, "up")}</span>}
        {m.trend.fillersDelta !== null && <span>מילות מילוי {delta(m.trend.fillersDelta, "down", "/דק׳")}</span>}
        {m.trend.paceDelta !== null && <span>קצב {delta(m.trend.paceDelta, "up", " מ/דק׳")}</span>}
      </div>
      {m.themes.length > 0 && (
        <ul className="space-y-1">
          {m.themes.slice(0, 5).map((t, i) => (
            <li key={i} className="flex items-center gap-2 text-sm" dir="auto">
              <span className={STATUS[t.status]?.cls ?? "jm-chip"}>{STATUS[t.status]?.label ?? t.status}</span>
              <span className="text-ink-600 truncate">{t.theme}</span>
              <span className="jm-muted ms-auto">{t.count}×</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
