"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Timer, FileCode2, Briefcase, Trophy } from "lucide-react";
import { useCurrentUser } from "@/app/lib/hooks/useCurrentUser";
import { PageHeader, Spinner, SignInGate } from "@/app/components/ui";
import { useT } from "@/app/lib/i18n/LanguageProvider";

type TaskCard = { _id: string; done: boolean; kind: "coding" | "assignment"; title: string; excerpt: string; language: string; tags: string[]; difficulty: number; timeLimitMin: number; estimatedHours: number; deliverables: number; attempts: number; avgScore: number | null; best: number | null; openAttemptId: string | null };
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

function Difficulty({ n }: { n: number }) {
  const { t } = useT();
  return <span className="inline-flex gap-0.5" title={t("practice.difficulty", { n })}>{[1, 2, 3, 4, 5].map((i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= n ? "bg-teal" : "bg-line"}`} />)}</span>;
}

/**
 * The practice platform: timed coding questions (Examiner) and take-home
 * assignments (Assigner) per role × level, with the candidate's history.
 */
export default function PracticePage() {
  const { t, lang, dir } = useT();
  const { user, loading } = useCurrentUser();
  const router = useRouter();
  const [role, setRole] = useState<string>("");
  const [level, setLevel] = useState<string>("");
  const [starting, setStarting] = useState("");
  const qs = new URLSearchParams({ ...(role ? { role } : {}), ...(level ? { level } : {}) }).toString();
  const { data, isLoading, mutate } = useSWR<Data>(user ? `/api/practice/tasks${qs ? `?${qs}` : ""}` : null, fetcher, { revalidateOnFocus: false });
  const [authoring, setAuthoring] = useState<"" | "coding" | "assignment">("");
  const [authorErr, setAuthorErr] = useState("");

  const verdictLabel = (v: string) => (v === "pass" ? t("practice.verdict.pass") : v === "borderline" ? t("practice.verdict.borderline") : v === "fail" ? t("practice.verdict.fail") : "");

  /** "A new question": the Examiner / Assigner writes one more, different from everything in the bank. */
  const newTask = async (kind: "coding" | "assignment") => {
    if (!data || authoring) return;
    setAuthoring(kind);
    setAuthorErr("");
    try {
      const r = await fetch("/api/practice/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, role: role || data.role, level: level || data.level }) });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.message || j?.error || (r.status === 429 ? t("practice.quotaErr") : t("practice.authorErr")));
      await mutate();
    } catch (e) {
      setAuthorErr((e instanceof Error && e.message) || t("practice.authorErr"));
    } finally {
      setAuthoring("");
    }
  };
  const { data: history } = useSWR<History>(user ? "/api/practice/attempts" : null, fetcher);

  if (!loading && !user) {
    return (
      <div className="jm-page" dir={dir}>
        <PageHeader title={t("practice.title")} subtitle={t("practice.subtitleGate")} />
        <SignInGate text={t("practice.gateText")} next="/practice" />
      </div>
    );
  }

  const start = async (task: TaskCard) => {
    if (task.openAttemptId) return router.push(`/practice/${task.openAttemptId}`);
    setStarting(task._id);
    const r = await fetch("/api/practice/attempts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: task._id }) });
    const j = await r.json().catch(() => null);
    setStarting("");
    if (j?.attemptId) router.push(`/practice/${j.attemptId}`);
  };

  const Card = ({ task }: { task: TaskCard }) => (
    <div className={`jm-card jm-card-hover jm-reveal p-5 flex flex-col gap-3 ${task.done ? "opacity-80" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-navy leading-snug" dir="auto">{task.title}</h3>
        <div className="flex items-center gap-2 shrink-0">
          {task.done && <span className="jm-chip jm-chip-teal">{t("practice.answered")}</span>}
          <Difficulty n={task.difficulty} />
        </div>
      </div>
      <p className="text-sm text-ink-600 leading-relaxed line-clamp-3" dir="auto">{task.excerpt}</p>
      <div className="flex flex-wrap gap-1.5">
        <span className="jm-chip jm-chip-teal inline-flex items-center gap-1">
          <Timer className="h-3.5 w-3.5" /> {task.kind === "coding" ? t("practice.minutesOnClock", { n: task.timeLimitMin }) : t("practice.hoursApprox", { n: task.estimatedHours })}
        </span>
        {task.kind === "coding" && task.language && <span className="jm-chip">{task.language}</span>}
        {task.kind === "assignment" && <span className="jm-chip">{t("practice.deliverablesN", { n: task.deliverables })}</span>}
        {task.tags.slice(0, 3).map((g) => <span key={g} className="jm-chip jm-chip-sky">{g}</span>)}
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        <div className="jm-muted">
          {task.best !== null ? <span className="text-teal font-medium">{t("practice.yourScore", { n: task.best })}</span> : task.avgScore !== null ? t("practice.avgAttempts", { avg: task.avgScore, n: task.attempts }) : task.attempts ? t("practice.attemptsN", { n: task.attempts }) : t("practice.notTried")}
        </div>
        <button onClick={() => start(task)} disabled={starting === task._id} className={`jm-btn jm-btn-sm ${task.openAttemptId ? "jm-btn-secondary" : "jm-btn-primary"}`}>
          {starting === task._id ? t("practice.opening") : task.openAttemptId ? t("practice.continue") : task.done ? t("practice.retry") : task.kind === "coding" ? t("practice.startClock") : t("practice.takeAssignment")}
        </button>
      </div>
    </div>
  );

  const currentRole = data?.roles.find((r) => r.key === data.role);
  const currentLevel = data?.levels.find((l) => l.key === data.level);

  return (
    <div className="jm-page" dir={dir}>
      <PageHeader
        title={t("practice.title")}
        subtitle={t("practice.subtitle")}
        actions={
          data ? (
            <div className="flex flex-wrap items-center gap-2">
              <select value={role || data.role} onChange={(e) => setRole(e.target.value)} className="jm-input w-auto">
                {data.roles.map((r) => <option key={r.key} value={r.key}>{r.label}{r.key === data.suggested.role ? t("practice.byResume") : ""}</option>)}
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
          <span className="inline-flex items-center gap-2 font-medium text-navy"><Trophy className="h-4 w-4 text-teal" /> {t("practice.progress")}</span>
          <span>{t("practice.gradedN", { n: data.stats.graded })}</span>
          {data.stats.avgScore !== null && <span>{t("practice.avgN", { n: data.stats.avgScore })}</span>}
          {data.stats.coding !== null && <span>{t("practice.codingAvg", { n: data.stats.coding })}</span>}
          {data.stats.assignment !== null && <span>{t("practice.assignmentAvg", { n: data.stats.assignment })}</span>}
          <span>{t("practice.passedN", { n: data.stats.passed })}</span>
        </div>
      )}

      {(isLoading || loading) && <Spinner label={t("practice.preparing")} />}

      {data && (
        <div className="space-y-8">
          <section>
            <h2 className="jm-h2 mb-1 inline-flex items-center gap-2"><FileCode2 className="h-5 w-5 text-teal" /> {t("practice.codingHeading")}</h2>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <p className="jm-muted">{t("practice.codingIntro", { min: currentRole?.codingMinutes ?? "", level: currentLevel?.label ?? "", role: currentRole?.label ?? "" })}</p>
              <button type="button" onClick={() => newTask("coding")} disabled={!!authoring} className="jm-btn jm-btn-secondary jm-btn-sm shrink-0">{authoring === "coding" ? t("practice.examinerWriting") : t("practice.newQuestion")}</button>
            </div>
            {authorErr && <p className="jm-alert jm-alert-err mb-3">{authorErr}</p>}
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{data.coding.map((task) => <Card key={task._id} task={task} />)}</div>
          </section>
          <section>
            <h2 className="jm-h2 mb-1 inline-flex items-center gap-2"><Briefcase className="h-5 w-5 text-teal" /> {t("practice.assignmentsHeading")}</h2>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <p className="jm-muted">{t("practice.assignmentIntro", { h: currentRole?.assignmentHours ?? "" })}</p>
              <button type="button" onClick={() => newTask("assignment")} disabled={!!authoring} className="jm-btn jm-btn-secondary jm-btn-sm shrink-0">{authoring === "assignment" ? t("practice.assignerWriting") : t("practice.newAssignment")}</button>
            </div>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{data.assignments.map((task) => <Card key={task._id} task={task} />)}</div>
          </section>
        </div>
      )}

      {history && history.attempts.length > 0 && (
        <section className="mt-10">
          <h2 className="jm-h2 mb-3">{t("practice.history")}</h2>
          <div className="jm-card divide-y divide-line">
            {history.attempts.slice(0, 20).map((a) => (
              <Link key={a._id} href={`/practice/${a._id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-canvas transition-colors">
                <div className="min-w-0">
                  <div className="font-medium text-navy truncate" dir="auto">{a.task?.title || t("practice.task")}</div>
                  <div className="jm-muted">{a.kind === "coding" ? t("practice.codingQuestion") : t("practice.assignment")} · {new Date(a.createdAt).toLocaleDateString(lang === "he" ? "he-IL" : "en-GB")}{a.timedOut ? t("practice.lateSuffix") : ""}</div>
                </div>
                <div className="text-end shrink-0">
                  {a.status === "graded" ? <span className={`font-semibold ${(a.score || 0) >= 70 ? "text-teal" : (a.score || 0) >= 45 ? "text-amber-600" : "text-red-600"}`}>{a.score}/100 · {verdictLabel(a.verdict)}</span> : a.status === "in_progress" ? <span className="jm-chip jm-chip-sky">{t("practice.inProgress")}</span> : <span className="jm-chip">{t("practice.grading")}</span>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
