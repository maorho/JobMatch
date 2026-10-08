import ResumeLink from "@/app/components/ResumeLink";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { DeleteIcon, PdfIcon } from "@/app/components/icons";
import { Search } from "lucide-react"; // אייקון זכוכית מגדלת
import { useIsMobile } from "@/app/lib/hooks/useIsMobile";


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
}) => (
  <select
    className={`jm-input jm-select py-2 text-xs sm:text-sm w-full md:w-44 ${
      bg_option_color[candidate.status] || ""
    }`}
    value={updateStatuses.get(candidate.candidateId._id) || candidate.status}
    onChange={(e) =>
      setStatus(candidate.candidateId._id, e.target.value, candidate.status)
    }
  >
    <option value={candidate.status}>{candidate.status}</option>
    <option value="Rejected" className="bg-surface text-ink">
      Rejected
    </option>
    <option value="HR Phone Interview" className="bg-surface text-ink">
      HR Phone Interview
    </option>
    <option value="Technical Interview" className="bg-surface text-ink">
      Technical Interview
    </option>
    <option value="Final Interview" className="bg-surface text-ink">
      Final Interview
    </option>
    <option value="Recived an Offer" className="bg-surface text-ink">
      Recived an Offer
    </option>
    <option value="Accepted" className="bg-surface text-ink">
      Accepted
    </option>
  </select>
);

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
      title="שלח הודעה למועמד/ת"
      className="jm-btn jm-btn-ghost jm-btn-sm"
    >
      {label}
    </Link>
  );

  const deleteButton = (
    <button
      type="button"
      className="jm-btn jm-btn-ghost jm-btn-icon h-9 w-9"
      aria-label="Delete candidate"
    >
      <DeleteIcon />
    </button>
  );

  return (
    <div className="jm-card p-4 sm:p-5 space-y-4">
        {/* Header with search + filter */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* כותרת */}
          <h3 className="jm-h2">
            Candidates
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
                placeholder="Search candidates..."
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
              <option value="All">All</option>
              <option value="Rejected">Rejected</option>
              <option value="HR Phone Interview">HR Phone Interview</option>
              <option value="Technical Interview">Technical Interview</option>
              <option value="Final Interview">Final Interview</option>
              <option value="Recived an Offer">Recived an Offer</option>
              <option value="Accepted">Accepted</option>
            </select>
          </div>
        </div>


        {/* Table */}
        {!isMobile?
        <div className="overflow-x-auto">
             <table className="jm-table">
              <thead>
                <tr>
                  <th>Full Name</th>
                  <th>Contact</th>
                  <th>Resume</th>
                  <th>Status</th>
                  <th>Actions</th>
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
                        <span className="font-medium text-ink">
                          {candidate.candidateId.email}
                        </span>
                        <span className="text-ink-600">{candidate.candidateId.phone}</span>
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
                      {deleteButton}
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
                  {deleteButton}
                </div>
                <p className="text-sm text-ink-600">
                    <strong className="text-ink">Email:</strong> {candidate.candidateId.email}
                </p>
                <p className="text-sm text-ink-600">
                    <strong className="text-ink">Phone:</strong> {candidate.candidateId.phone}
                </p>
                <div className="flex items-center gap-2">
                    <PdfIcon />
                    <ResumeLink resumeKey={candidate.candidateId.resume} />
                </div>
                <div>
                  <span className="jm-label">Status</span>
                  <ApplicantStatus
                    candidate={candidate}
                    bg_option_color={bg_option_color}
                    updateStatuses={updateStatuses}
                    setStatus={setStatus}
                  />
                </div>
                <div className="flex justify-end">
                  {messageLink(candidate, "💬 הודעה")}
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
            Showing {startIndex + 1}–
            {Math.min(startIndex + itemsPerPage, filteredCandidates.length)} of{" "}
            {filteredCandidates.length} candidates
          </p>

          <div className="flex items-center gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(currentPage - 1)}
              className="jm-btn jm-btn-secondary jm-btn-sm"
            >
              Previous
            </button>
            <span className="jm-muted px-1 whitespace-nowrap">
              Page {currentPage} of {Math.max(totalPages, 1)}
            </span>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(currentPage + 1)}
              className="jm-btn jm-btn-secondary jm-btn-sm"
            >
              Next
            </button>
          </div>
        </div>
    </div>
  );
};

export default JobrecruiterCandidateList;
