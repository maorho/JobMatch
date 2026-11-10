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
import SearchProfileCard from "../components/SearchProfileCard";
import InsiderCard from "../components/InsiderCard";
import { PageHeader, Spinner, SignInGate } from "../components/ui";
import PushCard from "../components/PushCard";
import { useT, LanguageToggle } from "../lib/i18n/LanguageProvider";
import type { Key } from "../lib/i18n/dict";

type Profile = { username: string; email: string; fullname: string; phone: string; currentJob: string; company: string; recruiter: boolean; authProvider?: string; resumeScore?: number; resumeUpdatedAt?: string; privacy?: { excludeFromTraining?: boolean } };

const card = "jm-card p-6 space-y-4";

export default function SettingsPage() {
  const router = useRouter();
  const { t, dir, lang } = useT();
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
      const kinds: Record<string, "ok" | "err"> = { connected: "ok", denied: "err", state: "err", failed: "err", no_refresh_token: "err", not_configured: "err" };
      if (outcome && kinds[outcome]) {
        setMsg({ kind: kinds[outcome], text: t(`settings.gmailOutcome.${outcome}` as Key) });
        window.history.replaceState(null, "", "/Settings");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const disconnectGmail = async () => {
    const r = await fetch("/api/integrations/gmail", { method: "DELETE" });
    if (!r.ok) return flash("err", t("settings.gmailDisconnectFailed"));
    loadGmail();
    flash("ok", t("settings.gmailDisconnected"));
  };

  const flash = (kind: "ok" | "err", text: string) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 4000); };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!p) return;
    const r = await fetch("/api/settings/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullname: p.fullname, phone: p.phone, currentJob: p.currentJob, company: p.company }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return flash("err", d?.error || t("settings.saveFailed"));
    setP(d.user);
    mutateUser();
    flash("ok", t("settings.profileSaved"));
  };

  const setTrainingOptOut = async (exclude: boolean) => {
    const r = await fetch("/api/settings/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ excludeFromTraining: exclude }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return flash("err", d?.error || t("settings.saveFailed"));
    setP(d.user);
    flash("ok", exclude ? t("settings.trainingOptedOut") : t("settings.trainingOptedIn"));
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.newPassword !== pw.again) return flash("err", t("settings.pwMismatch"));
    const r = await fetch("/api/settings/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: pw.currentPassword, newPassword: pw.newPassword }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return flash("err", d?.error || t("settings.pwChangeFailed"));
    setPw({ currentPassword: "", newPassword: "", again: "" });
    flash("ok", t("settings.pwUpdated"));
  };

  const deleteAccount = async () => {
    const r = await fetch("/api/settings/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: confirmDelete }) });
    if (!r.ok) return flash("err", t("settings.deleteFailed"));
    router.push("/");
    router.refresh();
  };

  if (loading) return <Spinner label={t("common.loading")} />;
  if (!user) return <SignInGate text={t("settings.signInToEdit")} next="/Settings" />;

  return (
    <div className="jm-page" dir={dir}>
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />
      <div className="max-w-3xl space-y-6">
        {msg && <div className={`jm-alert ${msg.kind === "ok" ? "jm-alert-ok" : "jm-alert-err"}`} role="status">{msg.text}</div>}

        {p && (
          <form onSubmit={saveProfile} className={card}>
            <h2 className="jm-h2">{t("settings.profile")}</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block"><span className="jm-label">{t("settings.fullName")}</span><input className="jm-input" value={p.fullname || ""} onChange={(e) => setP({ ...p, fullname: e.target.value })} required /></label>
              <label className="block"><span className="jm-label">{t("settings.phone")}</span><input className="jm-input" value={p.phone || ""} onChange={(e) => setP({ ...p, phone: e.target.value })} dir="ltr" /></label>
              <label className="block"><span className="jm-label">{t("settings.currentJob")}</span><input className="jm-input" value={p.currentJob || ""} onChange={(e) => setP({ ...p, currentJob: e.target.value })} placeholder={t("settings.currentJobPlaceholder")} /></label>
              {p.recruiter && <label className="block"><span className="jm-label">{t("settings.company")}</span><input className="jm-input" value={p.company || ""} onChange={(e) => setP({ ...p, company: e.target.value })} /></label>}
            </div>
            <div className="jm-muted">
              {t("settings.emailLabel")} <span dir="ltr">{p.email}</span> · {t("settings.usernameLabel")} {p.username}
              {p.authProvider && p.authProvider !== "local" && ` · ${t("settings.viaProvider", { provider: p.authProvider })}`}
            </div>
            <div className="flex justify-start">
              <button className="jm-btn jm-btn-primary">{t("settings.save")}</button>
            </div>
          </form>
        )}

        <div className={card}>
          <h2 className="jm-h2">{t("settings.resume")}</h2>
          <p className="text-sm text-ink-600 leading-relaxed">
            {p?.resumeUpdatedAt
              ? `${t("settings.resumeUpdated", { date: new Date(p.resumeUpdatedAt).toLocaleDateString(lang === "he" ? "he-IL" : "en-GB") })}${p.resumeScore ? t("settings.resumeScore", { score: p.resumeScore }) : ""}.`
              : t("settings.noResume")}
          </p>
          <div>
            <Link href="/ResumeAI" className="jm-btn jm-btn-accent">{t("settings.updateInResumeAI")}</Link>
          </div>
        </div>

        <div className={card}>
          <h2 className="jm-h2">{t("settings.gmail")}</h2>
          <p className="text-sm text-ink-600 leading-relaxed">
            {gmail?.connected
              ? <>{t("settings.gmailConnectedPrefix")}<span dir="ltr">{gmail.address}</span>{t("settings.gmailConnectedSuffix")}</>
              : t("settings.gmailPitch")}
          </p>
          {gmail?.connected ? (
            <div><button onClick={disconnectGmail} className="jm-btn jm-btn-secondary">{t("settings.gmailDisconnect")}</button></div>
          ) : gmail?.configured ? (
            <div><a href="/api/integrations/gmail/connect" className="jm-btn jm-btn-accent">{t("settings.gmailConnect")}</a></div>
          ) : (
            <p className="jm-muted">{t("settings.gmailNotConfiguredEnv")}</p>
          )}
        </div>

        <div id="search-profile" className={card}>
          <h2 className="jm-h2">{t("settings.lookingFor")}</h2>
          <SearchProfileCard />
        </div>

        <div className={card}>
          <h2 className="jm-h2">{t("settings.language")}</h2>
          <p className="text-sm text-ink-600">{t("settings.languageText")}</p>
          <LanguageToggle className="jm-btn jm-btn-secondary" />
        </div>

        <div id="messaging" className={card}>
          <h2 className="jm-h2">{t("settings.push")}</h2>
          <PushCard />
        </div>

        <div className={card}>
          <h2 className="jm-h2">{t("settings.channels")}</h2>
          <ChannelsCard />
        </div>

        <div id="insider" className={card}>
          <h2 className="jm-h2">{t("settings.insider")}</h2>
          <InsiderCard />
        </div>

        <div id="contacts" className={card}>
          <h2 className="jm-h2">{t("settings.contacts")}</h2>
          <ContactsCard />
        </div>

        <div id="auto-apply" className={card}>
          <h2 className="jm-h2">{t("settings.autoApply")} <span className="jm-chip jm-chip-sky align-middle">{t("settings.beta")}</span></h2>
          <AutoApplyCard />
        </div>

        <div id="partner" className={card}>
          <h2 className="jm-h2">{t("settings.partners")}</h2>
          <PartnerCard current={user?.partner || null} />
        </div>

        <div id="mcp" className={card}>
          <h2 className="jm-h2">{t("settings.mcp")}</h2>
          <McpCard />
        </div>

        {(!p?.authProvider || p.authProvider === "local") && (
          <form onSubmit={changePassword} className={card}>
            <h2 className="jm-h2">{t("settings.password")}</h2>
            <input className="jm-input" type="password" placeholder={t("settings.pwCurrent")} value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required dir="ltr" />
            <div className="grid sm:grid-cols-2 gap-4">
              <input className="jm-input" type="password" placeholder={t("settings.pwNew")} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required minLength={8} dir="ltr" />
              <input className="jm-input" type="password" placeholder={t("settings.pwAgain")} value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} required minLength={8} dir="ltr" />
            </div>
            <div>
              <button className="jm-btn jm-btn-secondary">{t("settings.pwUpdate")}</button>
            </div>
          </form>
        )}

        <div id="privacy" className={card}>
          <h2 className="jm-h2">{t("settings.privacy")}</h2>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-teal" checked={!!p?.privacy?.excludeFromTraining} disabled={!p} onChange={(e) => setTrainingOptOut(e.target.checked)} />
            <span className="text-sm text-ink-600 leading-relaxed">
              <span className="font-semibold text-navy">{t("settings.privacyOptOutTitle")}</span>{" "}
              {t("settings.privacyOptOutText")}
            </span>
          </label>
          <p className="text-xs jm-muted">{t("settings.privacyDetails")}<a href="/PrivacyPolicy" className="text-sky-600 underline underline-offset-2">{t("settings.privacyPolicyLink")}</a>{t("settings.privacyDetailsEnd")}</p>
        </div>

        <div className={`${card} border-red-200`}>
          <h2 className="jm-h2 text-red-700">{t("settings.delete")}</h2>
          <p className="text-sm text-ink-600 leading-relaxed">{t("settings.deleteText")}</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input className="jm-input" placeholder={t("settings.deleteConfirmPlaceholder")} value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} dir="ltr" />
            <button onClick={deleteAccount} disabled={confirmDelete !== "DELETE"} className="jm-btn jm-btn-danger shrink-0">{t("settings.deleteBtn")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
