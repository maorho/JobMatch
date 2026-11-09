"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import { readPushState, enablePush, disablePush, type PushState } from "../lib/push/client";
import { useT } from "../lib/i18n/LanguageProvider";

/**
 * "Get new matches on this device": the Web Push switch. `variant="banner"`
 * is the one-line nudge on the feed (dismissible, remembered per browser);
 * `variant="card"` is the Settings section.
 */
export default function PushCard({ variant = "card" }: { variant?: "card" | "banner" }) {
  const { user } = useCurrentUser();
  const { t, dir } = useT();
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
      <div className="jm-card p-3 sm:p-4 flex flex-wrap items-center gap-3 bg-teal-50/60" role="region" aria-label={t("settings.push")} dir={dir}>
        <Bell className="h-5 w-5 text-teal shrink-0" />
        <p className="text-sm text-navy flex-1 min-w-[12rem]">{t("home.pushBannerText")}</p>
        <button type="button" onClick={toggle} disabled={busy} className="jm-btn jm-btn-primary jm-btn-sm">{busy ? t("push.wait") : t("home.pushEnable")}</button>
        <button type="button" onClick={dismiss} className="jm-btn jm-btn-ghost jm-btn-sm">{t("home.notNow")}</button>
        {msg && <p className="w-full text-xs text-red-700">{msg}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-3" dir={dir}>
      <p className="text-sm text-ink-600 leading-relaxed">
        {t("push.cardText")}
        {state.permission === "denied" && <span className="block mt-1 text-red-700">{t("push.denied")}</span>}
      </p>
      <div className="flex items-center gap-3">
        <button type="button" onClick={toggle} disabled={busy || state.permission === "denied"} className={`jm-btn ${state.subscribed ? "jm-btn-secondary" : "jm-btn-primary"} inline-flex items-center gap-2`}>
          {state.subscribed ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          {busy ? t("push.wait") : state.subscribed ? t("push.disable") : t("push.enable")}
        </button>
        {state.subscribed && <span className="jm-chip jm-chip-teal">{t("push.active")}</span>}
      </div>
      {msg && <p className="text-sm text-red-700">{msg}</p>}
    </div>
  );
}
