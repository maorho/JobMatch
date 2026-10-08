"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime.js";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";

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

  if (loading) return <p className="text-center mt-10 font-outfit">טוען…</p>;
  if (!user) {
    return (
      <div className="text-center mt-10 font-outfit">
        <p className="text-red-500">צריך להתחבר כדי לראות הודעות.</p>
        <Link href="/Login" className="text-[#11AEFF] underline">התחברות</Link>
      </div>
    );
  }
  const me = String(user._id ?? user.id);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 font-outfit" dir="rtl">
      <h1 className="text-2xl lg:text-[34px] font-semibold text-[#232323] mb-4">הודעות</h1>
      {error && <p className="mb-3 text-sm text-red-600">⚠️ {error}</p>}
      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 min-h-[60vh]">
        {/* Threads */}
        <aside className={`rounded-4xl border border-[#232323]/10 overflow-hidden ${active ? "hidden md:block" : ""}`}>
          {threads.length === 0 ? (
            <div className="p-6 text-sm text-[#232323]/60">
              אין שיחות עדיין. אפשר לפנות למגייס מעמוד משרה שפורסמה במערכת.
            </div>
          ) : (
            <ul className="divide-y divide-[#232323]/10">
              {threads.map((t) => (
                <li key={t._id}>
                  <button onClick={() => setActive(t._id)} className={`w-full text-right p-4 hover:bg-[#F9F9F9] transition ${active === t._id ? "bg-[#24A8A2]/5" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`truncate ${t.unread ? "font-semibold" : "font-medium"} text-[#232323]`}>{t.other?.fullname || "משתמש"}</span>
                      <span className="shrink-0 text-xs text-[#232323]/50">{t.lastMessageAt ? dayjs(t.lastMessageAt).fromNow() : ""}</span>
                    </div>
                    {t.job && <div className="text-xs text-[#24A8A2] truncate">{t.job.title}</div>}
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <span className="text-sm text-[#232323]/60 truncate" dir="auto">{t.lastSenderId === me ? "את/ה: " : ""}{t.lastMessage || "—"}</span>
                      {t.unread > 0 && <span className="shrink-0 min-w-[20px] h-5 px-1 rounded-full bg-[#24A8A2] text-white text-[11px] flex items-center justify-center">{t.unread}</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Chat */}
        <section className={`rounded-4xl border border-[#232323]/10 flex flex-col ${!active ? "hidden md:flex" : "flex"}`}>
          {!active ? (
            <div className="flex-1 flex items-center justify-center text-[#232323]/50 text-sm p-6">בחר/י שיחה</div>
          ) : (
            <>
              <div className="flex items-center gap-3 p-4 border-b border-[#232323]/10">
                <button onClick={() => setActive(null)} className="md:hidden text-[#11AEFF] text-sm">← חזרה</button>
                <div className="min-w-0">
                  <div className="font-semibold text-[#232323] truncate">{activeThread?.other?.fullname || "שיחה"}</div>
                  {activeThread?.job && (
                    <Link href={`/job/internal/${activeThread.job._id}`} className="text-xs text-[#24A8A2] hover:underline truncate block">{activeThread.job.title}</Link>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[55vh]">
                {messages.map((m) => {
                  const mine = m.senderId === me;
                  return (
                    <div key={m._id} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-line ${mine ? "bg-[#11AEFF] text-white" : "bg-[#F9F9F9] text-[#232323]"}`} dir="auto">
                        {m.body}
                        <div className={`text-[10px] mt-1 ${mine ? "text-white/70" : "text-[#232323]/40"}`}>{dayjs(m.createdAt).format("HH:mm · D.M")}{mine && m.readAt ? " · נקרא" : ""}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              <form onSubmit={(e) => { e.preventDefault(); send(); }} className="p-3 border-t border-[#232323]/10 flex gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="כתוב/י הודעה…"
                  maxLength={4000}
                  className="flex-1 border border-[#232323]/15 rounded-[14px] px-4 py-3 text-sm focus:outline-none focus:border-[#24A8A2]"
                  dir="auto"
                />
                <button type="submit" disabled={sending || !draft.trim()} className="bg-[#24A8A2] hover:bg-[#1d8f8a] text-white px-5 py-3 rounded-[14px] text-sm disabled:opacity-60">
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
