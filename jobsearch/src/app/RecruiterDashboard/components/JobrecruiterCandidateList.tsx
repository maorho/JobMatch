import ResumeLink from "@/app/components/ResumeLink";
import { Pagination } from "@/app/components/ui";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { PdfIcon } from "@/app/components/icons";
import { Search } from "lucide-react"; // אייקון זכוכית מגדלת
import { useIsMobile } from "@/app/lib/hooks/useIsMobile";
import { useT } from "@/app/lib/i18n/LanguageProvider";

// Application stages. The values are stored in English on the server; only the labels are translated.
const STATUSES = [
  "Rejected",
  "HR Phone Interview",
  "Technical Interview",
  "Final Interview",
  "Recived an Offer",
  "Accepted",
] as const;
type Status = (typeof STATUSES)[number];
const statusKey = (s: Status): `recruiter.status.${Status}` => `recruiter.status.${s}`;
const isKnownStatus = (s: string): s is Status => (STATUSES as readonly string[]).includes(s);


interface ApplicantStatusProps {
  candidate: Candidate;
  bg_option_color: Record<string, string>;
  updateStatuses: Map<string, string>;
  setStatus: (
    userID: string,
    newStatus: string,
    originalStatus: string
  ) => void;
}

const ApplicantStatus: React.FC<ApplicantStatusProps> = ({
  candidate,
  bg_option_color,
  updateStatuses,
  setStatus,
}) => {
  const { t } = useT();
  const label = (s: string) => (isKnownStatus(s) ? t(statusKey(s)) : s);
  return (
    <select
      className={`jm-input jm-select py-2 text-xs sm:text-sm w-full md:w-44 ${
        bg_option_color[candidate.status] || ""
      }`}
      value={updateStatuses.get(candidate.candidateId._id) || candidate.status}
      onChange={(e) =>
        setStatus(candidate.candidateId._id, e.target.value, candidate.status)
      }
    >
      <option value={candidate.status}>{label(candidate.status)}</option>
      {STATUSES.map((s) => (
        <option key={s} value={s} className="bg-surface text-ink">
          {t(statusKey(s))}
        </option>
      ))}
    </select>
  );
};

interface JobrecruiterCandidateListProps {
  jobId: string;
  company: string;
  updateStatuses: Map<string, string>;
  setUpdatedStatuses: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  setTotalCandidates: React.Dispatch<React.SetStateAction<number>>;
  setUnderReview: React.Dispatch<React.SetStateAction<number>>;
  setShortlisted: React.Dispatch<React.SetStateAction<number>>;
  setRejected: React.Dispatch<React.SetStateAction<number>>;
  onRegisterRefresh?: (
    refreshFn: () => Promise<{
      total: number;
      underReview: number;
      shortlisted: number;
      rejected: number;
    } | null>
  ) => void;
}

interface Candidate {
  candidateId: {
    _id: string;
    fullname: string;
    email: string;
    phone: string;
    resume: string;
  };
  status: string;
}



const JobrecruiterCandidateList: React.FC<JobrecruiterCandidateListProps> = ({
  jobId,
  company,
  updateStatuses,
  setUpdatedStatuses,
  setTotalCandidates,
  setUnderReview,
  setShortlisted,
  setRejected,
  onRegisterRefresh,
}) => {
  const { t, dir } = useT();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const isMobile = useIsMobile();
  const itemsPerPage = 5;

  const candidateList = async () => {
    try {
      const res = await fetch(
        `/api/jobsDashboard/Recruiter/jobsOverallCandidates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, companyName: company }),
        }
      );
      if (!res.ok) throw new Error(`failed to fetch candidates`);
      const data: Candidate[] = await res.json();

      setCandidates(data);

      const under_review_candidates = data.filter(
        (e) => e.status !== "Accepted" && e.status !== "Rejected"
      );
      const shortlisted_candidates = data.filter(
        (e) => e.status === "Accepted" || e.status === "Recived an Offer"
      );
      const rejected_candidates = data.filter((e) => e.status === "Rejected");

      // עדיין נעדכן את הסטייטים בבן
      setTotalCandidates(data.length);
      setUnderReview(under_review_candidates.length);
      setShortlisted(shortlisted_candidates.length);
      setRejected(rejected_candidates.length);

      // ✅ נחזיר ערכים לאב
      return {
        total: data.length,
        underReview: under_review_candidates.length,
        shortlisted: shortlisted_candidates.length,
        rejected: rejected_candidates.length,
      };
    } catch (err) {
      console.error("something went wrong", err);
      return null;
    }
  };

  useEffect(() => {
    if (onRegisterRefresh) {
      onRegisterRefresh(candidateList);
    }
  }, []);

  useEffect(() => {
    candidateList();
  }, []);

  const setStatus = (
    userID: string,
    newStatus: string,
    originalStatus: string
  ) => {
    if (newStatus !== originalStatus) {
      const newMap = new Map(updateStatuses);
      newMap.set(userID, newStatus);
      setUpdatedStatuses(newMap);
    }
  };

  // Tint the status select by the candidate's current stage.
  const bg_option_color: Record<string, string> = {
    Rejected: "bg-red-50 text-red-700 border-red-200",
    "HR Phone Interview": "bg-sky-50 text-sky-600 border-sky/20",
    "Technical Interview": "bg-sky-50 text-sky-600 border-sky/20",
    "Final Interview": "bg-teal-50 text-teal-600 border-teal/20",
    "Recived an Offer": "bg-emerald-50 text-emerald-700 border-emerald-200",
    Accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };

  // ✅ סינון לפי סטטוס וחיפוש
  const filteredCandidates = candidates.filter((c) => {
    const matchesStatus = filterStatus === "All" || c.status === filterStatus;
    const matchesSearch =
      c.candidateId.fullname.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.candidateId.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.candidateId.phone.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // ✅ Pagination logic
  const totalPages = Math.ceil(filteredCandidates.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const displayedCandidates = filteredCandidates.slice(
    startIndex,
    startIndex + itemsPerPage
  );

  const messageLink = (candidate: Candidate, label: React.ReactNode) => (
    <Link
      href={`/messages?to=${candidate.candidateId._id}&job=${jobId}`}
      title={t("recruiter.list.messageTitle")}
      className="jm-btn jm-btn-ghost jm-btn-sm"
    >
      {label}
    </Link>
  );

  return (
    <div className="jm-card p-4 sm:p-5 space-y-4" dir={dir}>
        {/* Header with search + filter */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* כותרת */}
          <h3 className="jm-h2">
            {t("recruiter.list.title")}
          </h3>

          {/* קונטיינר של חיפוש + פילטר */}
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            {/* תיבת חיפוש */}
            <div className="relative flex-1 sm:min-w-[220px]">
              <Search
                className="absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400 pointer-events-none"
              />
              <input
                type="text"
                placeholder={t("recruiter.list.searchPh")}
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="jm-input ps-10 py-2.5"
              />
            </div>

            {/* פילטר סטטוסים */}
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="jm-input jm-select py-2.5 sm:w-auto"
            >
              <option value="All">{t("recruiter.list.all")}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(statusKey(s))}
                </option>
              ))}
            </select>
          </div>
        </div>


        {/* Table */}
        {!isMobile?
        <div className="overflow-x-auto">
             <table className="jm-table">
              <thead>
                <tr>
                  <th>{t("recruiter.list.fullName")}</th>
                  <th>{t("recruiter.list.contact")}</th>
                  <th>{t("recruiter.list.resume")}</th>
                  <th>{t("recruiter.list.status")}</th>
                  <th>{t("recruiter.list.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {displayedCandidates.map((candidate, ind) => (
                  <tr key={ind}>
                    <td className="font-semibold text-navy">
                      <div className="flex items-center gap-1">
                        {candidate.candidateId.fullname}
                        {messageLink(candidate, "💬")}
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col">
                        <span className="font-medium text-ink" dir="ltr">
                          {candidate.candidateId.email}
                        </span>
                        <span className="text-ink-600" dir="ltr">{candidate.candidateId.phone}</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <PdfIcon />
                        <ResumeLink resumeKey={candidate.candidateId.resume} />
                      </div>
                    </td>
                    <td>
                      <ApplicantStatus
                        candidate={candidate}
                        bg_option_color={bg_option_color}
                        updateStatuses={updateStatuses}
                        setStatus={setStatus}
                      />
                    </td>
                    <td>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
       :
       <div className="flex flex-col gap-4">
            {displayedCandidates.map((candidate, ind)  => (
               <div
                key={ind}
                className="jm-card p-4 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-base font-semibold text-navy">{candidate.candidateId.fullname}</p>
                </div>
                <p className="text-sm text-ink-600">
                    <strong className="text-ink">{t("recruiter.list.email")}</strong> <span dir="ltr">{candidate.candidateId.email}</span>
                </p>
                <p className="text-sm text-ink-600">
                    <strong className="text-ink">{t("recruiter.list.phone")}</strong> <span dir="ltr">{candidate.candidateId.phone}</span>
                </p>
                <div className="flex items-center gap-2">
                    <PdfIcon />
                    <ResumeLink resumeKey={candidate.candidateId.resume} />
                </div>
                <div>
                  <span className="jm-label">{t("recruiter.list.status")}</span>
                  <ApplicantStatus
                    candidate={candidate}
                    bg_option_color={bg_option_color}
                    updateStatuses={updateStatuses}
                    setStatus={setStatus}
                  />
                </div>
                <div className="flex justify-end">
                  {messageLink(candidate, t("recruiter.list.message"))}
                </div>
              </div>
            )

            )
          }
          </div>
       }


        {/* ✅ Pagination Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-line">
          <p className="jm-muted">
            {t("recruiter.list.showing", {
              from: startIndex + 1,
              to: Math.min(startIndex + itemsPerPage, filteredCandidates.length),
              total: filteredCandidates.length,
            })}
          </p>

          <Pagination page={currentPage} total={totalPages} onChange={setCurrentPage} />
        </div>
    </div>
  );
};

export default JobrecruiterCandidateList;
