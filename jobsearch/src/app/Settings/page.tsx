"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";

type Profile = { username: string; email: string; fullname: string; phone: string; currentJob: string; company: string; recruiter: boolean; authProvider?: string; resumeScore?: number; resumeUpdatedAt?: string };

const field = "w-full border border-[#232323]/15 rounded-[14px] px-4 py-3 text-sm focus:outline-none focus:border-[#24A8A2]";
const card = "rounded-4xl border border-[#232323]/10 p-6 space-y-4";

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading, mutateUser } = useCurrentUser();
  const [p, setP] = useState<Profile | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", again: "" });
  const [confirmDelete, setConfirmDelete] = useState("");

  const [gmail, setGmail] = useState<{ connected: boolean; address: string; lastSyncAt: string | null; configured: boolean } | null>(null);
  const loadGmail = () => fetch("/api/integrations/gmail").then(async (r) => r.ok && setGmail(await r.json()));

  useEffect(() => {
    if (!user) return;
    fetch("/api/settings/profile").then(async (r) => r.ok && setP((await r.json()).user));
    // After the Gmail status loads, surface the consent flow's outcome
    // (the callback redirects here with ?gmail=...).
    loadGmail().then(() => {
      const outcome = new URLSearchParams(window.location.search).get("gmail");
      const text: Record<string, [kind: "ok" | "err", text: string]> = {
        connected: ["ok", "Gmail חובר — הסטטוס של המועמדויות יתעדכן מהמיילים"],
        denied: ["err", "החיבור ל-Gmail בוטל"],
        state: ["err", "החיבור פג — נסה/י שוב"],
        failed: ["err", "החיבור ל-Gmail נכשל"],
        no_refresh_token: ["err", "Google לא החזיר הרשאה קבועה — הסר/י את JobMatch מהרשאות חשבון Google ונסה/י שוב"],
        not_configured: ["err", "חיבור Gmail עדיין לא מוגדר בסביבה הזו"],
      };
      if (outcome && text[outcome]) {
        setMsg({ kind: text[outcome][0], text: text[outcome][1] });
        window.history.replaceState(null, "", "/Settings");
      }
    });
  }, [user]);

  const disconnectGmail = async () => {
    const r = await fetch("/api/integrations/gmail", { method: "DELETE" });
    if (!r.ok) return flash("err", "הניתוק נכשל");
    loadGmail();
    flash("ok", "Gmail נותק");
  };

  const flash = (kind: "ok" | "err", text: string) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 4000); };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!p) return;
    const r = await fetch("/api/settings/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullname: p.fullname, phone: p.phone, currentJob: p.currentJob, company: p.company }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return flash("err", d?.error || "השמירה נכשלה");
    setP(d.user);
    mutateUser();
    flash("ok", "הפרופיל נשמר");
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.newPassword !== pw.again) return flash("err", "הסיסמאות אינן זהות");
    const r = await fetch("/api/settings/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: pw.currentPassword, newPassword: pw.newPassword }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return flash("err", d?.error || "שינוי הסיסמה נכשל");
    setPw({ currentPassword: "", newPassword: "", again: "" });
    flash("ok", "הסיסמה עודכנה");
  };

  const deleteAccount = async () => {
    const r = await fetch("/api/settings/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: confirmDelete }) });
    if (!r.ok) return flash("err", "המחיקה נכשלה");
    router.push("/");
    router.refresh();
  };

  if (loading) return <p className="text-center mt-10 font-outfit">טוען…</p>;
  if (!user) {
    return (
      <div className="text-center mt-10 font-outfit">
        <p className="text-red-500">צריך להתחבר כדי לערוך הגדרות.</p>
        <Link href="/Login" className="text-[#11AEFF] underline">התחברות</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 font-outfit space-y-6" dir="rtl">
      <h1 className="text-2xl lg:text-[34px] font-semibold text-[#232323]">הגדרות חשבון</h1>
      {msg && <div className={`rounded-[14px] px-4 py-3 text-sm ${msg.kind === "ok" ? "bg-[#24A8A2]/10 text-[#1d8f8a]" : "bg-red-50 text-red-700"}`}>{msg.text}</div>}

      {p && (
        <form onSubmit={saveProfile} className={card}>
          <h2 className="text-lg font-semibold text-[#232323]">פרופיל</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-sm text-[#232323]/70">שם מלא<input className={field} value={p.fullname || ""} onChange={(e) => setP({ ...p, fullname: e.target.value })} required /></label>
            <label className="text-sm text-[#232323]/70">טלפון<input className={field} value={p.phone || ""} onChange={(e) => setP({ ...p, phone: e.target.value })} dir="ltr" /></label>
            <label className="text-sm text-[#232323]/70">תפקיד נוכחי<input className={field} value={p.currentJob || ""} onChange={(e) => setP({ ...p, currentJob: e.target.value })} placeholder="למשל: Junior Frontend Developer" /></label>
            {p.recruiter && <label className="text-sm text-[#232323]/70">חברה<input className={field} value={p.company || ""} onChange={(e) => setP({ ...p, company: e.target.value })} /></label>}
          </div>
          <div className="text-xs text-[#232323]/50">
            אימייל: <span dir="ltr">{p.email}</span> · שם משתמש: {p.username}
            {p.authProvider && p.authProvider !== "local" && ` · מתחבר/ת דרך ${p.authProvider}`}
          </div>
          <button className="bg-[#24A8A2] hover:bg-[#1d8f8a] text-white px-6 py-3 rounded-[14px] transition">שמור</button>
        </form>
      )}

      <div className={card}>
        <h2 className="text-lg font-semibold text-[#232323]">קורות חיים והתאמה</h2>
        <p className="text-sm text-[#232323]/70">
          {p?.resumeUpdatedAt ? `קורות החיים עודכנו ב-${new Date(p.resumeUpdatedAt).toLocaleDateString("he-IL")}${p.resumeScore ? ` · ציון ${p.resumeScore}/100` : ""}.` : "עדיין לא העלית קורות חיים — הפיד לא מותאם אישית."}
        </p>
        <Link href="/ResumeAI" className="inline-block bg-[#11AEFF] hover:bg-[#0d8ed6] text-white px-5 py-3 rounded-[14px] text-sm transition">לעדכן ב-ResumeAI</Link>
      </div>

      <div className={card}>
        <h2 className="text-lg font-semibold text-[#232323]">📬 מעקב סטטוס מהמייל (Gmail)</h2>
        <p className="text-sm text-[#232323]/70">
          {gmail?.connected
            ? <>מחובר ל-<span dir="ltr">{gmail.address}</span>. הסוכן קורא (לקריאה בלבד) מיילים שקשורים למועמדויות שלך ומעדכן את הסטטוס בדשבורד.</>
            : "חבר/י את ה-Gmail כדי שזימונים לראיון, הצעות ודחיות יעדכנו את הסטטוס של המועמדויות אוטומטית. הרשאת קריאה בלבד; אפשר לנתק בכל רגע."}
        </p>
        {gmail?.connected ? (
          <button onClick={disconnectGmail} className="border border-[#232323]/20 text-[#232323] px-6 py-3 rounded-[14px] hover:bg-[#F9F9F9] transition">נתק Gmail</button>
        ) : gmail?.configured ? (
          <a href="/api/integrations/gmail/connect" className="inline-block bg-[#11AEFF] hover:bg-[#0d8ed6] text-white px-5 py-3 rounded-[14px] text-sm transition">חבר Gmail</a>
        ) : (
          <p className="text-xs text-[#232323]/50">לא מוגדר בסביבה הזו (נדרשים GOOGLE_CLIENT_ID ו-TOKEN_ENCRYPTION_KEY).</p>
        )}
      </div>

      {(!p?.authProvider || p.authProvider === "local") && (
        <form onSubmit={changePassword} className={card}>
          <h2 className="text-lg font-semibold text-[#232323]">שינוי סיסמה</h2>
          <input className={field} type="password" placeholder="סיסמה נוכחית" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required dir="ltr" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input className={field} type="password" placeholder="סיסמה חדשה (8+ תווים)" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required minLength={8} dir="ltr" />
            <input className={field} type="password" placeholder="אימות סיסמה חדשה" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} required minLength={8} dir="ltr" />
          </div>
          <button className="border border-[#232323]/20 text-[#232323] px-6 py-3 rounded-[14px] hover:bg-[#F9F9F9] transition">עדכן סיסמה</button>
        </form>
      )}

      <div className={`${card} border-red-200`}>
        <h2 className="text-lg font-semibold text-red-700">מחיקת חשבון</h2>
        <p className="text-sm text-[#232323]/70">מוחק לצמיתות את החשבון, קורות החיים, המועמדויות, ההודעות וההתראות. אין דרך חזרה.</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input className={field} placeholder='הקלד/י DELETE לאישור' value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} dir="ltr" />
          <button onClick={deleteAccount} disabled={confirmDelete !== "DELETE"} className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-[14px] transition disabled:opacity-40 whitespace-nowrap">מחק חשבון</button>
        </div>
      </div>
    </div>
  );
}
