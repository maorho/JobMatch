"use client";
import { useEffect, useState } from "react";
import { Copy, KeyRound, Plug } from "lucide-react";
import { useT } from "../lib/i18n/LanguageProvider";

type Status = { hasKey: boolean; prefix: string; createdAt: string | null; endpoint: string };

/** Settings: personal API key + MCP connection snippets for Claude / ChatGPT / Cursor. */
export default function McpCard() {
  const { t } = useT();
  const [st, setSt] = useState<Status | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const load = () => fetch("/api/settings/api-key").then(async (r) => r.ok && setSt(await r.json()));
  useEffect(() => {
    load();
  }, []);

  const issue = async () => {
    setBusy(true);
    const r = await fetch("/api/settings/api-key", { method: "POST" });
    if (r.ok) {
      const d = await r.json();
      setKey(d.key);
      await load();
    }
    setBusy(false);
  };
  const revoke = async () => {
    setBusy(true);
    await fetch("/api/settings/api-key", { method: "DELETE" });
    setKey(null);
    await load();
    setBusy(false);
  };
  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(""), 1500);
    } catch {}
  };

  if (!st) return <p className="jm-muted">{t("common.loading")}</p>;
  const shownKey = key || "jm_live_•••••••••••••••••••••••••••••••••••••••";
  const claudeCfg = JSON.stringify({ mcpServers: { jobmatch: { type: "http", url: st.endpoint, headers: { Authorization: `Bearer ${shownKey}` } } } }, null, 2);
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600 leading-relaxed">
        {t("settings.mcp.intro1")}<span className="font-medium">MCP</span>{t("settings.mcp.intro2")}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {st.hasKey ? <span className="jm-chip jm-chip-teal"><KeyRound className="h-3 w-3" /> {t("settings.mcp.activeKey", { prefix: st.prefix })}</span> : <span className="jm-chip">{t("settings.mcp.noKey")}</span>}
        <button type="button" disabled={busy} onClick={issue} className="jm-btn jm-btn-primary jm-btn-sm">{st.hasKey ? t("settings.mcp.rotate") : t("settings.mcp.create")}</button>
        {st.hasKey && <button type="button" disabled={busy} onClick={revoke} className="jm-btn jm-btn-ghost jm-btn-sm text-red-600">{t("settings.mcp.revoke")}</button>}
      </div>
      {key && (
        <div className="jm-alert jm-alert-ok space-y-2">
          <div className="font-medium">{t("settings.mcp.shownOnce")}</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-white/70 px-3 py-2 text-xs" dir="ltr">{key}</code>
            <button type="button" onClick={() => copy("key", key)} className="jm-btn jm-btn-secondary jm-btn-sm"><Copy className="h-4 w-4" /> {copied === "key" ? t("settings.mcp.copied") : t("settings.mcp.copy")}</button>
          </div>
        </div>
      )}
      <details className="rounded-control border border-line p-3">
        <summary className="cursor-pointer text-sm font-medium text-navy inline-flex items-center gap-2"><Plug className="h-4 w-4" /> {t("settings.mcp.howTo")}</summary>
        <div className="mt-3 space-y-3 text-sm text-ink-600">
          <div>
            <div className="font-medium text-navy mb-1">{t("settings.mcp.claudeTitle")}</div>
            <pre className="rounded-xl bg-canvas p-3 text-xs overflow-x-auto" dir="ltr">{claudeCfg}</pre>
            <button type="button" onClick={() => copy("cfg", claudeCfg)} className="jm-btn jm-btn-ghost jm-btn-sm mt-1"><Copy className="h-4 w-4" /> {copied === "cfg" ? t("settings.mcp.copied") : t("settings.mcp.copyCfg")}</button>
          </div>
          <div>
            <div className="font-medium text-navy mb-1">{t("settings.mcp.chatgptTitle")}</div>
            <p>{t("settings.mcp.serverUrl")} <code dir="ltr">{st.endpoint}</code> {t("settings.mcp.auth")}</p>
          </div>
          <p className="jm-muted">{t("settings.mcp.tools")}</p>
        </div>
      </details>
    </div>
  );
}
