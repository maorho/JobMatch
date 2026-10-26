"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime.js";
import { useCurrentUser } from "@/app/lib/hooks/useCurrentUser";
import { PageHeader, Spinner, EmptyState, SignInGate } from "@/app/components/ui";

dayjs.extend(relativeTime);

type Agent = { name: string; title: string; description: string; handles: string[] };
type Run = { _id: string; flow: string; title: string; startedBy: string; status: string; stats: { messages: number; done: number; failed: number }; createdAt: string; finishedAt?: string };
type Msg = { _id: string; from: string; to: string; type: string; says: string; result: string; error: string; status: string; attempts: number; replyTo?: string; createdAt: string; finishedAt?: string; payload: any };

const AGENT_EMOJI: Record<string, string> = { scout: "🔭", locator: "📍", matcher: "🧭", notifier: "🔔", tracker: "📬", coach: "🎯", janitor: "🧹", cron: "⏰", admin: "🛠️", user: "🙂", resumeai: "📄", system: "⚙️" };
const STATUS_CHIP: Record<string, string> = { queued: "jm-chip", processing: "jm-chip jm-chip-sky", done: "jm-chip jm-chip-teal", failed: "jm-chip bg-red-50 text-red-700 border-red-200", running: "jm-chip jm-chip-sky" };

export default function AgentsPage() {
  const { user, loading } = useCurrentUser();
  const [data, setData] = useState<{ agents: Agent[]; runs: Run[]; queue: { queued: number; processing: number; failed: number } } | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [conv, setConv] = useState<{ run: Run; messages: Msg[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/agents", { cache: "no-store" });
    if (!r.ok) return setErr(r.status === 403 ? "רק אדמין יכול לראות את הסוכנים." : "הטעינה נכשלה");
    setData(await r.json());
  }, []);
  const loadRun = useCallback(async (id: string) => {
    const r = await fetch(`/api/agents/runs/${id}`, { cache: "no-store" });
    if (r.ok) setConv(await r.json());
  }, []);

  useEffect(() => {
    if (user?.admin) load();
  }, [user, load]);
  useEffect(() => {
    if (runId) loadRun(runId);
  }, [runId, loadRun]);
  // Live-ish: refresh while something is still moving.
  useEffect(() => {
    const moving = (data?.queue.queued ?? 0) + (data?.queue.processing ?? 0) > 0 || conv?.run.status === "running";
    if (!moving) return;
    const t = setInterval(() => {
      load();
      if (runId) loadRun(runId);
    }, 3000);
    return () => clearInterval(t);
  }, [data, conv, runId, load, loadRun]);

  const start = async (body: object, label: string) => {
    setBusy(label);
    setErr("");
    try {
      const r = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || "failed");
      await load();
      if (d.runId) setRunId(d.runId);
      else if (runId) loadRun(runId);
    } catch (e: any) {
      setErr(e?.message || "failed");
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <Spinner label="טוען…" />;
  if (!user) return <SignInGate text="צריך להתחבר כאדמין" next="/AdminDashboard/agents" />;
  if (!user.admin) return <div className="jm-page"><EmptyState icon="🔒" title="רק אדמין" text="העמוד הזה זמין למנהלי המערכת בלבד." action={<Link href="/" className="jm-btn jm-btn-primary">חזרה לפיד</Link>} /></div>;

  return (
    <div className="jm-page" dir="rtl">
      <PageHeader
        eyebrow="Admin"
        title="צוות הסוכנים"
        subtitle="הסוכנים מדברים דרך bus משותף: כל הודעה נשמרת, וכל ריצה נקראת כשיחה."
        actions={
          <>
            <button disabled={!!busy} onClick={() => start({ flow: "catalog.refresh" }, "refresh")} className="jm-btn jm-btn-primary jm-btn-sm">
              {busy === "refresh" ? "מתחיל…" : "🔭 רענון קטלוג"}
            </button>
            <button disabled={!!busy} onClick={() => start({ flow: "digest" }, "digest")} className="jm-btn jm-btn-secondary jm-btn-sm">
              🔔 התאמות עכשיו
            </button>
            <button disabled={!!busy} onClick={() => start({ flow: "catalog.sweep" }, "sweep")} className="jm-btn jm-btn-secondary jm-btn-sm">
              🧹 ניקוי
            </button>
            <button disabled={!!busy} onClick={() => start({ drain: true }, "drain")} className="jm-btn jm-btn-ghost jm-btn-sm">
              ▶ הרץ תור ({data?.queue.queued ?? 0})
            </button>
          </>
        }
      />
      {err && <div className="jm-alert jm-alert-err mb-4">{err}</div>}

      {/* Roster */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {(data?.agents ?? []).map((a) => (
          <div key={a.name} className="jm-card p-4">
            <div className="flex items-center gap-2 font-semibold text-navy">
              <span className="text-xl" aria-hidden>{AGENT_EMOJI[a.name] ?? "🤖"}</span>
              {a.title}
            </div>
            <p className="text-sm text-ink-600 mt-1 leading-relaxed">{a.description}</p>
            <div className="mt-2 flex flex-wrap gap-1" dir="ltr">
              {a.handles.map((h) => (
                <span key={h} className="text-[11px] font-mono text-ink-400 bg-canvas rounded px-1.5 py-0.5">{h}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-[320px_minmax(0,1fr)] gap-6 items-start">
        {/* Runs */}
        <div className="jm-card p-3 space-y-1 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] overflow-y-auto jm-scroll">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="jm-h2 text-base">ריצות אחרונות</span>
            <span className="jm-muted" dir="ltr">
              {data?.queue.queued ?? 0} queued · {data?.queue.failed ?? 0} failed
            </span>
          </div>
          {(data?.runs ?? []).length === 0 && <p className="jm-muted px-2 py-4">עדיין אין ריצות — התחל/י אחת למעלה.</p>}
          {(data?.runs ?? []).map((r) => (
            <button
              key={r._id}
              onClick={() => setRunId(r._id)}
              className={`w-full text-start rounded-xl px-3 py-2 transition-colors ${runId === r._id ? "bg-navy text-white" : "hover:bg-canvas"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">{r.title || r.flow}</span>
                <span className={`${STATUS_CHIP[r.status] ?? "jm-chip"} ${runId === r._id ? "!bg-white/15 !text-white !border-white/20" : ""}`}>{r.status}</span>
              </div>
              <div className={`text-xs mt-0.5 ${runId === r._id ? "text-white/70" : "text-ink-400"}`} dir="ltr">
                {r.stats.messages} msgs · {dayjs(r.createdAt).fromNow()} · {r.startedBy}
              </div>
            </button>
          ))}
        </div>

        {/* Conversation */}
        <div className="min-w-0">
          {!conv ? (
            <EmptyState icon="💬" title="בחר/י ריצה" text="כל ריצה מוצגת כשיחה בין הסוכנים — מי אמר מה למי, ומה יצא מזה." />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="jm-h2">{conv.run.title || conv.run.flow}</h2>
                <span className={STATUS_CHIP[conv.run.status] ?? "jm-chip"}>{conv.run.status}</span>
                <span className="jm-muted" dir="ltr">
                  {dayjs(conv.run.createdAt).format("DD/MM HH:mm")}
                  {conv.run.finishedAt ? ` → ${dayjs(conv.run.finishedAt).format("HH:mm:ss")}` : ""}
                </span>
              </div>
              {conv.messages.map((m) => (
                <article key={m._id} className={`jm-card p-4 ${m.status === "failed" ? "border-red-200" : ""}`} dir="ltr">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-navy">
                      {AGENT_EMOJI[m.from] ?? "🤖"} {m.from}
                    </span>
                    <span className="text-ink-400">→</span>
                    <span className="font-semibold text-navy">
                      {AGENT_EMOJI[m.to] ?? "🤖"} {m.to}
                    </span>
                    <span className="font-mono text-[11px] text-ink-400 bg-canvas rounded px-1.5 py-0.5">{m.type}</span>
                    {m.replyTo && <span className="jm-chip">reply</span>}
                    <span className={`${STATUS_CHIP[m.status] ?? "jm-chip"} ms-auto`}>
                      {m.status}
                      {m.attempts > 1 ? ` ×${m.attempts}` : ""}
                    </span>
                  </div>
                  {m.says && <p className="mt-2 text-ink leading-relaxed" dir="auto">“{m.says}”</p>}
                  {m.result && (
                    <p className="mt-2 text-sm text-ink-600 whitespace-pre-line border-s-2 border-teal ps-3" dir="auto">
                      <span className="font-medium text-teal-600">{m.to}: </span>
                      {m.result}
                    </p>
                  )}
                  {m.error && <p className="mt-2 jm-alert jm-alert-err">{m.error}</p>}
                  <details className="mt-2">
                    <summary className="text-xs text-ink-400 cursor-pointer select-none">payload · {dayjs(m.createdAt).format("HH:mm:ss")}</summary>
                    <pre className="mt-1 text-xs bg-canvas rounded-xl p-3 overflow-x-auto">{JSON.stringify(m.payload, null, 2)}</pre>
                  </details>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
