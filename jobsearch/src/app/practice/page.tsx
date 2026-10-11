"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Timer, FileCode2, Briefcase, Trophy } from "lucide-react";
import { useCurrentUser } from "@/app/lib/hooks/useCurrentUser";
import { PageHeader, Spinner, SignInGate } from "@/app/components/ui";

type TaskCard = { _id: string; kind: "coding" | "assignment"; title: string; excerpt: string; language: string; tags: string[]; difficulty: number; timeLimitMin: number; estimatedHours: number; deliverables: number; attempts: number; avgScore: number | null; best: number | null; openAttemptId: string | null };
type Data = {
  role: string;
  level: string;
  suggested: { role: string; level: string };
  roles: { key: string; label: string; codingMinutes: number; assignmentHours: number }[];
  levels: { key: string; label: string }[];
  coding: TaskCard[];
  assignments: TaskCard[];
  stats: { total: number; graded: number; avgScore: number | null; coding: number | null; assignment: number | null; passed: number };
};
type History = { attempts: { _id: string; kind: string; status: string; score: number | null; verdict: string; timedOut: boolean; createdAt: string; task: { title: string } | null }[] };

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
const VERDICT: Record<string, string> = { pass: "עבר", borderline: "על הגבול", fail: "לא עבר" };

function Difficulty({ n }: { n: number }) {
  return <span className="inline-flex gap-0.5" title={`קושי ${n}/5`}>{[1, 2, 3, 4, 5].map((i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= n ? "bg-teal" : "bg-line"}`} />)}</span>;
}

/**
 * The practice platform: timed coding questions (Examiner) and take-home
 * assignments (Assigner) per role × level, with the candidate's history.
 */
export default function PracticePage() {
  const { user, loading } = useCurrentUser();
  const router = useRouter();
  const [role, setRole] = useState<string>("");
  const [level, setLevel] = useState<string>("");
  const [starting, setStarting] = useState("");
  const qs = new URLSearchParams({ ...(role ? { role } : {}), ...(level ? { level } : {}) }).toString();
  const { data, isLoading } = useSWR<Data>(user ? `/api/practice/tasks${qs ? `?${qs}` : ""}` : null, fetcher, { revalidateOnFocus: false });
  const { data: history } = useSWR<History>(user ? "/api/practice/attempts" : null, fetcher);

  if (!loading && !user) {
    return (
      <div className="jm-page" dir="rtl">
        <PageHeader title="תרגול: שאלות קוד עם שעון ועבודות בית" subtitle="הבוחן כותב שאלות בזמן אמיתי לפי תפקיד ורמה ובודק את הפתרון; מנהל הגיוס נותן עבודת בית ומחזיר משוב כמו בתהליך אמיתי." />
        <SignInGate text="כדי להתאמן צריך להתחבר (חינם)." next="/practice" />
      </div>
    );
  }

  const start = async (t: TaskCard) => {
    if (t.openAttemptId) return router.push(`/practice/${t.openAttemptId}`);
    setStarting(t._id);
    const r = await fetch("/api/practice/attempts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: t._id }) });
    const j = await r.json().catch(() => null);
    setStarting("");
    if (j?.attemptId) router.push(`/practice/${j.attemptId}`);
  };

  const Card = ({ t }: { t: TaskCard }) => (
    <div className="jm-card jm-card-hover p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-navy leading-snug" dir="auto">{t.title}</h3>
        <Difficulty n={t.difficulty} />
      </div>
      <p className="text-sm text-ink-600 leading-relaxed line-clamp-3" dir="auto">{t.excerpt}</p>
      <div className="flex flex-wrap gap-1.5">
        <span className="jm-chip jm-chip-teal inline-flex items-center gap-1">
          <Timer className="h-3.5 w-3.5" /> {t.kind === "coding" ? `${t.timeLimitMin} דק׳ על השעון` : `~${t.estimatedHours} שעות`}
        </span>
        {t.kind === "coding" && t.language && <span className="jm-chip">{t.language}</span>}
        {t.kind === "assignment" && <span className="jm-chip">{t.deliverables} deliverables</span>}
        {t.tags.slice(0, 3).map((g) => <span key={g} className="jm-chip jm-chip-sky">{g}</span>)}
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        <div className="jm-muted">
          {t.best !== null ? <span className="text-teal font-medium">הציון שלך: {t.best}</span> : t.avgScore !== null ? `ממוצע ${t.avgScore} · ${t.attempts} ניסיונות` : t.attempts ? `${t.attempts} ניסיונות` : "עדיין לא נוסה"}
        </div>
        <button onClick={() => start(t)} disabled={starting === t._id} className={`jm-btn jm-btn-sm ${t.openAttemptId ? "jm-btn-secondary" : "jm-btn-primary"}`}>
          {starting === t._id ? "פותח…" : t.openAttemptId ? "המשך" : t.kind === "coding" ? "התחל (השעון רץ)" : "קח את המשימה"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="jm-page" dir="rtl">
      <PageHeader
        title="תרגול: שאלות קוד עם שעון ועבודות בית"
        subtitle="שני סוכנים: הבוחן (Examiner) כותב שאלות קוד בזמן לפי תפקיד ורמה ובודק נכונות, סיבוכיות וקריאות; מנהל הגיוס (Assigner) נותן עבודת בית אמיתית ומחזיר משוב לפי קריטריונים."
        actions={
          data ? (
            <div className="flex flex-wrap items-center gap-2">
              <select value={role || data.role} onChange={(e) => setRole(e.target.value)} className="jm-input w-auto">
                {data.roles.map((r) => <option key={r.key} value={r.key}>{r.label}{r.key === data.suggested.role ? " (לפי הקו״ח)" : ""}</option>)}
              </select>
              <select value={level || data.level} onChange={(e) => setLevel(e.target.value)} className="jm-input w-auto">
                {data.levels.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
              </select>
            </div>
          ) : null
        }
      />

      {data && data.stats.graded > 0 && (
        <div className="jm-card p-4 mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-2 font-medium text-navy"><Trophy className="h-4 w-4 text-teal" /> ההתקדמות שלך</span>
          <span>{data.stats.graded} משימות נבדקו</span>
          {data.stats.avgScore !== null && <span>ממוצע {data.stats.avgScore}</span>}
          {data.stats.coding !== null && <span>קוד {data.stats.coding}</span>}
          {data.stats.assignment !== null && <span>עבודות בית {data.stats.assignment}</span>}
          <span>{data.stats.passed} עברו</span>
        </div>
      )}

      {(isLoading || loading) && <Spinner label="הבוחן ומנהל הגיוס מכינים משימות לתפקיד שלך… (בפעם הראשונה זה לוקח כמה שניות)" />}

      {data && (
        <div className="space-y-8">
          <section>
            <h2 className="jm-h2 mb-1 inline-flex items-center gap-2"><FileCode2 className="h-5 w-5 text-teal" /> שאלות קוד עם שעון</h2>
            <p className="jm-muted mb-4">{data.roles.find((r) => r.key === data.role)?.codingMinutes} דקות לשאלה ל{data.levels.find((l) => l.key === data.level)?.label} {data.roles.find((r) => r.key === data.role)?.label}. השעון מתחיל בלחיצה; הגשה מאוחרת נבדקת ומסומנת.</p>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{data.coding.map((t) => <Card key={t._id} t={t} />)}</div>
          </section>
          <section>
            <h2 className="jm-h2 mb-1 inline-flex items-center gap-2"><Briefcase className="h-5 w-5 text-teal" /> עבודות בית</h2>
            <p className="jm-muted mb-4">כ-{data.roles.find((r) => r.key === data.role)?.assignmentHours} שעות עבודה, כמו בתהליך גיוס אמיתי. מגישים תיאור של מה בניתם ואיך החלטתם, וקישור לריפו.</p>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{data.assignments.map((t) => <Card key={t._id} t={t} />)}</div>
          </section>
        </div>
      )}

      {history && history.attempts.length > 0 && (
        <section className="mt-10">
          <h2 className="jm-h2 mb-3">ההיסטוריה שלך</h2>
          <div className="jm-card divide-y divide-line">
            {history.attempts.slice(0, 20).map((a) => (
              <Link key={a._id} href={`/practice/${a._id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-canvas transition-colors">
                <div className="min-w-0">
                  <div className="font-medium text-navy truncate" dir="auto">{a.task?.title || "משימה"}</div>
                  <div className="jm-muted">{a.kind === "coding" ? "שאלת קוד" : "עבודת בית"} · {new Date(a.createdAt).toLocaleDateString("he-IL")}{a.timedOut ? " · הוגש באיחור" : ""}</div>
                </div>
                <div className="text-end shrink-0">
                  {a.status === "graded" ? <span className={`font-semibold ${(a.score || 0) >= 70 ? "text-teal" : (a.score || 0) >= 45 ? "text-amber-600" : "text-red-600"}`}>{a.score}/100 · {VERDICT[a.verdict] || ""}</span> : a.status === "in_progress" ? <span className="jm-chip jm-chip-sky">בתהליך</span> : <span className="jm-chip">נבדק…</span>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
