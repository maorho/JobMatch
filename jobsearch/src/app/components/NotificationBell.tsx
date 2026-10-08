"use client";
import Link from "next/link";
import useSWR from "swr";
import { NotificationIcon } from "./icons";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));

/** Header bell with the unread count; polls every 30s. */
export default function NotificationBell({ className = "" }: { className?: string }) {
  const { data } = useSWR("/api/notifications?limit=1", fetcher, { refreshInterval: 30_000, revalidateOnFocus: true });
  const n: number = data?.unreadCount ?? 0;
  return (
    <Link
      href="/notifications"
      aria-label={n > 0 ? `${n} התראות שלא נקראו` : "התראות"}
      className={`relative flex items-center justify-center bg-white rounded-[15px] h-[50px] w-[50px] p-1 hover:bg-blue-200 transition-colors ${className}`}
    >
      <NotificationIcon />
      {n > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center shadow">
          {n > 99 ? "99+" : n}
        </span>
      )}
    </Link>
  );
}
