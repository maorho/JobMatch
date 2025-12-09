import ResumeLink from "@/app/components/ResumeLink";
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
    className={`pl-2.5 mt-1 w-36 h-10 lg:rounded-[14px] rounded-[8px] text-[12px] ${
      bg_option_color[candidate.status] || "bg-white"
    }`}
    value={updateStatuses.get(candidate.candidateId._id) || candidate.status}
    onChange={(e) =>
      setStatus(candidate.candidateId._id, e.target.value, candidate.status)
    }
  >
    <option value={candidate.status}>{candidate.status}</option>
    <option value="Rejected" className="bg-white">
      Rejected
    </option>
    <option value="HR Phone Interview" className="bg-white">
      HR Phone Interview
    </option>
    <option value="Technical Interview" className="bg-white">
      Technical Interview
    </option>
    <option value="Final Interview" className="bg-white">
      Final Interview
    </option>
    <option value="Recived an Offer" className="bg-white">
      Recived an Offer
    </option>
    <option value="Accepted" className="bg-white">
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

  const bg_option_color: Record<string, string> = {
    Rejected: "bg-red-400",
    "HR Phone Interview": "bg-blue-400",
    "Technical Interview": "bg-purple-400",
    "Final Interview": "bg-cyan-300",
    "Recived an Offer": "bg-amber-300",
    Accepted: "bg-green-400",
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

  return (
    <div className="flex justify-center items-start my-5 bg-gray-100 border-2 border-gray-100 rounded-[8px] lg:rounded-[14px]">
      <div className="flex flex-col w-full">
        {/* Header with search + filter */}
       <div className="
              flex 
              bg-white 
              py-5 
              px-6 
              mb-5 
              rounded-t-[14px] 
              justify-between 
              items-center 
              flex-wrap 
              gap-3
            ">

              {/* כותרת */}
              <label className="
                lg:text-[20px] 
                text-[16px] 
                font-outfit 
                font-semibold
                w-full 
                md:w-auto
              ">
                Candidates
              </label>

              {/* קונטיינר של חיפוש + פילטר */}
              <div className="
                flex 
                md:flex-row 
                flex-col 
                items-center 
                gap-3 
                w-full 
                md:w-auto
              ">

                {/* תיבת חיפוש */}
                <div className="relative w-full md:w-auto">
                  <Search
                    className="absolute left-3 top-2.5 text-gray-400"
                    size={18}
                  />
                  <input
                    type="text"
                    placeholder="Search candidates..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="
                      pl-9 
                      pr-3 
                      py-2 
                      border 
                      border-gray-300 
                      rounded-md 
                      text-sm 
                      w-full 
                      md:w-[200px]
                      focus:outline-none 
                      focus:ring-2 
                      focus:ring-blue-400
                    "
                  />
                </div>

                {/* פילטר סטטוסים */}
                <select
                  value={filterStatus}
                  onChange={(e) => {
                    setFilterStatus(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="
                    border 
                    border-gray-300 
                    rounded-md 
                    px-3 
                    py-2 
                    text-sm 
                    w-full 
                    md:w-auto
                    focus:outline-none
                  "
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
        <div className="overflow-x-auto w-full">
             <table className="min-w-full table-auto border-collapse text-center">
              <thead className="bg-[#E5E7EB]/20 text-[#6B7280]">
                <tr className="gap-5 font-semibold px-6 py-5 border-b px-auto">
                  <td>Full Name</td>
                  <td>Contact</td>
                  <td>Resume</td>
                  <td>Status</td>
                  <td>Actions</td>
                </tr>
              </thead>
              <tbody>
                {displayedCandidates.map((candidate, ind) => (
                  <tr key={ind} className="border-b border-[#E5E7EB]/10 bg-white">
                    <td className="px-6 py-4">{candidate.candidateId.fullname}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <label className="font-outfit font-medium">
                          {candidate.candidateId.email}
                        </label>
                        <label>{candidate.candidateId.phone}</label>
                      </div>
                    </td>
                    <td className="flex justify-center items-center gap-2 px-6 py-4">
                      <PdfIcon />
                      <ResumeLink resumeKey={candidate.candidateId.resume} />
                    </td>
                    <td className="px-6 py-4">
                      <ApplicantStatus
                        candidate={candidate}
                        bg_option_color={bg_option_color}
                        updateStatuses={updateStatuses}
                        setStatus={setStatus}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center">
                        <DeleteIcon color="#DC2626" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
       :
       <div className="flex flex-col gap-4 items-center mb-5">
            {displayedCandidates.map((candidate, ind)  => (
               <div
                key={ind}
                className="bg-white p-4 rounded-xl shadow  min-w-[300px] max-w-[450px] border border-gray-200 flex flex-col gap-2"
              >
              <div>
                <p className="text-[14px] text-gray-700">
                    <strong>Full Name:</strong>{candidate.candidateId.fullname} 

                </p>
        
                <p className="text-[14px] text-gray-700">
                    <strong>Email:</strong> {candidate.candidateId.email}
                </p>
                <p className="text-[14px] text-gray-700">
                    <strong>Phone:</strong> {candidate.candidateId.phone}
                </p>
                <div className="flex">
                    <PdfIcon />
                    <ResumeLink resumeKey={candidate.candidateId.resume} />
                </div>
                <p className="text-[14px] text-gray-700">
                    <strong>Status:</strong> {candidate.status}
                </p>       
              </div>
               <div>
                <button>
                  <DeleteIcon color="#DC2626" />
                </button>
                   
               </div> 
              </div>
            )
             
            ) 
          }
          </div>
       }
        

        {/* ✅ Pagination Controls */}
        <div className="flex justify-between items-center px-6 py-4 bg-white border-t border-gray-200 rounded-b-[14px]">
          <p className="text-sm text-gray-500">
            Showing {startIndex + 1}–
            {Math.min(startIndex + itemsPerPage, filteredCandidates.length)} of{" "}
            {filteredCandidates.length} candidates
          </p>

          <div className="flex items-center gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(currentPage - 1)}
              className={`px-3 py-1 border rounded ${
                currentPage === 1
                  ? "text-gray-400 border-gray-200 cursor-not-allowed"
                  : "text-blue-600 border-gray-300 hover:bg-gray-100"
              }`}
            >
              Previous
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`px-3 py-1 border rounded ${
                  currentPage === page
                    ? "bg-blue-500 text-white border-blue-500"
                    : "text-gray-700 border-gray-300 hover:bg-gray-100"
                }`}
              >
                {page}
              </button>
            ))}

            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(currentPage + 1)}
              className={`px-3 py-1 border rounded ${
                currentPage === totalPages
                  ? "text-gray-400 border-gray-200 cursor-not-allowed"
                  : "text-blue-600 border-gray-300 hover:bg-gray-100"
              }`}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobrecruiterCandidateList;