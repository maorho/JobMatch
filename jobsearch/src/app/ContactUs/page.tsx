"use client";
import { useEffect, useState } from "react";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";

export default function ContactUsPage() {
  const { user } = useCurrentUser();
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "", website: "" });
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) setForm((f) => ({ ...f, name: f.name || user.fullname || "", email: f.email || user.email || "" }));
  }, [user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.issues?.length ? `שדות לא תקינים: ${data.issues.join(", ")}` : data?.error || "השליחה נכשלה");
      setState("sent");
    } catch (err) {
      setError((err as Error).message);
      setState("error");
    }
  };

  const field = "w-full border border-[#232323]/15 rounded-[14px] px-4 py-3 text-sm focus:outline-none focus:border-[#24A8A2]";

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 font-outfit" dir="rtl">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr] gap-8">
        <div>
          <h1 className="text-2xl lg:text-[34px] font-semibold text-[#232323]">צור קשר</h1>
          <p className="text-[#232323]/70 mt-2 leading-relaxed">
            שאלה, באג, רעיון, או חברה שרוצה להתחבר למערכת? כתבו לנו ונחזור תוך יום עסקים.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-[#232323]/80">
            <li>🧑‍💼 <span className="font-medium">מגייסים:</span> פרסום משרות ומסרים ישירים למועמדים — פתחו חשבון מגייס.</li>
            <li>🏢 <span className="font-medium">חברות:</span> לא רואים את המשרות שלכם? שלחו לנו את כתובת דף הקריירה.</li>
            <li>🐞 <span className="font-medium">באגים:</span> תיאור קצר + מה ציפיתם שיקרה. צילום מסך עוזר.</li>
          </ul>
        </div>

        <div className="rounded-4xl border border-[#232323]/10 p-6">
          {state === "sent" ? (
            <div className="text-center py-10">
              <div className="text-4xl">✅</div>
              <h2 className="text-xl font-semibold text-[#232323] mt-3">ההודעה נשלחה</h2>
              <p className="text-[#232323]/60 mt-1">תודה! נחזור אליך למייל {form.email}.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input className={field} placeholder="שם מלא" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} />
                <input className={field} type="email" placeholder="אימייל" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required dir="ltr" />
              </div>
              <input className={field} placeholder="נושא (אופציונלי)" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              <textarea className={field} rows={6} placeholder="ההודעה שלך…" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required minLength={10} />
              {/* Honeypot — hidden from humans, filled by bots. */}
              <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="hidden" aria-hidden="true" />
              {error && <p className="text-sm text-red-600">⚠️ {error}</p>}
              <button type="submit" disabled={state === "sending"} className="w-full bg-[#24A8A2] hover:bg-[#1d8f8a] text-white py-3.5 rounded-[14px] transition disabled:opacity-60">
                {state === "sending" ? "שולח…" : "שלח הודעה"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
