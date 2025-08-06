"use client";

import { useState, useRef } from "react";

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
};

export default function ResumeChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "system",
      content:
        "אתה עוזר AI מקצועי שמסייע בשכתוב קורות חיים בצורה שתעבור סינון אוטומטי (ATS) ותמשוך מגייסים.",
    },
    {
      role: "assistant",
      content: 'היי! האם הקו"ח שאתה מעלה מיועדים למשרה מסוימת או לשימוש כללי?',
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloadLink, setDownloadLink] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const newMessages = [
      ...messages,
      { role: "user", content: input } as const,
    ];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat/buildResume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });

      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "✅ סיימתי לשפר את הקו״ח. הנה הקובץ שלך!",
        } as const,
      ]);

      if (data.structuredResume) {
        generateAndDownloadPdf(data.structuredResume);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "⚠️ שגיאה בשרת. נסה שוב.",
        } as const,
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("resume", file);

      const res = await fetch("/api/chat/upload-resume", {
        method: "POST",
        body: formData,
      });

      const { rawText } = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `raw_resume_text::${rawText}`,
        } as const,
        {
          role: "assistant",
          content: "הקובץ התקבל. האם הקו״ח מותאמים למשרה מסוימת או כלליים?",
        } as const,
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "⚠️ שגיאה בהעלאת הקובץ. נסה שוב.",
        } as const,
      ]);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const generateAndDownloadPdf = async (structuredResume: any) => {
    try {
      const res = await fetch("/api/chat/download-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ structuredResume }),
      });

      if (!res.ok) throw new Error("PDF creation failed");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      setDownloadLink(url);
    } catch (err) {
      console.error("❌ Error generating PDF:", err);
    }
  };

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
            <div
              className={`inline-block px-4 py-2 rounded-xl ${
                msg.role === "user"
                  ? "bg-blue-500 text-white"
                  : msg.role === "assistant"
                  ? "bg-gray-200"
                  : "text-sm text-gray-500 italic"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="text-left text-gray-400 italic">כותב...</div>
        )}
        {downloadLink && (
          <div className="text-center mt-4">
            <a
              href={downloadLink}
              download="Improved_Resume.pdf"
              className="inline-block px-6 py-2 bg-green-600 text-white rounded shadow"
            >
              📄 הורד קובץ קורות חיים משופר
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
