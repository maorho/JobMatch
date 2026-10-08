"use client";
import { useEffect, useState } from "react";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import { PageHeader } from "../components/ui";

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

  return (
    <div className="jm-page" dir="rtl">
      <PageHeader
        title="צור קשר"
        subtitle="שאלה, באג, רעיון, או חברה שרוצה להתחבר למערכת? כתבו לנו ונחזור תוך יום עסקים."
      />

      <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
        <div className="jm-card p-5 sm:p-6">
          {state === "sent" ? (
            <div className="jm-alert jm-alert-ok text-center py-10">
              <div className="text-4xl">✅</div>
              <h2 className="jm-h2 mt-3">ההודעה נשלחה</h2>
              <p className="text-ink-600 mt-1">תודה! נחזור אליך למייל {form.email}.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="jm-label" htmlFor="contact-name">שם מלא</label>
                  <input id="contact-name" className="jm-input" placeholder="שם מלא" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} />
                </div>
                <div>
                  <label className="jm-label" htmlFor="contact-email">אימייל</label>
                  <input id="contact-email" className="jm-input" type="email" placeholder="אימייל" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required dir="ltr" />
                </div>
              </div>
              <div>
                <label className="jm-label" htmlFor="contact-subject">נושא (אופציונלי)</label>
                <input id="contact-subject" className="jm-input" placeholder="נושא (אופציונלי)" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              </div>
              <div>
                <label className="jm-label" htmlFor="contact-message">ההודעה שלך…</label>
                <textarea id="contact-message" className="jm-input" rows={6} placeholder="ההודעה שלך…" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required minLength={10} />
              </div>
              {/* Honeypot — hidden from humans, filled by bots. */}
              <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="hidden" aria-hidden="true" />
              {error && <div className="jm-alert jm-alert-err">⚠️ {error}</div>}
              <button type="submit" disabled={state === "sending"} className="jm-btn jm-btn-primary w-full">
                {state === "sending" ? "שולח…" : "שלח הודעה"}
              </button>
            </form>
          )}
        </div>

        <aside className="jm-card p-5 sm:p-6 space-y-5">
          <h2 className="jm-h2">איך נוכל לעזור?</h2>
          <ul className="space-y-4 text-sm text-ink-600 leading-relaxed">
            <li className="flex gap-3">
              <span className="h-9 w-9 shrink-0 rounded-xl bg-sky-50 flex items-center justify-center text-lg" aria-hidden="true">🧑‍💼</span>
              <span><span className="font-medium text-navy">מגייסים:</span> פרסום משרות ומסרים ישירים למועמדים — פתחו חשבון מגייס.</span>
            </li>
            <li className="flex gap-3">
              <span className="h-9 w-9 shrink-0 rounded-xl bg-sky-50 flex items-center justify-center text-lg" aria-hidden="true">🏢</span>
              <span><span className="font-medium text-navy">חברות:</span> לא רואים את המשרות שלכם? שלחו לנו את כתובת דף הקריירה.</span>
            </li>
            <li className="flex gap-3">
              <span className="h-9 w-9 shrink-0 rounded-xl bg-sky-50 flex items-center justify-center text-lg" aria-hidden="true">🐞</span>
              <span><span className="font-medium text-navy">באגים:</span> תיאור קצר + מה ציפיתם שיקרה. צילום מסך עוזר.</span>
            </li>
          </ul>
          <div className="border-t border-line pt-4 text-sm text-ink-600">
            <span className="jm-chip jm-chip-teal">זמן תגובה: עד יום עסקים</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
