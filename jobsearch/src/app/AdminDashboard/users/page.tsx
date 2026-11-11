"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime.js";
import "dayjs/locale/he.js";
import { useCurrentUser } from "@/app/lib/hooks/useCurrentUser";
import { PageHeader, Spinner, EmptyState, SignInGate, Pagination } from "@/app/components/ui";
import { useT } from "@/app/lib/i18n/LanguageProvider";
import type { Key } from "@/app/lib/i18n/dict";

dayjs.extend(relativeTime);

type Usage = { key: string; used: number; limit: number | null };
type U = {
  id: string;
  fullname: string;
  username: string;
  email: string;
  createdAt: string | null;
  admin: boolean;
  recruiter: boolean;
  approved: boolean;
  company: string;
  plan: "free" | "pro";
  disabled: boolean;
  authProvider: string;
  level: string;
  hasResume: boolean;
  onboarded: boolean;
  partner: string;
  autoApply: boolean;
  usage: Usage[];
  usageTotal: number;
  spend: { usd: number; calls: number };
};
type Page = { users: U[]; total: number; page: number; pages: number; month: string };

const FILTERS = ["all", "new", "withResume", "free", "pro", "admins", "recruiters", "disabled"] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_KEY: Record<Filter, Key> = { all: "admin.users.f.all", new: "admin.users.f.new", withResume: "admin.users.f.withResume", free: "admin.users.f.free", pro: "admin.users.f.pro", admins: "admin.users.f.admins", recruiters: "admin.users.f.recruiters", disabled: "admin.users.f.disabled" };
const USAGE_KEY: Record<string, Key> = {
  interview_session: "settings.usage.interview_session",
  voice_session: "settings.usage.voice_session",
  prep_plan: "settings.usage.prep_plan",
  tailor: "settings.usage.tailor",
  resume_build: "settings.usage.resume_build",
  resume_chat: "settings.usage.resume_chat",
  practice_grade: "settings.usage.practice_grade",
  research: "settings.usage.research",
  outreach: "settings.usage.outreach",
  question_answer: "settings.usage.question_answer",
};

/** The admin's user console: who signed up, what they use, and the switches (plan, admin, disabled, delete). */
export default function AdminUsersPage() {
  const { user, loading } = useCurrentUser();
  const { t, dir, lang } = useT();
  const [data, setData] = useState<Page | null>(null);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string>("");
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sp = new URLSearchParams({ page: String(page), filter });
    if (query) sp.set("q", query);
    const r = await fetch(`/api/admin/users?${sp}`, { cache: "no-store" });
    if (!r.ok) return setErr(t("admin.loadFailed"));
    setData(await r.json());
  }, [page, filter, query, t]);
  useEffect(() => {
    if (user?.admin) load();
  }, [user, load]);

  const change = async (id: string, patch: Record<string, unknown>) => {
    setBusy(id);
    setErr("");
    try {
      const r = await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: id, ...patch }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || t("admin.failed"));
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const remove = async (id: string) => {
    setBusy(id);
    setErr("");
    try {
      const r = await fetch("/api/admin/users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: id, confirm: "DELETE" }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || t("admin.failed"));
      setConfirmDelete(null);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  if (loading) return <div className="jm-page"><Spinner /></div>;
  if (!user) return <SignInGate text={t("admin.users.signIn")} next="/AdminDashboard/users" />;
  if (!user.admin) return <div className="jm-page"><EmptyState icon="🔒" title={t("admin.users.forbidden")} /></div>;

  return (
    <div className="jm-page" dir={dir}>
      <PageHeader eyebrow={t("admin.eyebrow")} title={t("admin.users.title")} subtitle={data ? t("admin.users.subtitle", { n: data.total.toLocaleString(), month: data.month }) : ""} />
      <div className="mb-3">
        <Link href="/AdminDashboard" className="jm-btn jm-btn-ghost jm-btn-sm">← {t("admin.users.back")}</Link>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery(q.trim());
        }}
        className="flex flex-col sm:flex-row gap-2 mb-3"
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("admin.users.search")} className="jm-input flex-1" />
        <button className="jm-btn jm-btn-primary">{t("admin.users.searchBtn")}</button>
      </form>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {FILTERS.map((f) => (
          <button key={f} type="button" onClick={() => { setFilter(f); setPage(1); }} className={`jm-chip cursor-pointer ${filter === f ? "jm-chip-teal" : ""}`} aria-pressed={filter === f}>
            {t(FILTER_KEY[f])}
          </button>
        ))}
      </div>
      {err && <div className="jm-alert jm-alert-err mb-3" role="alert">{err}</div>}

      {!data ? (
        <Spinner />
      ) : data.users.length === 0 ? (
        <EmptyState icon="👤" title={t("admin.users.none")} />
      ) : (
        <div className="jm-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-ink-400 text-start">
              <tr className="border-b border-line">
                <th className="text-start p-3 font-semibold">{t("admin.users.col.person")}</th>
                <th className="text-start p-3 font-semibold">{t("admin.users.col.joined")}</th>
                <th className="text-start p-3 font-semibold">{t("admin.users.col.status")}</th>
                <th className="text-start p-3 font-semibold">{t("admin.users.col.usage")}</th>
                <th className="text-start p-3 font-semibold">{t("admin.users.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => {
                const me = u.id === user._id;
                const isBusy = busy === u.id;
                return (
                  <tr key={u.id} className={`border-b border-line last:border-0 align-top ${u.disabled ? "opacity-60" : ""}`}>
                    <td className="p-3 min-w-[14rem]">
                      <div className="font-semibold text-navy">{u.fullname || u.username}{me && <span className="jm-muted font-normal"> · {t("admin.users.you")}</span>}</div>
                      <div className="text-xs text-ink-400" dir="ltr">{u.email}</div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {u.admin && <span className="jm-chip jm-chip-teal">{t("admin.users.chip.admin")}</span>}
                        {u.recruiter && <span className="jm-chip jm-chip-sky">{u.approved ? t("admin.users.chip.recruiter") : t("admin.users.chip.recruiterPending")}{u.company ? ` · ${u.company}` : ""}</span>}
                        {u.disabled && <span className="jm-chip bg-red-50 text-red-700 border-red-200">{t("admin.users.chip.disabled")}</span>}
                        {u.hasResume ? <span className="jm-chip">{t("admin.users.chip.resume")}{u.level ? ` · ${u.level}` : ""}</span> : <span className="jm-chip">{t("admin.users.chip.noResume")}</span>}
                        {u.partner && <span className="jm-chip">{t("admin.users.chip.partner", { slug: u.partner })}</span>}
                        {u.autoApply && <span className="jm-chip">{t("admin.users.chip.autoApply")}</span>}
                        {u.authProvider !== "local" && <span className="jm-chip">{u.authProvider}</span>}
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap text-ink-600" title={u.createdAt ? new Date(u.createdAt).toLocaleString(lang === "he" ? "he-IL" : "en-GB") : ""}>
                      {u.createdAt ? dayjs(u.createdAt).locale(lang).fromNow() : "—"}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className={`jm-chip ${u.plan === "pro" ? "jm-chip-teal" : "jm-chip-sky"}`}>{u.plan === "pro" ? t("admin.users.plan.pro") : t("admin.users.plan.free")}</span>
                    </td>
                    <td className="p-3 min-w-[12rem]">
                      <div className="text-ink-600" dir="ltr">${u.spend.usd.toFixed(2)} · {u.spend.calls} {t("admin.users.calls")}</div>
                      <button type="button" className="text-xs text-teal mt-1" onClick={() => setOpen(open === u.id ? null : u.id)}>
                        {open === u.id ? t("admin.users.hideUsage") : t("admin.users.showUsage", { n: u.usageTotal })}
                      </button>
                      {open === u.id && (
                        <ul className="mt-1.5 space-y-0.5 text-xs text-ink-600">
                          {u.usage.length === 0 && <li className="jm-muted">{t("admin.users.noUsage")}</li>}
                          {u.usage.map((x) => (
                            <li key={x.key} className="flex justify-between gap-3">
                              <span>{t(USAGE_KEY[x.key] || ("settings.usage.other" as Key))}</span>
                              <span dir="ltr" className={x.limit !== null && x.used >= x.limit ? "text-red-600 font-semibold" : ""}>{x.limit === null ? x.used : `${x.used} / ${x.limit}`}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="p-3 min-w-[13rem]">
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" disabled={isBusy || u.admin} onClick={() => change(u.id, { plan: u.plan === "pro" ? "free" : "pro" })} className="jm-btn jm-btn-secondary jm-btn-sm" title={u.admin ? t("admin.users.adminIsPro") : ""}>
                          {u.plan === "pro" ? t("admin.users.act.toFree") : t("admin.users.act.toPro")}
                        </button>
                        <button type="button" disabled={isBusy || me} onClick={() => change(u.id, { admin: !u.admin })} className="jm-btn jm-btn-secondary jm-btn-sm">
                          {u.admin ? t("admin.users.act.removeAdmin") : t("admin.users.act.makeAdmin")}
                        </button>
                        <button type="button" disabled={isBusy || me} onClick={() => change(u.id, { disabled: !u.disabled })} className="jm-btn jm-btn-secondary jm-btn-sm">
                          {u.disabled ? t("admin.users.act.enable") : t("admin.users.act.disable")}
                        </button>
                        <button type="button" disabled={isBusy || u.usageTotal === 0} onClick={() => change(u.id, { resetMonthlyUsage: true })} className="jm-btn jm-btn-secondary jm-btn-sm">
                          {t("admin.users.act.resetUsage")}
                        </button>
                        {confirmDelete === u.id ? (
                          <span className="inline-flex items-center gap-1.5">
                            <button type="button" disabled={isBusy} onClick={() => remove(u.id)} className="jm-btn jm-btn-sm bg-red-600 text-white hover:bg-red-700">{t("admin.users.act.deleteConfirm")}</button>
                            <button type="button" onClick={() => setConfirmDelete(null)} className="jm-btn jm-btn-ghost jm-btn-sm">{t("admin.users.act.cancel")}</button>
                          </span>
                        ) : (
                          <button type="button" disabled={isBusy || me} onClick={() => setConfirmDelete(u.id)} className="jm-btn jm-btn-ghost jm-btn-sm text-red-600">{t("admin.users.act.delete")}</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {data && data.pages > 1 && <div className="mt-4"><Pagination page={page} total={data.pages} onChange={setPage} /></div>}
    </div>
  );
}
