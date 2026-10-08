import { useIsMobile } from "@/app/lib/hooks/useIsMobile";
import { Pagination } from "@/app/components/ui";
import React, { useState } from "react";
import { isSelfAddedJob } from "../../../../utils/isSelfAddedJob";
import { DeleteIcon } from "@/app/components/icons";
import { EmptyState } from "@/app/components/ui";

interface Job {
  source: string;
  jobId: any;
  job: string;
  company: string;
  location: string;
  type: string;
  link?: string;
  status?: string;
}

interface JobManagementProps {
  jobs: any[];
}

// One chip colour per application status; anything unknown falls back to the
// neutral `jm-chip` base.
const OFFER_CHIP = "bg-emerald-50 text-emerald-700 border-emerald-200";
const chipByStatus: Record<string, string> = {
  "Submitted Resume": "jm-chip-sky",
  "HR Phone Interview": "jm-chip-teal",
  "Technical Interview": "jm-chip-teal",
  "Final Interview": "jm-chip-teal",
  "Recived an Offer": OFFER_CHIP,
  Accepted: OFFER_CHIP,
  Rejected: "bg-red-50 text-red-700 border-red-200",
};

const StatusChip = ({ status }: { status?: string }) => (
  <span className={`jm-chip ${chipByStatus[status || ""] || ""}`}>{status || "-"}</span>
);

const ExternalLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="font-medium text-sky hover:text-sky-600 underline-offset-2 hover:underline"
  >
    {children}
  </a>
);

const JobManagement: React.FC<JobManagementProps> = ({ jobs }) => {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 5;
  const totalPages = Math.ceil(jobs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const displayedjobs = jobs.slice(
    startIndex,
    startIndex + itemsPerPage
  );
  const isMobile = useIsMobile();

  const handleDeleteSelfJob = async (jobID:string) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this job?"
    );
    if (!confirmed) return;

    const res = await fetch(`api/jobsDashboard/Candidate/deleteSelfAddedJob?jobId=${jobID}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });

    if (res.ok) {
      alert("Job deleted");

    } else {
      alert("Something went wrong");
    }
  };

  const deleteButton = (jobID: string) => (
    <button
      type="button"
      onClick={() => handleDeleteSelfJob(jobID)}
      className="jm-btn jm-btn-ghost jm-btn-icon h-9 w-9 shrink-0"
      aria-label="Delete job"
      title="Delete job"
    >
      <DeleteIcon />
    </button>
  );

  const pagination = (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-line">
      {!isMobile ? (
        <p className="jm-muted">
          Showing {startIndex + 1}–
          {Math.min(startIndex + itemsPerPage, jobs.length)} of{" "}
          {jobs.length} applications
        </p>
      ) : (
        <span />
      )}

      <Pagination page={currentPage} total={totalPages} onChange={setCurrentPage} />
    </div>
  );

  if (jobs.length === 0) {
    return <EmptyState icon="📋" title="No jobs to show" />;
  }

  return (
    <div className="jm-card p-4 sm:p-5 space-y-4">
        {!isMobile?(
          <div className="overflow-x-auto">
          <table className="jm-table">
            <thead>
            <tr>
              <th>Job</th>
              <th>Company</th>
              <th>Location</th>
              <th>Type</th>
              <th>Link</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody className="text-ink">
            {displayedjobs.map((job, idx) => {
              const selfAdded = isSelfAddedJob(job);

              return (
                <tr key={idx}>
                  <td className="font-semibold text-navy">
                    {selfAdded?
                      <div className="flex items-center gap-3">
                          {deleteButton(job._id)}
                          <span>{job.jobTitle}</span>
                      </div>: <span>{selfAdded?job.jobTitle:job.jobId.job}</span>}
                  </td>

                  <td className="text-ink-600">
                    {selfAdded
                      ? job.company
                      : job.source === "internal"
                      ? job.jobId.company.companyName
                      : job.jobId.company}
                  </td>

                  <td className="text-ink-600">
                    {selfAdded ? job.location : job.jobId.country}
                  </td>

                  <td className="capitalize text-ink-600">
                    {selfAdded ? job.jobType : job.source === "internal" ? job.jobId.type : "-"}
                  </td>

                  <td>
                    {selfAdded ? (
                      <ExternalLink href={job.link}>View</ExternalLink>
                    ) : job.source === "external" ? (
                      <ExternalLink href={job.jobId.finalUrl}>View</ExternalLink>
                    ) : (
                      "-"
                    )}
                  </td>

                  <td>
                    <StatusChip status={job.status} />
                  </td>
                </tr>
                );
              })}
          </tbody>
        </table>
        </div>
        ):(
           <div className="flex flex-col gap-4">
              {displayedjobs.map((job, idx) => {
                const selfAdded = isSelfAddedJob(job);
                return(
                <div
                  key={idx}
                  className="jm-card p-4 flex flex-col gap-2"
                >
                  {selfAdded?
                  <div className="flex items-start justify-between gap-3">
                      <p className="text-base font-semibold text-navy">{job.jobTitle}</p>
                      {deleteButton(job._id)}
                  </div>: <p className="text-base font-semibold text-navy">{selfAdded?job.jobTitle:job.jobId.job}</p>}


                  <p className="text-sm text-ink-600">
                    <strong className="text-ink">Company:</strong>{" "}
                    {selfAdded?job.company:job.source === "internal"
                      ? job.jobId.company.companyName
                      : job.jobId.company}
                  </p>

                  <p className="text-sm text-ink-600">
                    <strong className="text-ink">Location:</strong> {selfAdded?job.location:job.jobId.country}
                  </p>

                  <p className="text-sm text-ink-600 capitalize">
                    <strong className="text-ink normal-case">Type:</strong>{" "}
                    {selfAdded?job.jobType:job.source === "internal" ? job.jobId.type : "-"}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <StatusChip status={job.status} />

                    {job.source === "external" && (
                      <ExternalLink href={selfAdded?job.link:job.jobId.finalUrl}>View Job</ExternalLink>
                    )}
                  </div>
                </div>
                )
              })}
            </div>
          )
        }

        {pagination}
    </div>
  );
};

export default JobManagement;
