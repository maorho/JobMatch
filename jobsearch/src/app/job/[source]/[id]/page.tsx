"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import JobDescription from "@/app/components/JobDescription";
import { getExternalJobById } from "@/app/lib/Externaljobs";

export default function JobPage() {
  const params = useParams();
  const { source, id } = params as { source: string; id: string };

  const [job, setJob] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchJob() {
      console.log(source);
      try {
        if (source === "internal") {
          const res = await fetch(
            `/api/jobsDashboard/getJobDetails?jobId=${id}`
          );
          const data = await res.json();
          if (res.ok) {
            setJob(data);
          } else {
            setError(data.message || "Job not found");
          }
        } else if (source === "external") {
          console.log(id);
          const externalJob = getExternalJobById(id);
          if (externalJob) {
            setJob(externalJob);
          } else {
            setError("External job not found");
          }
        } else {
          setError("Invalid job source");
        }
      } catch (err) {
        setError("Failed to fetch job details");
      }
    }

    fetchJob();
  }, [id, source]);

  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!job) return <div className="p-6">Loading...</div>;

  return <JobDescription job={job} />;
}
