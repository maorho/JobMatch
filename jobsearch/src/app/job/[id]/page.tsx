"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import JobDescription from "@/app/components/JobDescription";

export default function JobPage() {
  const params = useParams();
  const jobId = params.id as string;
  const [job, setJob] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchJob() {
      try {
        const res = await fetch(
          `/api/jobsDashboard/getJobDetails?jobId=${jobId}`
        );
        const data = await res.json();
        if (res.ok) {
          setJob(data);
        } else {
          setError(data.message || "Job not found");
        }
      } catch (err) {
        setError("Failed to fetch job details");
      }
    }

    fetchJob();
  }, [jobId]);

  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!job) return <div className="p-6">Loading...</div>;

  return <JobDescription job={job} />;
}
