"use client";

import { useParams } from "next/navigation";
import JobDescription from "@/app/components/JobDescription";
import { jobs } from "@/app/components/jobs";

export default function JobPage() {
  const params = useParams();
  const jobId = parseInt(params.id as string);
  const job = jobs[jobId];

  if (!job) return <div className="p-6 text-red-600">Job not found</div>;

  return <JobDescription job={job} />;
}
