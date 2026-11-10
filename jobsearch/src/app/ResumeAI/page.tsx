"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { PageHeader } from "../components/ui";
import { useT } from "../lib/i18n/LanguageProvider";
import type { Key } from "../lib/i18n/dict";

type Role = "user" | "assistant" | "system";

/** A file attached to a message: its text was extracted by /api/chat/attachments and travels with the message. */
type Attachment = { name: string; text: string; chars: number; kind: "pdf" | "docx" | "text"; looksLikeResume: boolean; truncated?: boolean };

type Message = {
  role: Role;
  content: string;
  attachments?: Attachment[];
  /** A UI-authored message (the greeting): rendered through the dictionary so it follows the interface language. */
  key?: Key;
};

const ACCEPT = ".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown";
const MAX_FILES = 3;
const MAX_BYTES = 8 * 1024 * 1024;

const PdfGlyph = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M9 13h6M9 17h6" />
  </svg>
);
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

const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const isAcceptedFile = (f: File) => /\.(pdf|docx|txt|md)$/i.test(f.name);

/** What the résumé builder sees: the typed text plus each attached file, since it reads the conversation as plain text. */
const flatten = (m: Message, fileLabel: (name: string) => string): Message => ({
  role: m.role,
  content: m.attachments?.length ? `${m.content}\n\n${m.attachments.map((a) => `${fileLabel(a.name)}\n${a.text}`).join("\n\n")}` : m.content,
});

export default function ResumeAIPage() {
  const { t, dir } = useT();
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: "", key: "resume.greeting" }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [rawResumeText, setRawResumeText] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  // True once the résumé is stored for matching → the feed is personalized.
  const [matchReady, setMatchReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Files picked for the next chat message (not sent yet).
  const [pending, setPending] = useState<File[]>([]);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const chatFileRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // מושך את המשתמש המחובר (בהנחה ש /api/auth/me מחזיר user._id)
  useEffect(() => {
    const fetchMe = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return;
        const data = await res.json();
        if (data?.user?._id || data?.user?.id || data?.id) {
          setUserId(data.user?._id ?? data.user?.id ?? data.id);
        }
      } catch (err) {
        console.error("❌ failed to load me:", err);
      }
    };
    fetchMe();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const appendMessage = (msg: Message) =>
    setMessages((prev) => [...prev, msg]);
  /** The text of a message in the current language (dictionary-backed messages are resolved here). */
  const textOf = (m: Message) => (m.key ? t(m.key) : m.content);
  /** What goes over the wire: plain role/content pairs, dictionary messages resolved. */
  const materialize = (m: Message): Message => (m.key ? { role: m.role, content: t(m.key), attachments: m.attachments } : m);

  /** Add files to the next message, with the same limits the server applies. */
  const addFiles = useCallback((files: FileList | File[] | null | undefined) => {
    if (!files) return;
    const list = Array.from(files);
    const problems: string[] = [];
    setPending((prev) => {
      const next = [...prev];
      for (const f of list) {
        if (!isAcceptedFile(f)) { problems.push(t("resume.fileTypeError", { name: f.name })); continue; }
        if (f.size > MAX_BYTES) { problems.push(t("resume.fileTooLarge", { name: f.name })); continue; }
        if (next.some((p) => p.name === f.name && p.size === f.size)) continue;
        if (next.length >= MAX_FILES) { problems.push(t("resume.tooManyFiles", { n: MAX_FILES })); break; }
        next.push(f);
      }
      return next;
    });
    setPendingError(problems.length ? problems.join(" · ") : null);
  }, [t]);
  const removePending = (i: number) => setPending((prev) => prev.filter((_, k) => k !== i));

  /** Upload the pending files and get their text back; the message carries it from here on. */
  const extractPending = async (): Promise<Attachment[] | null> => {
    if (!pending.length) return [];
    const fd = new FormData();
    for (const f of pending) fd.append("files", f);
    const res = await fetch("/api/chat/attachments", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    const errs: { name: string; error: string }[] = Array.isArray(data?.errors) ? data.errors : [];
    if (errs.length) {
      const why: Record<string, string> = {
        too_large: t("resume.whyTooLarge"),
        unsupported: t("resume.whyUnsupported"),
        empty: t("resume.whyEmpty"),
        unreadable: t("resume.whyUnreadable"),
      };
      appendMessage({ role: "assistant", content: t("resume.attachFailed", { list: errs.map((e) => `${e.name} (${why[e.error] || e.error})`).join(", ") }) });
    }
    if (!res.ok && !Array.isArray(data?.files)) return null;
    return (data.files || []) as Attachment[];
  };

  const handleSend = async () => {
    if (loading) return;
    if (!input.trim() && !pending.length) return;
    setLoading(true);
    setDownloadUrl(null); // אם יש PDF קודם – נסתיר אותו
    setScore(null);
    setIssues([]);
    setPendingError(null);

    try {
      const attachments = await extractPending();
      if (attachments === null) {
        appendMessage({ role: "assistant", content: t("resume.filesUnreadable") });
        return;
      }
      if (!attachments.length && !input.trim()) return; // only unreadable files were attached
      setPending([]);
      if (chatFileRef.current) chatFileRef.current.value = "";
      // A résumé attached in the chat becomes the base for the next build, like one dropped on the upload card.
      const cv = attachments.find((a) => a.looksLikeResume);
      if (cv) setRawResumeText(cv.text);

      const userMessage: Message = { role: "user", content: input.trim(), attachments: attachments.length ? attachments : undefined };
      // The greeting is dictionary-backed; it is resolved to plain text (in the current language) once the conversation starts.
      const newMessages = [...messages.map(materialize), userMessage];
      setMessages(newMessages);
      setInput("");

      // 1️⃣ שיחת AI
      const res = await fetch("/api/chat/resume-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, userId }),
      });

      const data = await res.json();
      if (data.error) {
        appendMessage({
          role: "assistant",
          content: res.status === 429 ? t("resume.quotaReached") : t("resume.genericError"),
        });
        return;
      }

      let reply: string = data.reply || "";
      const readyToken = "###READY_TO_BUILD###";
      const shouldBuild = reply.includes(readyToken);
      reply = reply.replace(readyToken, "").trim();

      appendMessage({ role: "assistant", content: reply });

      // 2️⃣ אם ה-AI החליט שיש מספיק מידע → נייצר קורות חיים
      if (shouldBuild) {
        await buildAndDownloadResume([...newMessages, { role: "assistant", content: reply }]);
      }
    } catch (err) {
      console.error("❌ resume conversation error:", err);
      appendMessage({
        role: "assistant",
        content: t("resume.networkError"),
      });
    } finally {
      setLoading(false);
    }
  };

  const buildAndDownloadResume = async (conversation: Message[]) => {
    try {
      setLoading(true);
      appendMessage({
        role: "assistant",
        content: t("resume.building"),
      });

      // 1️⃣ יצירת structuredResume + score + issues
      const buildRes = await fetch("/api/chat/buildResume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          messages: conversation.map((m) => flatten(materialize(m), (name) => t("resume.attachedFile", { name }))),
          rawResumeText,
        }),
      });

      const buildData = await buildRes.json();
      if (buildData.error) {
        appendMessage({
          role: "assistant",
          content: t("resume.buildFailed"),
        });
        return;
      }

      setScore(buildData.score ?? null);
      setIssues(Array.isArray(buildData.issues) ? buildData.issues : []);
      setMatchReady(!!buildData.matchReady);

      // 2️⃣ יצירת PDF
      const pdfRes = await fetch("/api/chat/download-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ structuredResume: buildData.structuredResume }),
      });

      if (!pdfRes.ok) {
        appendMessage({
          role: "assistant",
          content: t("resume.pdfFailed"),
        });
        return;
      }

      const blob = await pdfRes.blob();
      const url = URL.createObjectURL(blob);
      // Revoke any previous object URL to avoid leaking blob memory.
      setDownloadUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });

      appendMessage({
        role: "assistant",
        content: t("resume.buildDone"),
      });
    } catch (err) {
      console.error("❌ build & download error:", err);
      appendMessage({
        role: "assistant",
        content: t("resume.buildError"),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  setLoading(true);
  setDownloadUrl(null);
  setScore(null);
  setIssues([]);

  try {
    // 1️⃣ העלאה וקריאת PDF
    const formData = new FormData();
    formData.append("resume", file);

    const res = await fetch("/api/chat/upload-resume", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (data.error) {
      appendMessage({
        role: "assistant",
        content: t("resume.uploadReadFailed"),
      });
      return;
    }

    const rawText = data.rawText || "";
    setRawResumeText(rawText);

    appendMessage({
      role: "assistant",
      content: t("resume.uploadReceived"),
    });

    // 2️⃣ בניית קורות חיים משופרים אוטומטית (buildResume)
    const buildRes = await fetch("/api/chat/buildResume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        messages: [{ role: "user", content: "Auto improve uploaded resume" }],
        rawResumeText: rawText,
      }),
    });

    const buildData = await buildRes.json();
    if (buildData.error) {
      appendMessage({
        role: "assistant",
        content: t("resume.improveFailed"),
      });
      return;
    }

    setScore(buildData.score ?? null);
    setIssues(buildData.issues ?? []);
    setMatchReady(!!(buildData.matchReady || data.matchReady));

    // 3️⃣ יצירת PDF משופר
    const pdfRes = await fetch("/api/chat/download-resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredResume: buildData.structuredResume,
      }),
    });

    if (!pdfRes.ok) {
      appendMessage({
        role: "assistant",
        content: t("resume.pdfFailed"),
      });
      return;
    }

    const blob = await pdfRes.blob();
    const url = URL.createObjectURL(blob);
    setDownloadUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });

    appendMessage({
      role: "assistant",
      content: t("resume.uploadDone"),
    });
  } catch (err) {
    console.error("❌ upload+improve error:", err);
    appendMessage({
      role: "assistant",
      content: t("resume.uploadError"),
    });
  } finally {
    setLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }
};


  const hasResult = score !== null || !!downloadUrl || matchReady;

  return (
    <div className="jm-page" dir={dir}>
      <PageHeader
        eyebrow="ResumeAI"
        title={t("resume.pageTitle")}
        subtitle={t("resume.pageSubtitle")}
      />

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        {/* Upload card */}
        <section className="jm-card p-5 sm:p-6 space-y-4">
          <input
            type="file"
            accept="application/pdf"
            ref={fileInputRef}
            onChange={handleUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="w-full rounded-card border-2 border-dashed border-line hover:border-teal hover:bg-teal-50/40 transition-colors p-8 sm:p-10 flex flex-col items-center gap-3 text-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="h-14 w-14 rounded-2xl bg-teal-50 text-teal flex items-center justify-center">
              <PdfGlyph />
            </span>
            <span className="text-base sm:text-lg font-semibold text-navy">{t("resume.uploadCta")}</span>
          </button>

          {hasResult && (
            <div className="space-y-4">
              {score !== null && (
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-navy">{t("resume.score", { score })}</div>
                  </div>
                  <div
                    className="mt-2 h-2 w-full rounded-full bg-line overflow-hidden"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={score}
                  >
                    <div className="h-full rounded-full bg-teal transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
                  </div>
                  {issues.length > 0 && (
                    <div className="jm-alert jm-alert-info mt-3">
                      <ul className="list-disc ps-5 space-y-1">
                        {issues.map((issue, idx) => (
                          <li key={idx} dir="auto">{issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {downloadUrl && (
                <a
                  href={downloadUrl}
                  download="Improved_Resume_ATS.pdf"
                  className="jm-btn jm-btn-primary w-full"
                >
                  {t("resume.download")}
                </a>
              )}

              {matchReady && (
                <div className="jm-alert jm-alert-ok space-y-3">
                  <p>{t("resume.savedForMatching")}</p>
                  <Link href="/jobs" className="jm-btn jm-btn-accent jm-btn-sm w-full">
                    {t("resume.seeMatchingJobs")}
                  </Link>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Chat card: files can be dropped anywhere on it */}
        <section
          className={`jm-card p-5 sm:p-6 flex flex-col relative transition-colors ${dragOver ? "ring-2 ring-teal bg-teal-50/30" : ""}`}
          onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
        >
          {dragOver && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-card bg-white/70 text-navy font-semibold">
              {t("resume.dropToAttach")}
            </div>
          )}
          <div ref={scrollRef} className="jm-scroll max-h-[60vh] min-h-[320px] overflow-y-auto space-y-3 pe-1">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  dir="auto"
                  className={`max-w-[85%] px-4 py-2.5 text-sm sm:text-base whitespace-pre-line break-words ${
                    msg.role === "user"
                      ? "bg-navy text-white rounded-2xl rounded-ee-sm"
                      : "bg-canvas border border-line text-ink rounded-2xl rounded-es-sm"
                  }`}
                >
                  {msg.attachments?.length ? (
                    <div className={`flex flex-wrap gap-1.5 ${msg.content ? "mb-2" : ""}`}>
                      {msg.attachments.map((a) => (
                        <span key={a.name} className="inline-flex items-center gap-1 rounded-full bg-white/15 border border-white/25 px-2.5 py-0.5 text-xs" title={`${t("resume.attachmentChars", { n: a.chars.toLocaleString() })}${a.truncated ? t("resume.attachmentTruncated") : ""}`}>
                          <FileGlyph />
                          <span dir="ltr" className="max-w-[180px] truncate">{a.name}</span>
                          {a.looksLikeResume && <span className="opacity-80">{t("resume.attachmentIsResume")}</span>}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {textOf(msg)}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-sm text-ink-400" role="status">
                <span className="h-4 w-4 rounded-full border-2 border-teal border-t-transparent animate-spin" />
                {pending.length ? t("resume.readingFiles") : t("resume.thinking")}
              </div>
            )}
          </div>

          {/* Files waiting to go with the next message */}
          {(pending.length > 0 || pendingError) && (
            <div className="mt-3 space-y-2">
              {pending.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pending.map((f, i) => (
                    <span key={`${f.name}-${f.size}`} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-3 py-1 text-xs text-ink">
                      <FileGlyph />
                      <span dir="ltr" className="max-w-[200px] truncate">{f.name}</span>
                      <span className="text-ink-400">{fmtSize(f.size)}</span>
                      <button type="button" onClick={() => removePending(i)} className="ms-1 text-ink-400 hover:text-navy" aria-label={t("resume.removeFile", { name: f.name })}>×</button>
                    </span>
                  ))}
                </div>
              )}
              {pendingError && <p className="text-xs text-red-600" role="alert">{pendingError}</p>}
            </div>
          )}

          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <input
              type="file"
              multiple
              accept={ACCEPT}
              ref={chatFileRef}
              onChange={(e) => addFiles(e.target.files)}
              className="hidden"
            />
            <div className="flex flex-1 gap-2">
              <button
                type="button"
                onClick={() => chatFileRef.current?.click()}
                disabled={loading}
                className="jm-btn jm-btn-ghost px-3 shrink-0"
                title={t("resume.attachTitle")}
                aria-label={t("resume.attachAria")}
              >
                <PaperclipGlyph />
              </button>
              <input
                className="jm-input flex-1"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={(e) => { if (e.clipboardData.files?.length) { e.preventDefault(); addFiles(e.clipboardData.files); } }}
                placeholder={pending.length ? t("resume.placeholderWithFiles") : t("resume.placeholder")}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              />
            </div>
            <button
              onClick={handleSend}
              disabled={loading || (!input.trim() && !pending.length)}
              className="jm-btn jm-btn-primary"
            >
              {t("resume.send")}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
