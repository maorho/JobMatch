"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime.js";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import { PageHeader, Spinner, SignInGate, EmptyState } from "../components/ui";

dayjs.extend(relativeTime);

type Thread = {
  _id: string;
  other: { _id: string; fullname: string; avatar: string; recruiter: boolean; company: string } | null;
  job: { _id: string; title: string } | null;
  lastMessage: string;
  lastMessageAt: string;
  lastSenderId: string | null;
  unread: number;
};
type Msg = { _id: string; senderId: string; body: string; createdAt: string; readAt: string | null };

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));

/**
 * /messages            — my threads + the selected chat
 * /messages?c=<id>     — open a thread (from a notification)
 * /messages?to=<userId>&job=<jobId> — start/open a thread from a job page
 */
export default function MessagesPage() {
  const { user, loading } = useCurrentUser();
  const [active, setActive] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { data: list, mutate: mutateList } = useSWR(user ? "/api/messages" : null, fetcher, { refreshInterval: 10_000 });
  const threads: Thread[] = list?.items ?? [];
  const { data: chat, mutate: mutateChat } = useSWR(user && active ? `/api/messages/${active}` : null, fetcher, { refreshInterval: 5_000 });
  const messages: Msg[] = chat?.messages ?? [];
  const activeThread = threads.find((t) => t._id === active) || null;

  // Deep links: ?c=<conversation> or ?to=<user>&job=<job>.
  useEffect(() => {
    if (!user) return;
    const sp = new URLSearchParams(window.location.search);
    const c = sp.get("c");
    if (c) { setActive(c); return; }
    const to = sp.get("to"), job = sp.get("job");
    if (to && job) {
      fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: to, jobId: job }) })
        .then(async (r) => {
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d?.error || "לא ניתן לפתוח שיחה");
          setActive(d.conversationId);
          mutateList();
          window.history.replaceState(null, "", `/messages?c=${d.conversationId}`);
        })
        .catch((e) => setError(e.message));
    }
  }, [user, mutateList]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [messages.length, active]);
  useEffect(() => { if (active) mutateList(); }, [chat, active, mutateList]); // unread counters refresh after reading

  const send = async () => {
    const body = draft.trim();
    if (!body || !active) return;
    setSending(true);
    setError("");
    try {
      const r = await fetch(`/api/messages/${active}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || "השליחה נכשלה");
      setDraft("");
      mutateChat();
      mutateList();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (loading) return <Spinner label="טוען…" />;
  if (!user) return <SignInGate text="צריך להתחבר כדי לראות הודעות." next="/messages" />;
  const me = String(user._id ?? user.id);
  // Mobile shows one pane at a time: the open thread when there is one, else the list.
  const showThread = Boolean(active);

  return (
    <div className="jm-page" dir="rtl">
      <PageHeader title="הודעות" subtitle="שיחות עם מגייסים של משרות שפורסמו במערכת" />
      {error && <div className="jm-alert jm-alert-err mb-4">⚠️ {error}</div>}

      <div className="jm-card overflow-hidden grid md:grid-cols-[320px_1fr] min-h-[70vh]">
        {/* Threads */}
        <aside className={`md:border-e border-line min-w-0 flex-col ${showThread ? "hidden md:flex" : "flex"}`}>
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <span className="text-sm font-semibold text-navy">שיחות</span>
            <span className="jm-muted">{threads.length}</span>
          </div>
          {threads.length === 0 ? (
            <div className="p-6 text-sm text-ink-600 leading-relaxed">
              אין שיחות עדיין. אפשר לפנות למגייס מעמוד משרה שפורסמה במערכת.
            </div>
          ) : (
            <ul className="jm-scroll overflow-y-auto divide-y divide-line flex-1">
              {threads.map((t) => {
                const name = t.other?.fullname || "משתמש";
                const isActive = active === t._id;
                return (
                  <li key={t._id}>
                    <button
                      onClick={() => setActive(t._id)}
                      className={`w-full text-start p-4 flex items-start gap-3 transition-colors hover:bg-canvas ${isActive ? "bg-teal-50" : ""}`}
                      aria-current={isActive ? "true" : undefined}
                    >
                      <span className="h-10 w-10 shrink-0 rounded-full bg-sky-50 text-sky-600 font-semibold flex items-center justify-center" aria-hidden="true">
                        {name.trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className={`truncate text-ink ${t.unread ? "font-semibold" : "font-medium"}`}>{name}</span>
                          <span className="shrink-0 text-xs text-ink-400">{t.lastMessageAt ? dayjs(t.lastMessageAt).fromNow() : ""}</span>
                        </span>
                        {t.job && <span className="block jm-muted truncate">{t.job.title}</span>}
                        <span className="flex items-center justify-between gap-2 mt-1">
                          <span className="text-sm text-ink-600 truncate" dir="auto">{t.lastSenderId === me ? "את/ה: " : ""}{t.lastMessage || "—"}</span>
                          {t.unread > 0 && <span className="jm-chip jm-chip-navy shrink-0 px-2 py-0">{t.unread}</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Chat */}
        <section className={`min-w-0 flex-col ${showThread ? "flex" : "hidden md:flex"}`}>
          {!active ? (
            <div className="flex-1 p-6 flex items-center justify-center">
              <EmptyState icon="💬" title="בחר/י שיחה" text="בחר/י שיחה מהרשימה כדי לקרוא ולהשיב." />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-line bg-canvas/60">
                <button onClick={() => setActive(null)} className="jm-btn jm-btn-ghost jm-btn-sm md:hidden">← חזרה</button>
                <span className="h-9 w-9 shrink-0 rounded-full bg-sky-50 text-sky-600 font-semibold flex items-center justify-center" aria-hidden="true">
                  {(activeThread?.other?.fullname || "שיחה").trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-navy truncate">{activeThread?.other?.fullname || "שיחה"}</div>
                  {activeThread?.job && (
                    <Link href={`/job/internal/${activeThread.job._id}`} className="jm-muted hover:text-teal truncate block">{activeThread.job.title}</Link>
                  )}
                </div>
              </div>
              <div className="jm-scroll overflow-y-auto flex-1 p-4 space-y-2 max-h-[60vh]">
                {messages.map((m) => {
                  const mine = m.senderId === me;
                  return (
                    <div key={m._id} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
                      <div
                        className={`max-w-[80%] px-4 py-2 text-sm whitespace-pre-line ${mine ? "bg-navy text-white rounded-2xl rounded-ee-sm" : "bg-canvas border border-line text-ink rounded-2xl rounded-es-sm"}`}
                        dir="auto"
                      >
                        {m.body}
                        <div className={`text-[10px] mt-1 ${mine ? "text-white/70" : "text-ink-400"}`}>{dayjs(m.createdAt).format("HH:mm · D.M")}{mine && m.readAt ? " · נקרא" : ""}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              <form onSubmit={(e) => { e.preventDefault(); send(); }} className="p-3 border-t border-line flex gap-2 bg-surface">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="כתוב/י הודעה…"
                  maxLength={4000}
                  className="jm-input flex-1"
                  dir="auto"
                />
                <button type="submit" disabled={sending || !draft.trim()} className="jm-btn jm-btn-primary shrink-0">
                  {sending ? "שולח…" : "שלח"}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
