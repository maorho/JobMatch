"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime.js";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import { PageHeader, Spinner, SignInGate, EmptyState } from "../components/ui";
import { useT } from "../lib/i18n/LanguageProvider";
import "dayjs/locale/he.js";

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
type Attachment = { name: string; size: number; mime: string; url: string };
type Msg = { _id: string; senderId: string; body: string; attachments?: Attachment[]; createdAt: string; readAt: string | null };

const ACCEPT = ".pdf,.doc,.docx,.xlsx,.pptx,.txt,.md,.png,.jpg,.jpeg,.gif,.webp,.zip";
const MAX_FILES = 3;
const MAX_BYTES = 10 * 1024 * 1024;
const isAllowed = (f: File) => /\.(pdf|docx?|xlsx|pptx|txt|md|png|jpe?g|gif|webp|zip)$/i.test(f.name);
/** fetch() cannot report upload progress; a 5 MB file on a slow uplink takes long enough that people need to see it moving. */
const postForm = (url: string, fd: FormData, onProgress: (pct: number) => void, failMsg: string) =>
  new Promise<{ ok: boolean; status: number; data: any }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let data: any = {};
      try { data = JSON.parse(xhr.responseText || "{}"); } catch {}
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
    };
    xhr.onerror = () => reject(new Error(failMsg));
    xhr.send(fd);
  });
const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const PaperclipGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);
const FileGlyph = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </svg>
);

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));

/**
 * /messages            — my threads + the selected chat
 * /messages?c=<id>     — open a thread (from a notification)
 * /messages?to=<userId>&job=<jobId> — start/open a thread from a job page
 */
export default function MessagesPage() {
  const { user, loading } = useCurrentUser();
  const { t, lang, dir } = useT();
  const [active, setActive] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  // Files picked for the next message.
  const [pending, setPending] = useState<File[]>([]);
  const [progress, setProgress] = useState<number | null>(null); // upload % while files are on their way
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const addFiles = (files: FileList | File[] | null | undefined) => {
    if (!files) return;
    const problems: string[] = [];
    setPending((prev) => {
      const next = [...prev];
      for (const f of Array.from(files)) {
        if (!isAllowed(f)) { problems.push(t("pages.messages.unsupportedType", { name: f.name })); continue; }
        if (f.size > MAX_BYTES) { problems.push(t("pages.messages.tooLarge", { name: f.name })); continue; }
        if (next.some((p) => p.name === f.name && p.size === f.size)) continue;
        if (next.length >= MAX_FILES) { problems.push(t("pages.messages.maxFiles", { n: MAX_FILES })); break; }
        next.push(f);
      }
      return next;
    });
    setError(problems.join(" · "));
  };

  // Poll only while the tab is visible (SWR also pauses polling in hidden tabs; this covers the open thread explicitly).
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState === "visible");
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  const { data: list, mutate: mutateList } = useSWR(user ? "/api/messages" : null, fetcher, { refreshInterval: visible ? 15_000 : 0, revalidateOnFocus: true });
  const threads: Thread[] = list?.items ?? [];
  const { data: chat, mutate: mutateChat } = useSWR(user && active ? `/api/messages/${active}` : null, fetcher, { refreshInterval: active && visible ? 5_000 : 0, revalidateOnFocus: true });
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
          if (!r.ok) throw new Error(d?.error || t("pages.messages.cantOpen"));
          setActive(d.conversationId);
          mutateList();
          window.history.replaceState(null, "", `/messages?c=${d.conversationId}`);
        })
        .catch((e) => setError(e.message));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- t only shapes the fallback message
  }, [user, mutateList]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [messages.length, active]);
  useEffect(() => { if (active) mutateList(); }, [chat, active, mutateList]); // unread counters refresh after reading

  const send = async () => {
    const body = draft.trim();
    if ((!body && !pending.length) || !active) return;
    setSending(true);
    setError("");
    try {
      let ok: boolean, d: any;
      if (pending.length) {
        const fd = new FormData();
        fd.append("body", body);
        for (const f of pending) fd.append("files", f);
        setProgress(0);
        const r = await postForm(`/api/messages/${active}`, fd, setProgress, t("pages.messages.sendFailed"));
        ok = r.ok; d = r.data;
      } else {
        const r = await fetch(`/api/messages/${active}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
        ok = r.ok; d = await r.json().catch(() => ({}));
      }
      if (!ok) throw new Error(d?.error || t("pages.messages.sendFailed"));
      setDraft("");
      setPending([]);
      if (fileRef.current) fileRef.current.value = "";
      mutateChat();
      mutateList();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
      setProgress(null);
    }
  };

  if (loading) return <Spinner label={t("common.loading")} />;
  if (!user) return <SignInGate text={t("pages.messages.signIn")} next="/messages" />;
  const me = String(user._id ?? user.id);
  // Mobile shows one pane at a time: the open thread when there is one, else the list.
  const showThread = Boolean(active);

  return (
    <div className="jm-page" dir={dir}>
      <PageHeader title={t("pages.messages.title")} subtitle={t("pages.messages.subtitle")} />
      {error && <div className="jm-alert jm-alert-err mb-4">⚠️ {error}</div>}

      <div className="jm-card overflow-hidden grid md:grid-cols-[320px_1fr] min-h-[70vh]">
        {/* Threads */}
        <aside className={`md:border-e border-line min-w-0 flex-col ${showThread ? "hidden md:flex" : "flex"}`}>
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <span className="text-sm font-semibold text-navy">{t("pages.messages.threads")}</span>
            <span className="jm-muted">{threads.length}</span>
          </div>
          {threads.length === 0 ? (
            <div className="p-6 text-sm text-ink-600 leading-relaxed">
              {t("pages.messages.noThreads")}
            </div>
          ) : (
            <ul className="jm-scroll overflow-y-auto divide-y divide-line flex-1">
              {threads.map((th) => {
                const name = th.other?.fullname || t("pages.messages.user");
                const isActive = active === th._id;
                return (
                  <li key={th._id}>
                    <button
                      onClick={() => setActive(th._id)}
                      className={`w-full text-start p-4 flex items-start gap-3 transition-colors hover:bg-canvas ${isActive ? "bg-teal-50" : ""}`}
                      aria-current={isActive ? "true" : undefined}
                    >
                      <span className="h-10 w-10 shrink-0 rounded-full bg-sky-50 text-sky-600 font-semibold flex items-center justify-center" aria-hidden="true">
                        {name.trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className={`truncate text-ink ${th.unread ? "font-semibold" : "font-medium"}`}>{name}</span>
                          <span className="shrink-0 text-xs text-ink-400">{th.lastMessageAt ? dayjs(th.lastMessageAt).locale(lang).fromNow() : ""}</span>
                        </span>
                        {th.job && <span className="block jm-muted truncate">{th.job.title}</span>}
                        <span className="flex items-center justify-between gap-2 mt-1">
                          <span className="text-sm text-ink-600 truncate" dir="auto">{th.lastSenderId === me ? t("pages.messages.you") : ""}{th.lastMessage || "—"}</span>
                          {th.unread > 0 && <span className="jm-chip jm-chip-navy shrink-0 px-2 py-0">{th.unread}</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Chat: files can be dropped anywhere on it */}
        <section
          className={`min-w-0 flex-col relative ${showThread ? "flex" : "hidden md:flex"} ${dragOver ? "bg-teal-50/30" : ""}`}
          onDragOver={(e) => { if (!active) return; e.preventDefault(); if (!dragOver) setDragOver(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
          onDrop={(e) => { if (!active) return; e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
        >
          {dragOver && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-navy font-semibold">
              {t("pages.messages.dropHere")}
            </div>
          )}
          {!active ? (
            <div className="flex-1 p-6 flex items-center justify-center">
              <EmptyState icon="💬" title={t("pages.messages.pickTitle")} text={t("pages.messages.pickText")} />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-line bg-canvas/60">
                <button onClick={() => setActive(null)} className="jm-btn jm-btn-ghost jm-btn-sm md:hidden">{t("pages.messages.back")}</button>
                <span className="h-9 w-9 shrink-0 rounded-full bg-sky-50 text-sky-600 font-semibold flex items-center justify-center" aria-hidden="true">
                  {(activeThread?.other?.fullname || t("pages.messages.thread")).trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-navy truncate">{activeThread?.other?.fullname || t("pages.messages.thread")}</div>
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
                        {m.attachments?.length ? (
                          <div className={`flex flex-col gap-1.5 ${m.body ? "mb-2" : ""}`}>
                            {m.attachments.map((a) => (
                              a.mime.startsWith("image/") ? (
                                <a key={a.url} href={a.url} target="_blank" rel="noopener noreferrer" className="block" title={`${a.name} · ${fmtSize(a.size)}`}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={a.url} alt={a.name} className="max-h-48 max-w-full rounded-xl border border-white/20" loading="lazy" />
                                </a>
                              ) : (
                                <a
                                  key={a.url}
                                  href={a.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs border ${mine ? "bg-white/10 border-white/25 hover:bg-white/20" : "bg-surface border-line hover:border-teal"}`}
                                >
                                  <FileGlyph />
                                  <span dir="ltr" className="max-w-[220px] truncate underline-offset-2 hover:underline">{a.name}</span>
                                  <span className={mine ? "text-white/70" : "text-ink-400"}>{fmtSize(a.size)}</span>
                                </a>
                              )
                            ))}
                          </div>
                        ) : null}
                        {m.body}
                        <div className={`text-[10px] mt-1 ${mine ? "text-white/70" : "text-ink-400"}`}>{dayjs(m.createdAt).format("HH:mm · D.M")}{mine && m.readAt ? t("pages.messages.read") : ""}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              <form onSubmit={(e) => { e.preventDefault(); send(); }} className="p-3 border-t border-line flex flex-col gap-2 bg-surface">
                {progress !== null && (
                  <div className="h-1.5 w-full rounded-full bg-line overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={t("pages.messages.uploading")}>
                    <div className="h-full rounded-full bg-teal transition-[width] duration-200" style={{ width: `${progress}%` }} />
                  </div>
                )}
                {pending.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {pending.map((f, i) => (
                      <span key={`${f.name}-${f.size}`} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-3 py-1 text-xs text-ink">
                        <FileGlyph />
                        <span dir="ltr" className="max-w-[200px] truncate">{f.name}</span>
                        <span className="text-ink-400">{fmtSize(f.size)}</span>
                        <button type="button" onClick={() => setPending((p) => p.filter((_, k) => k !== i))} className="ms-1 text-ink-400 hover:text-navy" aria-label={t("pages.messages.remove", { name: f.name })}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input type="file" multiple accept={ACCEPT} ref={fileRef} onChange={(e) => addFiles(e.target.files)} className="hidden" />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={sending || chat?.filesEnabled === false}
                    className="jm-btn jm-btn-ghost px-3 shrink-0"
                    title={chat?.filesEnabled === false ? t("pages.messages.filesUnavailable") : t("pages.messages.attachTitle")}
                    aria-label={t("pages.messages.attach")}
                  >
                    <PaperclipGlyph />
                  </button>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onPaste={(e) => { if (e.clipboardData.files?.length) { e.preventDefault(); addFiles(e.clipboardData.files); } }}
                    placeholder={pending.length ? t("pages.messages.placeholderFiles") : t("pages.messages.placeholder")}
                    maxLength={4000}
                    className="jm-input flex-1"
                    dir="auto"
                  />
                  <button type="submit" disabled={sending || (!draft.trim() && !pending.length)} className="jm-btn jm-btn-primary shrink-0">
                    {progress !== null ? (progress < 100 ? t("pages.messages.uploadingPct", { pct: progress }) : t("pages.messages.saving")) : sending ? t("pages.messages.sending") : t("pages.messages.send")}
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
