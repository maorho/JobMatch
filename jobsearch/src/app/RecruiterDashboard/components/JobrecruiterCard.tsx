"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/app/lib/hooks/useCurrentUser";
import JobrecruiterCandidateList from "./JobrecruiterCandidateList";

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
        className="shadow-xl px-2 h-20 w-200 font-semibold text-white border rounded-xl m-auto mt-2 bg-blue-300 cursor-pointer hover:scale-105 transition-transform"
      >
        <h2 className="ml-2">{job.job}</h2>
        <h3 className="ml-2.5">{job.company.companyName}</h3>
        <div className="flex ml-2.5 justify-between pr-2">
          <h3>{job.type}</h3>
          <h3>{job.location}</h3>
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
