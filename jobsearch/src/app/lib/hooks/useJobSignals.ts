"use client";
import useSWR from "swr";
import { useCurrentUser } from "./useCurrentUser";

type Signals = { saved: string[]; dismissed: string[] };
const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));

/** Saved / dismissed ids for the signed-in person, with optimistic toggles. */
export function useJobSignals() {
  const { user } = useCurrentUser();
  const { data, mutate } = useSWR<Signals>(user ? "/api/jobs/signals" : null, fetcher, { revalidateOnFocus: false });
  const saved = new Set(data?.saved || []);
  const dismissed = new Set(data?.dismissed || []);
  const toggle = async (jobId: string, kind: "saved" | "dismissed", jobModel: "Job" | "ExternalJobs" = "ExternalJobs", matchScore?: number | null) => {
    const cur = kind === "saved" ? saved : dismissed;
    const on = !cur.has(jobId);
    await mutate(
      async () => {
        const r = await fetch("/api/jobs/signals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, jobModel, kind, on, matchScore }) });
        const j = await r.json().catch(() => null);
        const next: Signals = { saved: [...(data?.saved || [])].filter((x) => x !== jobId), dismissed: [...(data?.dismissed || [])].filter((x) => x !== jobId) };
        if (j?.saved) next.saved.push(jobId);
        if (j?.dismissed) next.dismissed.push(jobId);
        return next;
      },
      {
        optimisticData: () => {
          const next: Signals = { saved: [...(data?.saved || [])].filter((x) => x !== jobId), dismissed: [...(data?.dismissed || [])].filter((x) => x !== jobId) };
          if (on) next[kind].push(jobId);
          return next;
        },
        revalidate: false,
      }
    );
    return on;
  };
  return { ready: !!user && !!data, saved, dismissed, toggle, signedIn: !!user };
}
