"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import ContactsCard from "../components/ContactsCard";
import AutoApplyCard from "../components/AutoApplyCard";
import McpCard from "../components/McpCard";
import PartnerCard from "../components/PartnerCard";
import ChannelsCard from "../components/ChannelsCard";
import InsiderCard from "../components/InsiderCard";
import { PageHeader, Spinner, SignInGate } from "../components/ui";

type Profile = { username: string; email: string; fullname: string; phone: string; currentJob: string; company: string; recruiter: boolean; authProvider?: string; resumeScore?: number; resumeUpdatedAt?: string };

const card = "jm-card p-6 space-y-4";

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

  if (loading) return <Spinner label="טוען…" />;
  if (!user) return <SignInGate text="צריך להתחבר כדי לערוך הגדרות." next="/Settings" />;

  return (
    <div className="jm-page" dir="rtl">
      <PageHeader title="הגדרות חשבון" subtitle="פרופיל, קורות חיים, חיבורים ואבטחה" />
      <div className="max-w-3xl space-y-6">
        {msg && <div className={`jm-alert ${msg.kind === "ok" ? "jm-alert-ok" : "jm-alert-err"}`} role="status">{msg.text}</div>}

        {p && (
          <form onSubmit={saveProfile} className={card}>
            <h2 className="jm-h2">פרופיל</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block"><span className="jm-label">שם מלא</span><input className="jm-input" value={p.fullname || ""} onChange={(e) => setP({ ...p, fullname: e.target.value })} required /></label>
              <label className="block"><span className="jm-label">טלפון</span><input className="jm-input" value={p.phone || ""} onChange={(e) => setP({ ...p, phone: e.target.value })} dir="ltr" /></label>
              <label className="block"><span className="jm-label">תפקיד נוכחי</span><input className="jm-input" value={p.currentJob || ""} onChange={(e) => setP({ ...p, currentJob: e.target.value })} placeholder="למשל: Junior Frontend Developer" /></label>
              {p.recruiter && <label className="block"><span className="jm-label">חברה</span><input className="jm-input" value={p.company || ""} onChange={(e) => setP({ ...p, company: e.target.value })} /></label>}
            </div>
            <div className="jm-muted">
              אימייל: <span dir="ltr">{p.email}</span> · שם משתמש: {p.username}
              {p.authProvider && p.authProvider !== "local" && ` · מתחבר/ת דרך ${p.authProvider}`}
            </div>
            <div className="flex justify-start">
              <button className="jm-btn jm-btn-primary">שמור</button>
            </div>
          </form>
        )}

        <div className={card}>
          <h2 className="jm-h2">קורות חיים והתאמה</h2>
          <p className="text-sm text-ink-600 leading-relaxed">
            {p?.resumeUpdatedAt ? `קורות החיים עודכנו ב-${new Date(p.resumeUpdatedAt).toLocaleDateString("he-IL")}${p.resumeScore ? ` · ציון ${p.resumeScore}/100` : ""}.` : "עדיין לא העלית קורות חיים — הפיד לא מותאם אישית."}
          </p>
          <div>
            <Link href="/ResumeAI" className="jm-btn jm-btn-accent">לעדכן ב-ResumeAI</Link>
          </div>
        </div>

        <div className={card}>
          <h2 className="jm-h2">📬 מעקב סטטוס מהמייל (Gmail)</h2>
          <p className="text-sm text-ink-600 leading-relaxed">
            {gmail?.connected
              ? <>מחובר ל-<span dir="ltr">{gmail.address}</span>. הסוכן קורא (לקריאה בלבד) מיילים שקשורים למועמדויות שלך ומעדכן את הסטטוס בדשבורד.</>
              : "חבר/י את ה-Gmail כדי שזימונים לראיון, הצעות ודחיות יעדכנו את הסטטוס של המועמדויות אוטומטית. הרשאת קריאה בלבד; אפשר לנתק בכל רגע."}
          </p>
          {gmail?.connected ? (
            <div><button onClick={disconnectGmail} className="jm-btn jm-btn-secondary">נתק Gmail</button></div>
          ) : gmail?.configured ? (
            <div><a href="/api/integrations/gmail/connect" className="jm-btn jm-btn-accent">חבר Gmail</a></div>
          ) : (
            <p className="jm-muted">לא מוגדר בסביבה הזו (נדרשים GOOGLE_CLIENT_ID ו-TOKEN_ENCRYPTION_KEY).</p>
          )}
        </div>

        <div id="messaging" className={card}>
          <h2 className="jm-h2">💬 התאמות ועדכונים בוואטסאפ / טלגרם</h2>
          <ChannelsCard />
        </div>

        <div id="insider" className={card}>
          <h2 className="jm-h2">🧑‍💻 אני עובד/ת בחברת הייטק: להיות ממליץ/ה מבפנים</h2>
          <InsiderCard />
        </div>

        <div id="contacts" className={card}>
          <h2 className="jm-h2">🤝 אנשי קשר והפניות (LinkedIn)</h2>
          <ContactsCard />
        </div>

        <div id="auto-apply" className={card}>
          <h2 className="jm-h2">⚡ הגשה אוטומטית</h2>
          <AutoApplyCard />
        </div>

        <div id="partner" className={card}>
          <h2 className="jm-h2">🤝 תוכנית שותפים</h2>
          <PartnerCard current={user?.partner || null} />
        </div>

        <div id="mcp" className={card}>
          <h2 className="jm-h2">🔌 סוכני AI חיצוניים (MCP)</h2>
          <McpCard />
        </div>

        {(!p?.authProvider || p.authProvider === "local") && (
          <form onSubmit={changePassword} className={card}>
            <h2 className="jm-h2">שינוי סיסמה</h2>
            <input className="jm-input" type="password" placeholder="סיסמה נוכחית" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required dir="ltr" />
            <div className="grid sm:grid-cols-2 gap-4">
              <input className="jm-input" type="password" placeholder="סיסמה חדשה (8+ תווים)" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required minLength={8} dir="ltr" />
              <input className="jm-input" type="password" placeholder="אימות סיסמה חדשה" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} required minLength={8} dir="ltr" />
            </div>
            <div>
              <button className="jm-btn jm-btn-secondary">עדכן סיסמה</button>
            </div>
          </form>
        )}

        <div className={`${card} border-red-200`}>
          <h2 className="jm-h2 text-red-700">מחיקת חשבון</h2>
          <p className="text-sm text-ink-600 leading-relaxed">מוחק לצמיתות את החשבון, קורות החיים, המועמדויות, ההודעות וההתראות. אין דרך חזרה.</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input className="jm-input" placeholder='הקלד/י DELETE לאישור' value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} dir="ltr" />
            <button onClick={deleteAccount} disabled={confirmDelete !== "DELETE"} className="jm-btn jm-btn-danger shrink-0">מחק חשבון</button>
          </div>
        </div>
      </div>
    </div>
  );
}
