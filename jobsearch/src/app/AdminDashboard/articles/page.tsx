"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import { useCurrentUser } from "@/app/lib/hooks/useCurrentUser";
import { PageHeader, Spinner, EmptyState, SignInGate } from "@/app/components/ui";
import { useT } from "@/app/lib/i18n/LanguageProvider";

type Section = { heading?: string; paragraphs?: string[]; bullets?: string[] };
type Art = { _id: string; slug: string; title: string; excerpt: string; tags: string[]; readMinutes: number; status: string; source: string; topic: string; seo: { title: string; description: string; keywords: string[] } | null; sections: Section[]; createdAt: string; publishedAt: string | null };

const STATUS_CHIP: Record<string, string> = { draft: "jm-chip jm-chip-sky", published: "jm-chip jm-chip-teal", archived: "jm-chip" };
const STATUS_KEY = { draft: "admin.articles.status.draft", published: "admin.articles.status.published", archived: "admin.articles.status.archived" } as const;

export default function AdminArticlesPage() {
  const { user, loading } = useCurrentUser();
  const { t, dir } = useT();
  const [items, setItems] = useState<Art[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);
  const statusLabel = (s: string) => (s in STATUS_KEY ? t(STATUS_KEY[s as keyof typeof STATUS_KEY]) : s);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/articles", { cache: "no-store" });
    if (r.ok) setItems((await r.json()).articles);
  }, []);
  useEffect(() => {
    if (user?.admin) load();
  }, [user, load]);

  const write = async () => {
    setBusy(true);
    setMsg({ kind: "info", text: topic ? t("admin.articles.writingOn", { topic }) : t("admin.articles.writingAuto") });
    try {
      const r = await fetch("/api/admin/articles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || t("admin.failed"));
      await load();
      setMsg(d.article ? { kind: "ok", text: t("admin.articles.written", { title: d.article.title }) } : { kind: "info", text: t("admin.articles.stillWorking") });
      setTopic("");
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || t("admin.failed") });
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    const r = await fetch("/api/admin/articles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    if (r.ok) load();
  };
  const remove = async (id: string) => {
    const r = await fetch(`/api/admin/articles?id=${id}`, { method: "DELETE" });
    if (r.ok) load();
  };

  if (loading) return <Spinner label={t("admin.loading")} />;
  if (!user) return <SignInGate text={t("admin.signInAsAdmin")} next="/AdminDashboard/articles" />;
  if (!user.admin) return <div className="jm-page" dir={dir}><EmptyState icon="🔒" title={t("admin.adminOnlyTitle")} /></div>;

  return (
    <div className="jm-page" dir={dir}>
      <PageHeader eyebrow={t("admin.eyebrow")} title={t("admin.articles.title")} subtitle={t("admin.articles.subtitle")} actions={<Link href="/AdminDashboard/agents" className="jm-btn jm-btn-ghost jm-btn-sm">{t("admin.articles.toAgents")}</Link>} />

      <div className="jm-card p-5 mb-6 flex flex-col sm:flex-row gap-3 sm:items-end">
        <label className="flex-1">
          <span className="jm-label">{t("admin.articles.topicLabel")}</span>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t("admin.articles.topicPlaceholder")} className="jm-input" dir={dir} />
        </label>
        <button type="button" disabled={busy} onClick={write} className="jm-btn jm-btn-primary">
          {busy ? t("admin.articles.writing") : t("admin.articles.write")}
        </button>
      </div>
      {msg && <div className={`jm-alert mb-4 ${msg.kind === "ok" ? "jm-alert-ok" : msg.kind === "err" ? "jm-alert-err" : "jm-alert-info"}`}>{msg.text}</div>}

      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState icon="✍️" title={t("admin.articles.empty")} />
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <li key={a._id} className="jm-card p-4 sm:p-5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={STATUS_CHIP[a.status] ?? "jm-chip"}>{statusLabel(a.status)}</span>
                    <span className="jm-chip">{a.source === "static" ? t("admin.articles.manual") : t("admin.articles.agent")}</span>
                    <span className="jm-muted"><span dir="ltr">{dayjs(a.publishedAt || a.createdAt).format("DD/MM/YYYY")}</span> · {t("admin.articles.minutes", { n: a.readMinutes })}</span>
                  </div>
                  <h2 className="jm-h2 mt-2 leading-snug" dir={dir}>{a.title}</h2>
                  <p className="text-sm text-ink-600 mt-1 leading-relaxed" dir={dir}>{a.excerpt}</p>
                  {a.seo && (
                    <p className="text-xs text-ink-400 mt-2" dir={dir}>
                      SEO: <span className="font-medium text-ink-600">{a.seo.title}</span> — {a.seo.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1">{a.tags.map((tag) => <span key={tag} className="jm-chip jm-chip-sky">{tag}</span>)}</div>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button type="button" onClick={() => setOpen(open === a._id ? null : a._id)} className="jm-btn jm-btn-secondary jm-btn-sm">{open === a._id ? t("admin.articles.close") : t("admin.articles.preview")}</button>
                  {a.status === "published" && <Link href={`/Articels/${a.slug}`} target="_blank" className="jm-btn jm-btn-ghost jm-btn-sm">{t("admin.articles.open")}</Link>}
                  {a.source !== "static" && a.status !== "published" && <button type="button" onClick={() => setStatus(a._id, "published")} className="jm-btn jm-btn-primary jm-btn-sm">{t("admin.articles.publish")}</button>}
                  {a.source !== "static" && a.status === "published" && <button type="button" onClick={() => setStatus(a._id, "draft")} className="jm-btn jm-btn-secondary jm-btn-sm">{t("admin.articles.unpublish")}</button>}
                  {a.source !== "static" && <button type="button" onClick={() => remove(a._id)} className="jm-btn jm-btn-ghost jm-btn-sm text-red-600">{t("admin.articles.delete")}</button>}
                </div>
              </div>
              {open === a._id && (
                <div dir={dir} className="mt-4 border-t border-line pt-4 space-y-4 text-[15px] [&_h3]:font-semibold [&_h3]:text-navy [&_h3]:mt-4 [&_p]:text-ink-600 [&_p]:leading-relaxed [&_p]:mb-2 [&_ul]:list-disc [&_ul]:ps-5 [&_ul]:text-ink-600">
                  {a.sections.map((s, i) => (
                    <section key={i}>
                      {s.heading && <h3>{s.heading}</h3>}
                      {s.paragraphs?.map((p, j) => <p key={j}>{p}</p>)}
                      {s.bullets?.length ? <ul>{s.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul> : null}
                    </section>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
