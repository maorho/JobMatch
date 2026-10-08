"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";

type Role = "user" | "assistant" | "system";

type Message = {
  role: Role;
  content: string;
};

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
        if (data?.user?._id) {
          setUserId(data.user._id);
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
    console.log("🚀 structuredResume:", buildData.structuredResume);
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


  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold mb-2 text-center">
        ResumeAI – בניית ושיפור קורות חיים
      </h1>
      <p className="text-center text-gray-600 text-sm mb-4">
        אתה יכול לנהל שיחה חופשית, להעלות קובץ קורות חיים קיים, או לבנות קורות חיים מאפס.
      </p>

      <div className="border rounded-lg p-4 h-[520px] overflow-y-auto bg-gray-50">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`mb-3 ${
              msg.role === "user" ? "text-right" : "text-left"
            }`}
          >
            <div
              className={`inline-block px-4 py-2 rounded-xl whitespace-pre-line ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-white border border-gray-200 text-gray-900"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="text-left text-gray-400 italic">המערכת חושבת…</div>
        )}

        {score !== null && (
          <div className="mt-4 bg-white border rounded-lg p-3 text-sm">
            <div className="font-semibold mb-1">
              ⭐ Resume Score: {score}/100
            </div>
            {issues.length > 0 && (
              <ul className="list-disc list-inside text-gray-700">
                {issues.map((issue, idx) => (
                  <li key={idx}>{issue}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {downloadUrl && (
          <div className="text-center mt-4">
            <a
              href={downloadUrl}
              download="Improved_Resume_ATS.pdf"
              className="inline-block px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded shadow text-sm"
            >
              📄 הורד קורות חיים משופרים (ATS Ready)
            </a>
          </div>
        )}
        {matchReady && (
          <div className="text-center mt-3 text-sm">
            <p className="text-gray-700 mb-2">
              🎯 קורות החיים שלך נשמרו — הפיד שלך עכשיו מותאם אישית אליהם.
            </p>
            <Link
              href="/"
              className="inline-block px-6 py-2 bg-[#11AEFF] hover:bg-[#0d8ed6] text-white rounded shadow text-sm"
            >
              ראה משרות שמתאימות לקורות החיים שלך
            </Link>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-2 text-sm"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="כתוב כאן שאלה או תיאור (למשל: 'אני מחפש משרת ג'וניור בפיתוח')..."
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
        />
        <button
          onClick={handleSend}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm disabled:opacity-60"
        >
          שלח
        </button>
        <input
          type="file"
          accept="application/pdf"
          ref={fileInputRef}
          onChange={handleUpload}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm disabled:opacity-60"
        >
          📄 העלה קו״ח
        </button>
      </div>
    </div>
  );
}
