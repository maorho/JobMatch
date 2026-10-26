"use client";
import Link from "next/link";
import useSWR from "swr";
import { Bell } from "lucide-react";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));

/**
 * Header bell with the unread count. One request a minute (plus on focus);
 * `limit=1` because only `unreadCount` is read here.
 */
export default function NotificationBell({ className = "jm-btn jm-btn-secondary jm-btn-icon relative" }: { className?: string }) {
  const { data } = useSWR("/api/notifications?limit=1", fetcher, { refreshInterval: 60_000, revalidateOnFocus: true, dedupingInterval: 30_000 });
  const n: number = data?.unreadCount ?? 0;
  return (
    <Link href="/notifications" aria-label={n > 0 ? `${n} התראות שלא נקראו` : "התראות"} className={className}>
      <Bell className="h-5 w-5" />
      {n > 0 && (
        <span className="absolute -top-1.5 -end-1.5 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center shadow">
          {n > 99 ? "99+" : n}
        </span>
      )}
    </Link>
  );
}
