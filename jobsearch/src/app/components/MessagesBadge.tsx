"use client";
import Link from "next/link";
import useSWR from "swr";
import { MessageCircle } from "lucide-react";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));

/**
 * Header messages icon with the unread count. One request a minute (plus on
 * focus). `unreadTotal` is summed over the conversations the API returns, so
 * the limit must cover every thread (the API caps it at 100); a dedicated
 * `/api/messages/unread` count endpoint would make this a single countDocuments.
 */
export default function MessagesBadge({ className = "jm-btn jm-btn-secondary jm-btn-icon relative" }: { className?: string }) {
  const { data } = useSWR("/api/messages?limit=100", fetcher, { refreshInterval: 60_000, revalidateOnFocus: true, dedupingInterval: 30_000 });
  const n: number = data?.unreadTotal ?? 0;
  return (
    <Link href="/messages" aria-label={n > 0 ? `${n} הודעות שלא נקראו` : "הודעות"} className={className}>
      <MessageCircle className="h-5 w-5" />
      {n > 0 && (
        <span className="absolute -top-1.5 -end-1.5 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center shadow">
          {n > 99 ? "99+" : n}
        </span>
      )}
    </Link>
  );
}
