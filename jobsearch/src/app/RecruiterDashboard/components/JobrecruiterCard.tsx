"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/app/lib/hooks/useCurrentUser";
import JobrecruiterCandidateList from "./JobrecruiterCandidateList";
import { GoogleIcon } from "@/app/components/JobCard";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime.js";

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
  const [updateStatuses, setUpdatedStatuses] = useState<Map<string, string>>(
    new Map()
  );

  const { user } = useCurrentUser();
  const router = useRouter();
  dayjs.extend(relativeTime);
  const time = dayjs(job.createdAt).fromNow();
  if (!user) return null;
  const isPublisher = user.id.toString() === job.publisher.toString();
  const handleUpdate = async () => {
    try {
      console.log("Sending updates:", Object.fromEntries(updateStatuses));
      const res = await fetch("/api/jobsDashboard/Recruiter/changeStatus", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobId: job._id,
          updateStatuses: Object.fromEntries(updateStatuses),
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update candidate statuses");
      }

      const result = await res.json();
      console.log("Update success:", result);
      const newMap = new Map();
      setUpdatedStatuses(newMap);
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

    const res = await fetch(`/api/jobsDashboard/Recruiter/deleteJob`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: job._id }),
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
          <button className="font-outfit rounded-[14px] border border-[#000000] py-2 sm:py-3 px-2 sm:px-4 text-sm sm:text-base hover:bg-gray-100 transition-colors">
            Learn More
          </button>
          <button className="font-outfit rounded-[14px] text-white bg-[#11AEFF] py-2 sm:py-3 px-2 sm:px-4 text-sm sm:text-base hover:bg-[#0d8ed6] transition-colors">
            Apply
          </button>
        </div>
      </motion.div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white p-4 rounded-lg shadow-lg w-[1000px] max-w-full">
            <h2 className="text-lg font-semibold mb-2 text-center">
              Manage Job
            </h2>
            <p className="mb-4 text-center">{job.job}</p>
            <div className="flex justify-between">
              <button
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                onClick={() => {
                  setShowModal(false);
                  router.push(`/RecruiterDashboard/Edit/${job._id}`);
                }}
              >
                Edit
              </button>
              <button
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-green-600"
                onClick={() => {
                  handleUpdate();
                }}
              >
                Update Candidates Statuses
              </button>
              <button
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                onClick={handleDelete}
              >
                Delete
              </button>
              <button
                className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>
            </div>
            <JobrecruiterCandidateList
              jobId={job._id}
              company={job.company.companyName}
              updateStatuses={updateStatuses}
              setUpdatedStatuses={setUpdatedStatuses}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default JobrecruiterCard;
