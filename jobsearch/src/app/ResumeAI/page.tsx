"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { PageHeader } from "../components/ui";

type Role = "user" | "assistant" | "system";

type Message = {
  role: Role;
  content: string;
};

const PdfGlyph = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M9 13h6M9 17h6" />
  </svg>
);

export default function ResumeAIPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "היי, אני ResumeAI 🤖\nאני אעזור לך לבנות או לשפר קורות חיים – גם אם אין לך קובץ מוכן.\nתוכל לספר לי קצת על עצמך, או להעלות קובץ קורות חיים קיים.",
    },
  ]);
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

  const appendMessage = (msg: Message) =>
    setMessages((prev) => [...prev, msg]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMessage: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMessage];

    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setDownloadUrl(null); // אם יש PDF קודם – נסתיר אותו
    setScore(null);
    setIssues([]);

    try {
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
          content: "⚠️ אירעה שגיאה. נסה שוב בעוד רגע.",
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
        content: "⚠️ שגיאה בתקשורת עם השרת. נסה שוב.",
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
        content: "מעולה! אני בונה עכשיו עבורך קורות חיים משופרים באנגלית…",
      });

      // 1️⃣ יצירת structuredResume + score + issues
      const buildRes = await fetch("/api/chat/buildResume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          messages: conversation,
          rawResumeText,
        }),
      });

      const buildData = await buildRes.json();
      if (buildData.error) {
        appendMessage({
          role: "assistant",
          content: "⚠️ לא הצלחתי לבנות קורות חיים. נסה שוב מאוחר יותר.",
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
          content: "⚠️ הייתה בעיה ביצירת קובץ ה-PDF.",
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
        content:
          "📄 סיימתי לבנות את קורות החיים המשופרים שלך! אפשר להוריד אותם בלחיצה על הכפתור למטה.",
      });
    } catch (err) {
      console.error("❌ build & download error:", err);
      appendMessage({
        role: "assistant",
        content: "⚠️ אירעה שגיאה בתהליך הבנייה. נסה שוב.",
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
        content: "⚠️ שגיאה בקריאת קובץ ה-PDF. נסה קובץ אחר.",
      });
      return;
    }

    const rawText = data.rawText || "";
    setRawResumeText(rawText);

    appendMessage({
      role: "assistant",
      content: "📄 קיבלתי את קובץ הקורות חיים. משפר אותם עבורך עכשיו…",
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
        content:
          "⚠️ לא הצלחתי לשפר את קובץ הקו״ח. נסה שוב בעוד רגע.",
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
        content: "⚠️ הייתה בעיה ביצירת קובץ ה-PDF.",
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
      content:
        "✨ סיימתי לשפר את קורות החיים שהעלית! אפשר להוריד אותם עכשיו בלחיצה על הכפתור למטה.",
    });
  } catch (err) {
    console.error("❌ upload+improve error:", err);
    appendMessage({
      role: "assistant",
      content: "⚠️ שגיאה בעיבוד הקובץ. נסה שוב.",
    });
  } finally {
    setLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }
};


  const hasResult = score !== null || !!downloadUrl || matchReady;

  return (
    <div className="jm-page" dir="rtl">
      <PageHeader
        eyebrow="ResumeAI"
        title="ResumeAI – בניית ושיפור קורות חיים"
        subtitle="אתה יכול לנהל שיחה חופשית, להעלות קובץ קורות חיים קיים, או לבנות קורות חיים מאפס."
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
            <span className="text-base sm:text-lg font-semibold text-navy">📄 העלה קו״ח</span>
          </button>

          {hasResult && (
            <div className="space-y-4">
              {score !== null && (
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-navy">⭐ Resume Score: {score}/100</div>
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
                  📄 הורד קורות חיים משופרים (ATS Ready)
                </a>
              )}

              {matchReady && (
                <div className="jm-alert jm-alert-ok space-y-3">
                  <p>🎯 קורות החיים שלך נשמרו — הפיד שלך עכשיו מותאם אישית אליהם.</p>
                  <Link href="/" className="jm-btn jm-btn-accent jm-btn-sm w-full">
                    ראה משרות שמתאימות לקורות החיים שלך
                  </Link>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Chat card */}
        <section className="jm-card p-5 sm:p-6 flex flex-col">
          <div className="jm-scroll max-h-[60vh] min-h-[320px] overflow-y-auto space-y-3 pe-1">
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
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-sm text-ink-400" role="status">
                <span className="h-4 w-4 rounded-full border-2 border-teal border-t-transparent animate-spin" />
                המערכת חושבת…
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <input
              className="jm-input flex-1"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="כתוב כאן שאלה או תיאור (למשל: 'אני מחפש משרת ג'וניור בפיתוח')..."
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            />
            <button
              onClick={handleSend}
              disabled={loading}
              className="jm-btn jm-btn-primary"
            >
              שלח
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
