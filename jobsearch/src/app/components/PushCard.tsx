"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import { readPushState, enablePush, disablePush, type PushState } from "../lib/push/client";

/**
 * "Get new matches on this device": the Web Push switch. `variant="banner"`
 * is the one-line nudge on the feed (dismissible, remembered per browser);
 * `variant="card"` is the Settings section.
 */
export default function PushCard({ variant = "card" }: { variant?: "card" | "banner" }) {
  const { user } = useCurrentUser();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!user) return;
    readPushState().then(setState).catch(() => setState(null));
    try {
      setDismissed(localStorage.getItem("jm:push-banner") === "dismissed");
    } catch {
      setDismissed(false);
    }
  }, [user]);

  if (!user || !state || !state.supported || !state.configured) return null;
  if (variant === "banner" && (state.subscribed || state.permission === "denied" || dismissed)) return null;

  const toggle = async () => {
    setBusy(true);
    setMsg("");
    try {
      setState(state.subscribed ? await disablePush() : await enablePush());
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const dismiss = () => {
    try {
      localStorage.setItem("jm:push-banner", "dismissed");
    } catch {}
    setDismissed(true);
  };

  if (variant === "banner") {
    return (
      <div className="jm-card p-3 sm:p-4 flex flex-wrap items-center gap-3 bg-teal-50/60" role="region" aria-label="התראות" dir="rtl">
        <Bell className="h-5 w-5 text-teal shrink-0" />
        <p className="text-sm text-navy flex-1 min-w-[12rem]">רוצה לדעת כשמשרה חדשה מתאימה לך? נשלח התראה למכשיר הזה, בלי מייל ובלי אפליקציה.</p>
        <button type="button" onClick={toggle} disabled={busy} className="jm-btn jm-btn-primary jm-btn-sm">{busy ? "רגע…" : "הפעל התראות"}</button>
        <button type="button" onClick={dismiss} className="jm-btn jm-btn-ghost jm-btn-sm">לא עכשיו</button>
        {msg && <p className="w-full text-xs text-red-700">{msg}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-3" dir="rtl">
      <p className="text-sm text-ink-600 leading-relaxed">
        התראות בדפדפן על משרות חדשות שמתאימות לך ועל עדכונים במועמדויות, ישירות למכשיר הזה. עובד גם בטלפון כשהאתר מותקן כאפליקציה.
        {state.permission === "denied" && <span className="block mt-1 text-red-700">ההתראות חסומות בדפדפן הזה. אפשר לפתוח אותן בהגדרות האתר של הדפדפן.</span>}
      </p>
      <div className="flex items-center gap-3">
        <button type="button" onClick={toggle} disabled={busy || state.permission === "denied"} className={`jm-btn ${state.subscribed ? "jm-btn-secondary" : "jm-btn-primary"} inline-flex items-center gap-2`}>
          {state.subscribed ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          {busy ? "רגע…" : state.subscribed ? "כבה התראות במכשיר הזה" : "הפעל התראות במכשיר הזה"}
        </button>
        {state.subscribed && <span className="jm-chip jm-chip-teal">פעיל</span>}
      </div>
      {msg && <p className="text-sm text-red-700">{msg}</p>}
    </div>
  );
}
