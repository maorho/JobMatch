"use client";

import { useState, useRef } from "react";

type Role = "user" | "assistant" | "system";

type Message = {
  role: Role;
  content: string;
};

export default function ResumeAI() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "היי! אני ResumeAI 🤖\nתעלה קובץ קורות חיים בפורמט PDF, ואחר כך אעשה איתך שיחה קצרה כדי לשפר אותם בצורה הכי טובה עבורך.",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [rawResumeText, setRawResumeText] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // מזהה אם המשתמש ביקש במפורש לייצר קובץ משופר
  function userRequestedBuild(text: string) {
    const triggers = [
      "תבנה",
      "תייצר",
      "תוציא",
      "תייצר קובץ",
      "תוציא קובץ",
      "יאללה תבנה",
      "תוציא לי קורות חיים",
      "סיימתי",
      "אפשר את הקובץ",
    ];
    return triggers.some((t) => text.includes(t));
  }

  async function sendMessage() {
    if (!input.trim()) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];

    setMessages(newMessages);
    setInput("");
    setLoading(true);

    // אם המשתמש מבקש במפורש – נייצר אחרי התגובה
    const explicitBuildRequest = userRequestedBuild(userMsg.content);

    try {
      const res = await fetch("/api/chat/resume-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });

      const data = await res.json();
      const replyText: string = data.reply ?? "";

      const shouldAutoBuild =
        replyText.includes("###READY_TO_BUILD###") || explicitBuildRequest;

      const cleanReply = replyText.replace("###READY_TO_BUILD###", "").trim();

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: cleanReply },
      ]);

      // אם יש קובץ קורות חיים והגיע הזמן – נתחיל תהליך בנייה
      if (shouldAutoBuild && rawResumeText) {
        await buildAndDownloadResume(rawResumeText, [...newMessages, { role: "assistant", content: cleanReply }]);
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "⚠️ קרתה שגיאה בעיבוד השיחה. נסה שוב עוד רגע.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setDownloadUrl(null);

    try {
      const formData = new FormData();
      formData.append("resume", file);

      const res = await fetch("/api/chat/upload-resume", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setRawResumeText(data.rawText);

      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: "RESUME_UPLOADED",
        },
        {
          role: "assistant",
          content:
            "קיבלתי את הקורות חיים שלך ✅\nתרצה שנשפר אותם לשימוש כללי, או למשרה ספציפית? אם למשרה – תכתוב גם את התפקיד, לינק (אם יש) ודגשים חשובים.",
        },
      ]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "⚠️ קרתה שגיאה בקריאת הקובץ. נסה שוב עם PDF תקין.",
        },
      ]);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function buildAndDownloadResume(
    resumeText: string,
    conversationMessages: Message[]
  ) {
    try {
      setLoading(true);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "מעבד את קורות החיים שלך ובונה גרסה משופרת... ⏳",
        },
      ]);

      // 1) בניית JSON משופר
      const buildRes = await fetch("/api/chat/buildResume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawResumeText: resumeText,
          messages: conversationMessages,
        }),
      });

      const buildData = await buildRes.json();

      if (!buildRes.ok || !buildData.structuredResume) {
        throw new Error(buildData.error || "Failed to build resume JSON");
      }

      // 2) יצירת PDF מה-JSON
      const pdfRes = await fetch("/api/chat/download-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ structuredResume: buildData.structuredResume }),
      });

      if (!pdfRes.ok) {
        throw new Error("Failed to generate PDF");
      }

      const blob = await pdfRes.blob();
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "סיימתי! ✨ הנה קובץ קורות החיים המשופר שלך להורדה.",
        },
      ]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "⚠️ קרתה שגיאה בזמן יצירת הקובץ המשופר. נסה שוב עוד רגע, או העלה מחדש את הקובץ.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="border rounded-lg p-4 h-[500px] overflow-y-auto bg-gray-50">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`mb-3 ${
              msg.role === "user" ? "text-right" : "text-left"
            }`}
          >
            {msg.role !== "system" && (
              <div
                className={`inline-block px-4 py-2 rounded-xl ${
                  msg.role === "user"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200"
                }`}
              >
                {msg.content}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="text-left text-gray-400 italic">מעבד... ⏳</div>
        )}
        {downloadUrl && (
          <div className="text-center mt-4">
            <a
              href={downloadUrl}
              download="Improved_Resume.pdf"
              className="inline-block px-6 py-2 bg-green-600 text-white rounded shadow"
            >
              📄 הורד קורות חיים משופרים
            </a>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-2"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="כתוב כאן..."
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />
        <button
          onClick={sendMessage}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          שלח
        </button>
        <input
          type="file"
          accept="application/pdf"
          onChange={handleUpload}
          ref={fileInputRef}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          📄 העלה קו״ח
        </button>
      </div>
    </div>
  );
}
