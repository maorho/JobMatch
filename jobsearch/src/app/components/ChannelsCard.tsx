"use client";
import { useState } from "react";
import useSWR from "swr";
import { MessageCircle, Send, Check, Copy } from "lucide-react";
import { useT } from "../lib/i18n/LanguageProvider";

type Link = { id: string; label: string; linkedAt: string } | null;
type Data = { whatsapp: Link; telegram: Link; prefs: { matches: boolean; updates: boolean }; code: string; configured: { whatsapp: boolean; telegram: boolean }; whatsappNumber: string; telegramBot: string };
const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));

/** Settings: get matches and updates on WhatsApp / Telegram. Linking is done from the person's own phone with a short code. */
export default function ChannelsCard() {
  const { t } = useT();
  const { data, mutate } = useSWR<Data>("/api/settings/channels", fetcher, { refreshInterval: 5000 });
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState(false);
  const [testResult, setTestResult] = useState<string>("");
  if (!data) return <p className="jm-muted">{t("common.loading")}</p>;

  const post = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    const r = await fetch("/api/settings/channels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    setBusy("");
    if (j?.test) setTestResult(Object.values(j.test).some(Boolean) ? t("settings.ch.sent") : t("settings.ch.notSent"));
    mutate();
  };
  const waText = encodeURIComponent(`JOIN ${data.code}`);
  const waHref = data.whatsappNumber ? `https://wa.me/${data.whatsappNumber.replace(/[^\d]/g, "")}?text=${waText}` : "";
  const tgHref = data.telegramBot ? `https://t.me/${data.telegramBot}?start=${data.code}` : "";
  const anyLinked = !!(data.whatsapp || data.telegram);

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600 leading-relaxed">{t("settings.ch.intro")}</p>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-control border border-line p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-navy inline-flex items-center gap-2"><MessageCircle className="h-4 w-4 text-teal" /> WhatsApp</span>
            {data.whatsapp ? <span className="jm-chip jm-chip-teal"><Check className="h-3 w-3" /> {t("settings.ch.connected")}</span> : <span className="jm-chip">{t("settings.ch.notConnected")}</span>}
          </div>
          {data.whatsapp ? (
            <>
              <p className="jm-muted" dir="ltr">+{data.whatsapp.id}{data.whatsapp.label ? ` · ${data.whatsapp.label}` : ""}</p>
              <button onClick={() => post({ unlink: "whatsapp" }, "wa")} disabled={busy === "wa"} className="jm-btn jm-btn-ghost jm-btn-sm">{t("settings.ch.unlink")}</button>
            </>
          ) : data.configured.whatsapp && data.whatsappNumber ? (
            <>
              <p className="text-sm text-ink-600">{t("settings.ch.waSend1")}<code className="bg-canvas px-1.5 py-0.5 rounded">JOIN {data.code}</code>{t("settings.ch.waSend2")}<span dir="ltr">{data.whatsappNumber}</span>.</p>
              <a href={waHref} target="_blank" rel="noopener noreferrer" className="jm-btn jm-btn-primary jm-btn-sm">{t("settings.ch.waOpen")}</a>
            </>
          ) : (
            <p className="jm-muted">{t("settings.ch.waNotConfigured")}</p>
          )}
        </div>

        <div className="rounded-control border border-line p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-navy inline-flex items-center gap-2"><Send className="h-4 w-4 text-sky" /> Telegram</span>
            {data.telegram ? <span className="jm-chip jm-chip-teal"><Check className="h-3 w-3" /> {t("settings.ch.connected")}</span> : <span className="jm-chip">{t("settings.ch.notConnected")}</span>}
          </div>
          {data.telegram ? (
            <>
              <p className="jm-muted">{data.telegram.label || `chat ${data.telegram.id}`}</p>
              <button onClick={() => post({ unlink: "telegram" }, "tg")} disabled={busy === "tg"} className="jm-btn jm-btn-ghost jm-btn-sm">{t("settings.ch.unlink")}</button>
            </>
          ) : data.configured.telegram && data.telegramBot ? (
            <>
              <p className="text-sm text-ink-600">{t("settings.ch.tgOpen1")}<span dir="ltr">@{data.telegramBot}</span>{t("settings.ch.tgOpen2")}<code className="bg-canvas px-1.5 py-0.5 rounded">/start {data.code}</code>.</p>
              <a href={tgHref} target="_blank" rel="noopener noreferrer" className="jm-btn jm-btn-accent jm-btn-sm">{t("settings.ch.tgOpenBtn")}</a>
            </>
          ) : (
            <p className="jm-muted">{t("settings.ch.tgNotConfigured")}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="jm-muted">{t("settings.ch.yourCode")}</span>
        <code className="font-mono text-base tracking-widest bg-canvas border border-line rounded-control px-3 py-1" dir="ltr">{data.code}</code>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(data.code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="jm-btn jm-btn-ghost jm-btn-sm"
        >
          <Copy className="h-4 w-4" /> {copied ? t("settings.ch.copied") : t("settings.ch.copy")}
        </button>
        <span className="jm-muted">{t("settings.ch.valid24")}</span>
      </div>

      {anyLinked && (
        <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-line">
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={data.prefs.matches} onChange={(e) => post({ prefs: { matches: e.target.checked } }, "p1")} className="accent-teal h-4 w-4" /> {t("settings.ch.prefMatches")}
          </label>
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={data.prefs.updates} onChange={(e) => post({ prefs: { updates: e.target.checked } }, "p2")} className="accent-teal h-4 w-4" /> {t("settings.ch.prefUpdates")}
          </label>
          <button onClick={() => post({ test: true }, "test")} disabled={busy === "test"} className="jm-btn jm-btn-secondary jm-btn-sm ms-auto">{busy === "test" ? t("settings.ch.sending") : t("settings.ch.sendTest")}</button>
          {testResult && <span className="jm-muted">{testResult}</span>}
        </div>
      )}
    </div>
  );
}
