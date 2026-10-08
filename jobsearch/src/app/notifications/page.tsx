"use client";
import Link from "next/link";
import useSWR from "swr";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime.js";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";
import { PageHeader, Spinner, SignInGate, EmptyState } from "../components/ui";

dayjs.extend(relativeTime);

type Item = { _id: string; type: string; title: string; body: string; link: string; read: boolean; createdAt: string };

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
  const { data, mutate } = useSWR(user ? "/api/notifications?limit=100" : null, fetcher, { refreshInterval: 30_000 });
  const items: Item[] = data?.items ?? [];
  const unread: number = data?.unreadCount ?? 0;

  const markRead = async (ids?: string[]) => {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ids ? { ids } : { all: true }),
    });
    mutate();
  };

  if (loading) return <Spinner label="טוען…" />;
  if (!user) return <SignInGate text="צריך להתחבר כדי לראות התראות." next="/notifications" />;

  return (
    <div className="jm-page" dir="rtl">
      <PageHeader
        title="התראות"
        subtitle="סטטוס מועמדויות, הודעות חדשות ומשרות שמתאימות לך"
        actions={unread > 0 ? (
          <button onClick={() => markRead()} className="jm-btn jm-btn-secondary jm-btn-sm">
            סמן הכל כנקרא ({unread})
          </button>
        ) : undefined}
      />

      {items.length === 0 ? (
        <EmptyState icon="🔔" title="אין התראות עדיין" text="כשמשהו יקרה — סטטוס מועמדות, הודעה חדשה או משרות שמתאימות לך — זה יופיע כאן." />
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
                {!n.read && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-teal" role="img" aria-label="לא נקרא" />}
                {n.link && <span className="jm-btn jm-btn-ghost jm-btn-sm shrink-0 self-center" aria-hidden="true">←</span>}
              </div>
            );
            return (
              <li key={n._id}>
                {n.link ? (
                  <Link href={n.link} onClick={() => !n.read && markRead([n._id])} className="block">
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
