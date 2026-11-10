"use client";
import Link from "next/link";
import useSWR, { mutate as mutateKey } from "swr";
import { BELL_KEY } from "../components/NotificationBell";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime.js";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import { PageHeader, Spinner, SignInGate, EmptyState } from "../components/ui";
import { useT } from "../lib/i18n/LanguageProvider";

dayjs.extend(relativeTime);

type Item = { _id: string; type: string; title: string; body: string; link: string; read: boolean; createdAt: string; meta?: { jobIds?: string[] } };

/** Older match notifications pointed at the whole feed; the ids in `meta` open exactly those jobs. */
const linkOf = (n: Item) => (n.type === "job_match" && n.meta?.jobIds?.length ? `/jobs?ids=${n.meta.jobIds.join(",")}` : n.link === "/" ? "/jobs" : n.link);

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));

const ICON: Record<string, string> = {
  application_status: "📋",
  application_received: "🧑‍💼",
  new_message: "💬",
  job_match: "🎯",
  system: "🔔",
};

export default function NotificationsPage() {
  const { user, loading } = useCurrentUser();
  const { t, dir } = useT();
  const { data, mutate } = useSWR(user ? "/api/notifications?limit=100" : null, fetcher, { refreshInterval: 30_000 });
  const items: Item[] = data?.items ?? [];
  const unread: number = data?.unreadCount ?? 0;

  // Mark read: the list and the header bell drop at once (optimistic), then the
  // server's count replaces the guess. Clicking a notification navigates away
  // immediately, so the request is sent with keepalive and never awaited there.
  const markRead = async (ids?: string[]) => {
    const unreadIds = ids ? ids.filter((id) => items.some((n) => n._id === id && !n.read)) : items.filter((n) => !n.read).map((n) => n._id);
    if (unreadIds.length === 0) return;
    const drop = (d: any) => (d ? { ...d, unreadCount: Math.max(0, (d.unreadCount ?? 0) - unreadIds.length) } : d);
    mutateKey(BELL_KEY, drop, { revalidate: false });
    mutate((d: any) => (d ? { ...drop(d), items: (d.items || []).map((n: Item) => (unreadIds.includes(n._id) ? { ...n, read: true } : n)) } : d), { revalidate: false });
    try {
      const r = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids ? { ids: unreadIds } : { all: true }),
        keepalive: true,
      });
      const res = r.ok ? await r.json().catch(() => null) : null;
      if (res && typeof res.unreadCount === "number") {
        mutateKey(BELL_KEY, (d: any) => (d ? { ...d, unreadCount: res.unreadCount } : d), { revalidate: false });
        mutate((d: any) => (d ? { ...d, unreadCount: res.unreadCount } : d), { revalidate: false });
      } else {
        mutateKey(BELL_KEY);
        mutate();
      }
    } catch {
      mutateKey(BELL_KEY);
      mutate();
    }
  };

  if (loading) return <Spinner label={t("common.loading")} />;
  if (!user) return <SignInGate text={t("common.youAreNotLoggedIn")} next="/notifications" />;

  return (
    <div className="jm-page" dir={dir}>
      <PageHeader
        title={t("notif.title")}
        subtitle={t("pages.notif.subtitle")}
        actions={unread > 0 ? (
          <button onClick={() => markRead()} className="jm-btn jm-btn-secondary jm-btn-sm">
            {t("notif.markAll", { n: unread })}
          </button>
        ) : undefined}
      />

      {items.length === 0 ? (
        <EmptyState icon="🔔" title={t("notif.empty")} text={t("pages.notif.emptyText")} />
      ) : (
        <ul className="space-y-3 max-w-3xl">
          {items.map((n) => {
            const inner = (
              <div className={`jm-card p-4 flex items-start gap-4 transition-colors hover:bg-canvas/60 ${n.read ? "" : "border-s-4 border-s-teal"}`}>
                <div className="h-11 w-11 shrink-0 rounded-xl bg-sky-50 text-xl flex items-center justify-center" aria-hidden="true">
                  {ICON[n.type] ?? "🔔"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className={`text-navy ${n.read ? "font-medium" : "font-semibold"}`} dir="auto">{n.title}</h3>
                    <span className="jm-muted shrink-0">{dayjs(n.createdAt).fromNow()}</span>
                  </div>
                  {n.body && <p className="mt-1 text-sm text-ink-600 whitespace-pre-line" dir="auto">{n.body}</p>}
                </div>
                {!n.read && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-teal" role="img" aria-label={t("notif.unread")} />}
                {linkOf(n) && <span className="jm-btn jm-btn-ghost jm-btn-sm shrink-0 self-center" aria-hidden="true">{dir === "rtl" ? "←" : "→"}</span>}
              </div>
            );
            return (
              <li key={n._id}>
                {linkOf(n) ? (
                  <Link href={linkOf(n)} onClick={() => !n.read && markRead([n._id])} className="block">
                    {inner}
                  </Link>
                ) : (
                  <button onClick={() => !n.read && markRead([n._id])} className="block w-full text-start">
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
