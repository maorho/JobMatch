"use client";
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { BadgeCheck, Mail } from "lucide-react";

type Profile = { _id: string; company: string; title: string; workEmail: string; verified: boolean; active: boolean; capacity: number; note: string; open: number; stats: { requests: number; accepted: number; submitted: number; declined: number } };
const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));

/** Settings: register as an insider at your company (verified by a code sent to your work email) and manage capacity. */
export default function InsiderCard() {
  const { data, mutate } = useSWR<{ profiles: Profile[] }>("/api/referrals/insiders", fetcher);
  const { data: companies } = useSWR<{ companies: { name: string; domain: string }[] }>("/api/companies?limit=400", fetcher, { revalidateOnFocus: false });
  const [form, setForm] = useState({ company: "", title: "", workEmail: "", note: "" });
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);

  const register = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("register");
    setMsg(null);
    const r = await fetch("/api/referrals/insiders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const j = await r.json().catch(() => null);
    setBusy("");
    if (!r.ok || !j?.ok) {
      setMsg({ kind: "err", text: j?.error === "domain_mismatch" ? "כתובת המייל צריכה להיות על הדומיין של החברה (לא Gmail וכדומה)." : j?.error === "bad_email" ? "כתובת מייל לא תקינה." : "לא הצלחנו לרשום. נסו שוב." });
      return;
    }
    setMsg({ kind: j.sent ? "ok" : "info", text: j.sent ? `שלחנו קוד אימות ל-${form.workEmail}. הזינו אותו למטה.` : `אין ספק מיילים בסביבה הזו. קוד לבדיקה מקומית: ${j.devCode || "(לא זמין)"}` });
    mutate();
  };

  const verify = async (p: Profile) => {
    setBusy(p._id);
    const r = await fetch("/api/referrals/insiders", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company: p.company, code: codes[p._id] || "" }) });
    const j = await r.json().catch(() => null);
    setBusy("");
    setMsg(j?.ok ? { kind: "ok", text: `אומת. מעכשיו מועמדים ל-${p.company} יכולים לבקש ממך הפניה.` } : { kind: "err", text: j?.error === "expired" ? "הקוד פג. בקשו קוד חדש." : "קוד לא נכון." });
    mutate();
  };

  const update = async (p: Profile, patch: Record<string, unknown>) => {
    setBusy(p._id);
    await fetch("/api/referrals/insiders", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company: p.company, ...patch }) });
    setBusy("");
    mutate();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600 leading-relaxed">
        &quot;חבר מביא חבר&quot; הוא ערוץ הגיוס שעובד. אם את/ה עובד/ת בחברה, אפשר להירשם כממליץ/ה מבפנים: מועמדים שמתאימים למשרה פתוחה אצלכם יוכלו לבקש ממך הפניה, ואת/ה מחליט/ה למי לעזור. השם המלא והמייל שלך לא נחשפים למועמדים, רק שם פרטי ותפקיד.
      </p>

      {data?.profiles?.map((p) => (
        <div key={p._id} className="rounded-control border border-line p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-semibold text-navy">{p.company}{p.title ? ` · ${p.title}` : ""}</div>
              <div className="jm-muted" dir="ltr">{p.workEmail}</div>
            </div>
            {p.verified ? <span className="jm-chip jm-chip-teal"><BadgeCheck className="h-3 w-3" /> מאומת</span> : <span className="jm-chip"><Mail className="h-3 w-3" /> ממתין לאימות</span>}
          </div>
          {!p.verified ? (
            <div className="flex flex-wrap items-center gap-2">
              <input value={codes[p._id] || ""} onChange={(e) => setCodes({ ...codes, [p._id]: e.target.value })} inputMode="numeric" maxLength={6} placeholder="קוד בן 6 ספרות" className="jm-input w-40 font-mono tracking-widest" dir="ltr" />
              <button onClick={() => verify(p)} disabled={busy === p._id || (codes[p._id] || "").length !== 6} className="jm-btn jm-btn-primary jm-btn-sm">אמת</button>
              <button onClick={() => { setForm({ company: p.company, title: p.title, workEmail: p.workEmail, note: p.note }); }} className="jm-btn jm-btn-ghost jm-btn-sm">שלח קוד חדש</button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <label className="inline-flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={p.active} onChange={(e) => update(p, { active: e.target.checked })} className="accent-teal h-4 w-4" /> פעיל/ה</label>
              <label className="inline-flex items-center gap-2">עד <input type="number" min={1} max={50} value={p.capacity} onChange={(e) => update(p, { capacity: Number(e.target.value) })} className="jm-input w-20 py-1" /> בקשות פתוחות</label>
              <span className="jm-muted">{p.open} פתוחות · {p.stats?.submitted || 0} הוגשו · {p.stats?.declined || 0} נדחו</span>
              <Link href="/referrals" className="jm-btn jm-btn-secondary jm-btn-sm ms-auto">לתיבת ההפניות</Link>
            </div>
          )}
        </div>
      ))}

      <form onSubmit={register} className="grid sm:grid-cols-2 gap-3">
        <input list="insider-companies" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} required placeholder="החברה (כמו שמופיעה בקטלוג)" className="jm-input" />
        <datalist id="insider-companies">{(companies?.companies || []).map((c) => <option key={c.name} value={c.name} />)}</datalist>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="התפקיד שלך (למשל Backend Developer)" className="jm-input" />
        <input type="email" value={form.workEmail} onChange={(e) => setForm({ ...form, workEmail: e.target.value })} required placeholder="מייל עבודה (you@company.com)" className="jm-input" dir="ltr" />
        <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="הערה למועמדים (אופציונלי): מה את/ה ממליץ/ה, מה חשוב לך בהודעה" className="jm-input" />
        <div className="sm:col-span-2 flex items-center gap-3">
          <button type="submit" disabled={busy === "register"} className="jm-btn jm-btn-primary">{busy === "register" ? "שולח…" : "שלח/י לי קוד אימות"}</button>
          <span className="jm-muted">הקוד נשלח רק לכתובת על הדומיין של החברה.</span>
        </div>
      </form>
      {msg && <p className={`jm-alert ${msg.kind === "ok" ? "jm-alert-ok" : msg.kind === "err" ? "jm-alert-err" : "jm-alert-info"}`}>{msg.text}</p>}
    </div>
  );
}
