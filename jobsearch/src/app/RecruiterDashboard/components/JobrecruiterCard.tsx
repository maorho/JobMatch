"use client";

import React, { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/app/lib/hooks/useCurrentUser";
import JobrecruiterCandidateList from "./JobrecruiterCandidateList";
import { GoogleIcon } from "@/app/components/JobCard";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime.js";
import { CloseIcon, EditIcon, UpdateIcon } from "@/app/components/icons";
import { DeleteIcon } from "lucide-react";
import { useIsMobile } from "@/app/lib/hooks/useIsMobile";

interface TagCompProps {
  headline: string;
  number: number;
}
const TagComp: React.FC<TagCompProps> = ({ headline, number }) => (
  <div className="flex justify-between items-center py-4 px-6 bg-white rounded-[12px] border border-black/30 shadow-sm w-full max-w-[250px]">
    <div className="flex flex-col">
      <label className="font-outfit font-medium text-[14px]">{headline}</label>
      <label className="font-outfit font-bold text-[30px]">{number}</label>
    </div>
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
  const isPublisher = user.id.toString() === job.publisher.toString()|| user.admin === true;
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

      const result = await res.json();
      console.log("Update success:", result);
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

  const handleDelete = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this job?"
    );
    if (!confirmed) return;

    const res = await fetch(`/api/jobsDashboard/Recruiter/deleteJob?jobId=${job._id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });

    if (res.ok) {
      alert("Job deleted");
      setShowModal(false);
      if (onSuccess) onSuccess();
    } else {
      alert("Something went wrong");
    }
    setShowModal(false);
  };

  return (
    <>
      <motion.div
        onClick={handleClick}
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: jobIndex * 0.05, duration: 0.5 }}
        className="
          relative
          px-4 py-3
          w-full max-w-[360px]
          h-[320px] sm:h-[320px]
          font-outfit
          border border-[#000000]/10
          rounded-[30px]
          m-auto mb-6
          cursor-pointer
          hover:scale-105
          transition-transform
          overflow-hidden
          box-border
          bg-white
          flex flex-col justify-between
        "
      >
        {/* כותרת עליונה */}
        <div>
          <div className="flex justify-between items-center px-3 pt-3">
            <h2 className="text-base sm:text-lg font-semibold truncate max-w-[70%]">
              {job.job}
            </h2>
            <GoogleIcon />
          </div>

          {/* מיקום וזמן */}
          <div className="flex justify-between items-center px-3 mt-2 text-sm sm:text-base text-gray-600">
            <h3 className="truncate">
              {job.city}, {job.country}
            </h3>
            <h3 className="whitespace-nowrap">{time}</h3>
          </div>

          {/* תיאור */}
          <p className="line-clamp-3 mx-3 mt-4 mb-2 text-[#232323] text-xs sm:text-sm leading-relaxed">
            {job.description}
          </p>

          {/* תגיות */}
          <div className="grid grid-cols-3 gap-2 px-3 mb-4">
            <span className="bg-[#F9F9F9] rounded-[20px] text-center py-1 text-[10px] sm:text-xs truncate">
              Project Strategy
            </span>
            <span className="bg-[#F9F9F9] rounded-[20px] text-center py-1 text-[10px] sm:text-xs truncate">
              Cloud
            </span>
            <span className="bg-[#F9F9F9] rounded-[20px] text-center py-1 text-[10px] sm:text-xs truncate">
              AWS
            </span>
          </div>
          <div className="border-b-[1px] border-[#000000]/10 mb-5"></div>
        </div>

        {/* כפתורים בתחתית */}
        <div className="grid grid-cols-2 gap-3 px-3 pb-4 mt-auto">
          <button 
          onClick={() => {
                    setShowModal(false);
                    router.push(`/RecruiterDashboard/Edit/${job._id}`);
                  }}
          className="font-outfit rounded-[14px] border border-[#000000] py-2 sm:py-3 px-2 sm:px-4 text-sm sm:text-base hover:bg-gray-100 transition-colors">
            Edit Position
          </button>
          <button
            onClick={handleDelete}
           className="font-outfit rounded-[14px] text-white bg-[#ff1111] py-2 sm:py-3 px-2 sm:px-4 text-sm sm:text-base hover:bg-[#0d8ed6] transition-colors">
            Delete Job
          </button>
        </div>
      </motion.div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-[#000000]/70 bg-opacity-40 z-[10000]">
          <div className="bg-white max-h-full p-4 rounded-lg shadow-lg w-[1000px] max-w-full">
            {/* כותרת + כפתורים */}
            <div className="flex justify-between items-center w-full mb-5">
              <label className="lg:text-2xl text-[16px] font-outfit font-bold">
                {job.job}
              </label>

              <div className="flex gap-3">
                <button
                  className="flex px-2 md:px-4 py-2 bg-[#2563EB] text-white rounded-[8px] hover:bg-green-600"
                  onClick={() => {
                    setShowModal(false);
                    router.push(`/RecruiterDashboard/Edit/${job._id}`);
                  }}
                >
                  <EditIcon />
                  {!isMobile&&'Edit Position'}
                </button>
                <button
                  className="flex px-2 md:px-4 py-2 bg-[#16A34A] text-white rounded-[8px] hover:bg-blue-600"
                  onClick={handleUpdate}
                >
                  <UpdateIcon />
                  {!isMobile&&'Update Statuses'}
                </button>
                <button
                  className="px-2 md:px-4 py-2 bg-red-500 rounded-[8px] hover:bg-red-600"
                  onClick={handleDelete}
                >
                  <DeleteIcon
                    color="#FFFFFF"
                    className="bg-red-500 border-[1px] border-red-500"
                  />
                </button>
                <button
                  className="px-4 py-2 text-white"
                  onClick={() => setShowModal(false)}
                >
                  <CloseIcon color="#6B7280" className="hover:bg-gray-500" />
                </button>
              </div>
            </div>
            <div className="w-full bg-[#E5E7EB]/20 px-8 py-8">
              <div className="flex justify-center">
                <div className="grid grid-cols-2 md:gap-x-20 lg:grid-cols-4 gap-4">
                {
                  tag_json.map((x,idx)=>(<TagComp key={idx} headline={x.headline} number={x.number} />))
                }
                </div>
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
        </div>
      )}
    </>
  );
};

export default JobrecruiterCard;