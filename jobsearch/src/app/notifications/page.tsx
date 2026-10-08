"use client";
import Link from "next/link";
import useSWR from "swr";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime.js";
import { useCurrentUser } from "../lib/hooks/useCurrentUser";

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

  if (loading) return <p className="text-center mt-10 font-outfit">טוען…</p>;
  if (!user) {
    return (
      <div className="text-center mt-10 font-outfit">
        <p className="text-red-500">צריך להתחבר כדי לראות התראות.</p>
        <Link href="/Login" className="text-[#11AEFF] underline">התחברות</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 font-outfit" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl lg:text-[34px] font-semibold text-[#232323]">התראות</h1>
        {unread > 0 && (
          <button onClick={() => markRead()} className="text-sm text-[#11AEFF] hover:underline">
            סמן הכל כנקרא ({unread})
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-4xl border border-[#232323]/10 p-10 text-center text-[#232323]/60">
          אין התראות עדיין. כשמשהו יקרה — סטטוס מועמדות, הודעה חדשה או משרות שמתאימות לך — זה יופיע כאן.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((n) => {
            const inner = (
              <div className={`flex gap-4 rounded-[20px] border p-4 transition ${n.read ? "border-[#232323]/10 bg-white" : "border-[#24A8A2]/40 bg-[#24A8A2]/5"}`}>
                <div className="text-2xl leading-none pt-1" aria-hidden="true">{ICON[n.type] ?? "🔔"}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className={`text-[#232323] ${n.read ? "font-medium" : "font-semibold"}`} dir="auto">{n.title}</h3>
                    <span className="shrink-0 text-xs text-[#232323]/50">{dayjs(n.createdAt).fromNow()}</span>
                  </div>
                  {n.body && <p className="mt-1 text-sm text-[#232323]/70 whitespace-pre-line" dir="auto">{n.body}</p>}
                </div>
                {!n.read && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-[#24A8A2]" aria-label="לא נקרא" />}
              </div>
            );
            return (
              <li key={n._id}>
                {n.link ? (
                  <Link href={n.link} onClick={() => !n.read && markRead([n._id])} className="block">
                    {inner}
                  </Link>
                ) : (
                  <button onClick={() => !n.read && markRead([n._id])} className="block w-full text-right">
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
