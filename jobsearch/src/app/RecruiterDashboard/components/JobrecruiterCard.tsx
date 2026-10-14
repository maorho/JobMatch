"use client";

import React, { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/app/lib/hooks/useCurrentUser";
import JobrecruiterCandidateList from "./JobrecruiterCandidateList";
import CompanyLogo from "@/app/components/CompanyLogo";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime.js";
import { CloseIcon, EditIcon, UpdateIcon } from "@/app/components/icons";
import { DeleteIcon } from "lucide-react";
import { useIsMobile } from "@/app/lib/hooks/useIsMobile";
import { ConfirmInline, InlineNotice, Modal } from "@/app/components/Dialog";

interface TagCompProps {
  headline: string;
  number: number;
}
const TagComp: React.FC<TagCompProps> = ({ headline, number }) => (
  <div className="jm-card p-4 sm:p-5">
    <div className="text-2xl sm:text-3xl font-semibold text-navy leading-none">{number}</div>
    <div className="jm-muted mt-2">{headline}</div>
  </div>
);

interface JobrecruiterCardProps {
  job: any;
  jobIndex: number;
  onSuccess?: () => void;
}

const JobrecruiterCard: React.FC<JobrecruiterCardProps> = ({
  job,
  jobIndex,
  onSuccess,
}) => {
  const [showModal, setShowModal] = useState(false);
  // Inline replacements for confirm()/alert(): a pending delete question and a result notice.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [totalCandidates, setTotalCandidates] = useState(0);
  const [underReview, setUnderReview] = useState(0);
  const [shortlisted, setShortlisted] = useState(0);
  const [rejected, setRejected] = useState(0);
  const isMobile = useIsMobile();
  const [refreshCandidates, setRefreshCandidates] = useState<
    () => Promise<{
      total: number;
      underReview: number;
      shortlisted: number;
      rejected: number;
    } | null>
  >(() => Promise.resolve(null));

  const [updateStatuses, setUpdatedStatuses] = useState<Map<string, string>>(
    new Map()
  );
  const handleRegisterRefresh = useCallback(
    (
      fn: () => Promise<{
        total: number;
        underReview: number;
        shortlisted: number;
        rejected: number;
      } | null>
    ) => setRefreshCandidates(() => fn),
    []
  );

  const { user } = useCurrentUser();
  const router = useRouter();
  dayjs.extend(relativeTime);
  const time = dayjs(job.createdAt).fromNow();
  const tag_json: { headline: string; number: number }[] = [
    { headline: "Total Candidates", number: totalCandidates },
    { headline: "Under reviews", number: underReview },
    { headline: "Shortlisted", number: shortlisted },
    { headline: "Rejected", number: rejected },
  ];
  if (!user) return null;
  const isPublisher =
    user.admin === true ||
    (!!job.publisher && user.id.toString() === String(job.publisher));
  const handleUpdate = async () => {
    try {
      const res = await fetch("/api/jobsDashboard/Recruiter/changeStatus", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job._id,
          updateStatuses: Object.fromEntries(updateStatuses),
        }),
      });

      if (!res.ok) throw new Error("Failed to update candidate statuses");

      await res.json();
      const newMap = new Map();
      setUpdatedStatuses(newMap);

      // ✅ עכשיו נקבל מהבן את הנתונים המעודכנים
      const refreshed = await refreshCandidates();
      if (refreshed) {
        setTotalCandidates(refreshed.total);
        setUnderReview(refreshed.underReview);
        setShortlisted(refreshed.shortlisted);
        setRejected(refreshed.rejected);
      }
    } catch (err) {
      console.error("Error updating statuses:", err);
    }
  };

  const handleClick = () => {
    if (isPublisher) setShowModal(true);
  };

  const askDelete = (e?: React.MouseEvent) => {
    e?.stopPropagation(); // the card itself opens the modal on click
    setNotice(null);
    setConfirmingDelete(true);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/jobsDashboard/Recruiter/deleteJob?jobId=${job._id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        setNotice({ kind: "ok", text: "Job deleted" });
        setShowModal(false);
        if (onSuccess) onSuccess();
      } else {
        setNotice({ kind: "err", text: "Something went wrong" });
      }
    } catch {
      setNotice({ kind: "err", text: "Something went wrong" });
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  const deletePrompt = confirmingDelete ? (
    <ConfirmInline
      text={`Delete "${job.job}"? This cannot be undone.`}
      confirmLabel="Delete"
      cancelLabel="Cancel"
      danger
      busy={deleting}
      onConfirm={handleDelete}
      onCancel={() => setConfirmingDelete(false)}
    />
  ) : notice ? (
    <div onClick={(e) => e.stopPropagation()}>
      <InlineNotice kind={notice.kind} onDismiss={() => setNotice(null)}>
        {notice.text}
      </InlineNotice>
    </div>
  ) : null;

  return (
    <>
      <motion.div
        onClick={handleClick}
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: jobIndex * 0.05, duration: 0.5 }}
        className="jm-card jm-card-hover p-5 h-full flex flex-col gap-4 cursor-pointer"
      >
        {/* כותרת עליונה */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-semibold text-navy truncate">
              {job.job}
            </h2>
            {/* מיקום וזמן */}
            <p className="text-sm text-ink-600 truncate mt-1">
              {job.city}, {job.country}
              <span className="text-ink-400"> · {time}</span>
            </p>
          </div>
          <CompanyLogo
            name={job.company?.companyName ?? ""}
            domain={job.companyDomain}
            logoUrl={job.logoUrl}
            className="h-10 w-10 shrink-0 rounded-xl border border-line p-1"
          />
        </div>

        {/* תיאור */}
        <p className="line-clamp-3 text-sm text-ink-600 leading-relaxed">
          {job.description}
        </p>

        {/* תגיות */}
        <div className="flex flex-wrap gap-2">
          <span className="jm-chip">Project Strategy</span>
          <span className="jm-chip">Cloud</span>
          <span className="jm-chip">AWS</span>
        </div>

        {!showModal && deletePrompt}

        {/* כפתורים בתחתית */}
        <div className="grid grid-cols-2 gap-3 pt-4 mt-auto border-t border-line">
          <button
          onClick={(e) => {
                    e.stopPropagation();
                    setShowModal(false);
                    router.push(`/RecruiterDashboard/Edit/${job._id}`);
                  }}
          className="jm-btn jm-btn-secondary jm-btn-sm">
            Edit Position
          </button>
          <button
            onClick={askDelete}
           className="jm-btn jm-btn-danger jm-btn-sm">
            Delete Job
          </button>
        </div>
      </motion.div>

      {/* Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} label={job.job}>
          <div className="jm-card w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* כותרת + כפתורים */}
            <div className="flex items-center justify-between gap-3 p-4 sm:p-5 border-b border-line">
              <h2 className="jm-h2 truncate">
                {job.job}
              </h2>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  className="jm-btn jm-btn-secondary jm-btn-sm"
                  onClick={() => {
                    setShowModal(false);
                    router.push(`/RecruiterDashboard/Edit/${job._id}`);
                  }}
                >
                  <EditIcon />
                  {!isMobile&&'Edit Position'}
                </button>
                <button
                  className="jm-btn jm-btn-primary jm-btn-sm"
                  onClick={handleUpdate}
                >
                  <UpdateIcon />
                  {!isMobile&&'Update Statuses'}
                </button>
                <button
                  className="jm-btn jm-btn-danger jm-btn-icon h-9 w-9"
                  onClick={askDelete}
                  aria-label="Delete job"
                >
                  <DeleteIcon className="h-4 w-4" />
                </button>
                <button
                  className="jm-btn jm-btn-ghost jm-btn-icon h-9 w-9 text-ink-400"
                  onClick={() => setShowModal(false)}
                  aria-label="Close"
                >
                  <CloseIcon color="currentColor" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto jm-scroll bg-canvas p-4 sm:p-5 space-y-5">
              {deletePrompt}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {
                  tag_json.map((x,idx)=>(<TagComp key={idx} headline={x.headline} number={x.number} />))
                }
              </div>
              {/* רשימת מועמדים */}
              <JobrecruiterCandidateList
                jobId={job._id}
                company={job.company.companyName}
                updateStatuses={updateStatuses}
                setUpdatedStatuses={setUpdatedStatuses}
                setTotalCandidates={setTotalCandidates}
                setUnderReview={setUnderReview}
                setShortlisted={setShortlisted}
                setRejected={setRejected}
                onRegisterRefresh={handleRegisterRefresh}
              />
            </div>
          </div>
      </Modal>
    </>
  );
};

export default JobrecruiterCard;
