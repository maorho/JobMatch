"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import JobDescription from "@/app/components/JobDescription";
import { getExternalJobById } from "@/app/lib/Externaljobs";

export default function JobPage() {
  const { source, id } = useParams() as { source: string; id: string };

  const [job, setJob] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function fetchJob() {
      try {
        if (source === "internal") {
          const res = await fetch(
            `/api/jobsDashboard/getJobDetails?jobId=${id}`,
            { cache: "no-store" }
          );
          const data = await res.json();
          if (!cancelled) {
            if (res.ok) {
              // ⬅️ הוספת source כדי isInternalJob יעבוד נכון
              setJob({ ...data, source: "internal" });
            } else {
              setError(data.message || "Job not found");
            }
          }
          return;
        }

        if (source === "external") {
          // נסה cache מקומי קודם
          const cached = getExternalJobById(id);
          if (cached && !cancelled) {
            setJob({ ...cached, source: "external" }); // ⬅️ הוספת source פה גם
            return;
          }

          // נפילה לשרת
          const res = await fetch(
            `/api/jobsDashboard/getExternalJobDetails?jobId=${id}`,
            { cache: "no-store" }
          );
          const data = await res.json();
          if (!cancelled) {
            if (res.ok) {
              setJob({ ...data, source: "external" }); // ⬅️ הוספת source
            } else {
              setError(data.message || "External job not found");
            }
          }
          return;
        }

        if (!cancelled) setError("Invalid job source");
      } catch {
        if (!cancelled) setError("Failed to fetch job details");
      }
    }

    fetchJob();
    return () => {
      cancelled = true;
    };
  }, [id, source]);

  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!job) return <div className="p-6">Loading...</div>;

  return <JobDescription job={job} />;
}
