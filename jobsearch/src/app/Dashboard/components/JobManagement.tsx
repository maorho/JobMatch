import { useIsMobile } from "@/app/lib/hooks/useIsMobile";
import { Pagination } from "@/app/components/ui";
import React, { useState } from "react";
import { isSelfAddedJob } from "../../../../utils/isSelfAddedJob";
import { DeleteIcon } from "@/app/components/icons";
import { EmptyState } from "@/app/components/ui";
import { ConfirmInline, InlineNotice } from "@/app/components/Dialog";
import { useT } from "@/app/lib/i18n/LanguageProvider";
import { STATUS_LABEL_KEY, TYPE_LABEL_KEY } from "@/app/lib/i18n/dict/dashboard";

interface JobManagementProps {
  jobs: any[];
  /** Called after a successful change so the parent can revalidate its list at once. */
  onChanged?: () => void;
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

const StatusChip = ({ status }: { status?: string }) => {
  const { t } = useT();
  const label = status ? (status in STATUS_LABEL_KEY ? t(STATUS_LABEL_KEY[status as keyof typeof STATUS_LABEL_KEY]) : status) : "-";
  return <span className={`jm-chip ${chipByStatus[status || ""] || ""}`}>{label}</span>;
};

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

const JobManagement: React.FC<JobManagementProps> = ({ jobs, onChanged }) => {
  const { t } = useT();
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 5;
  const totalPages = Math.ceil(jobs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const displayedjobs = jobs.slice(
    startIndex,
    startIndex + itemsPerPage
  );
  const isMobile = useIsMobile();
  // Inline replacements for confirm()/alert().
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Stored work-mode values are English enums; show them in the interface language.
  const typeLabel = (s: string) => (s in TYPE_LABEL_KEY ? t(TYPE_LABEL_KEY[s as keyof typeof TYPE_LABEL_KEY]) : s);

  const handleDeleteSelfJob = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/jobsDashboard/Candidate/deleteSelfAddedJob?jobId=${encodeURIComponent(pendingDelete.id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        setNotice({ kind: "ok", text: t("dashboard.table.deleted") });
        onChanged?.(); // refresh the list now instead of waiting for the poll
      } else {
        setNotice({ kind: "err", text: t("common.somethingWrong") });
      }
    } catch {
      setNotice({ kind: "err", text: t("common.somethingWrong") });
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  const deleteButton = (jobID: string, title: string) => (
    <button
      type="button"
      onClick={() => {
        setNotice(null);
        setPendingDelete({ id: jobID, title });
      }}
      className="jm-btn jm-btn-ghost jm-btn-icon h-9 w-9 shrink-0"
      aria-label={t("dashboard.table.deleteJob")}
      title={t("dashboard.table.deleteJob")}
    >
      <DeleteIcon />
    </button>
  );

  const feedback = pendingDelete ? (
    <ConfirmInline
      text={t("dashboard.table.confirmDelete", { title: pendingDelete.title })}
      confirmLabel={t("dashboard.table.delete")}
      cancelLabel={t("dashboard.table.cancel")}
      danger
      busy={deleting}
      onConfirm={handleDeleteSelfJob}
      onCancel={() => setPendingDelete(null)}
    />
  ) : notice ? (
    <InlineNotice kind={notice.kind} onDismiss={() => setNotice(null)}>
      {notice.text}
    </InlineNotice>
  ) : null;

  const rowKey = (job: any, idx: number) => String(job?._id ?? job?.jobId?._id ?? idx);

  const pagination = (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-line">
      {!isMobile ? (
        <p className="jm-muted">
          {t("dashboard.table.showing", { from: startIndex + 1, to: Math.min(startIndex + itemsPerPage, jobs.length), total: jobs.length })}
        </p>
      ) : (
        <span />
      )}

      <Pagination page={currentPage} total={totalPages} onChange={setCurrentPage} />
    </div>
  );

  if (jobs.length === 0) {
    return (
      <div className="space-y-4">
        {feedback}
        <EmptyState icon="📋" title={t("dashboard.table.empty")} />
      </div>
    );
  }

  return (
    <div className="jm-card p-4 sm:p-5 space-y-4">
        {feedback}
        {!isMobile?(
          <div className="overflow-x-auto">
          <table className="jm-table">
            <thead>
            <tr>
              <th>{t("dashboard.table.job")}</th>
              <th>{t("dashboard.table.company")}</th>
              <th>{t("dashboard.table.location")}</th>
              <th>{t("dashboard.table.type")}</th>
              <th>{t("dashboard.table.link")}</th>
              <th>{t("dashboard.table.status")}</th>
            </tr>
          </thead>
          <tbody className="text-ink">
            {displayedjobs.map((job, idx) => {
              const selfAdded = isSelfAddedJob(job);
              const type = selfAdded ? job.jobType : job.source === "internal" ? job.jobId.type : "";

              return (
                <tr key={rowKey(job, idx)}>
                  <td className="font-semibold text-navy">
                    {selfAdded?
                      <div className="flex items-center gap-3">
                          {deleteButton(job._id, job.jobTitle)}
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
                    {type ? typeLabel(type) : "-"}
                  </td>

                  <td>
                    {selfAdded ? (
                      <ExternalLink href={job.link}>{t("dashboard.table.view")}</ExternalLink>
                    ) : job.source === "external" ? (
                      <ExternalLink href={job.jobId.finalUrl}>{t("dashboard.table.view")}</ExternalLink>
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
                const type = selfAdded ? job.jobType : job.source === "internal" ? job.jobId.type : "";
                return(
                <div
                  key={rowKey(job, idx)}
                  className="jm-card p-4 flex flex-col gap-2"
                >
                  {selfAdded?
                  <div className="flex items-start justify-between gap-3">
                      <p className="text-base font-semibold text-navy">{job.jobTitle}</p>
                      {deleteButton(job._id, job.jobTitle)}
                  </div>: <p className="text-base font-semibold text-navy">{selfAdded?job.jobTitle:job.jobId.job}</p>}


                  <p className="text-sm text-ink-600">
                    <strong className="text-ink">{t("dashboard.table.company")}:</strong>{" "}
                    {selfAdded?job.company:job.source === "internal"
                      ? job.jobId.company.companyName
                      : job.jobId.company}
                  </p>

                  <p className="text-sm text-ink-600">
                    <strong className="text-ink">{t("dashboard.table.location")}:</strong> {selfAdded?job.location:job.jobId.country}
                  </p>

                  <p className="text-sm text-ink-600 capitalize">
                    <strong className="text-ink normal-case">{t("dashboard.table.type")}:</strong>{" "}
                    {type ? typeLabel(type) : "-"}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <StatusChip status={job.status} />

                    {job.source === "external" && (
                      <ExternalLink href={selfAdded?job.link:job.jobId.finalUrl}>{t("dashboard.table.viewJob")}</ExternalLink>
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
