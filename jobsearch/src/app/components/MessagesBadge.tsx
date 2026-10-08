"use client";
import Link from "next/link";
import useSWR from "swr";
import { MessageIcon } from "./icons";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));

/** Header messages icon with the unread-thread count; polls every 30s. */
export default function MessagesBadge({ className = "" }: { className?: string }) {
  const { data } = useSWR("/api/messages?limit=100", fetcher, { refreshInterval: 30_000, revalidateOnFocus: true });
  const n: number = data?.unreadTotal ?? 0;
  return (
    <Link
      href="/messages"
      aria-label={n > 0 ? `${n} הודעות שלא נקראו` : "הודעות"}
      className={`relative flex items-center justify-center bg-white rounded-[15px] h-[50px] w-[50px] p-1 hover:bg-blue-200 transition-colors ${className}`}
    >
      <MessageIcon />
      {n > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center shadow">
          {n > 99 ? "99+" : n}
        </span>
      )}
    </Link>
  );
}
