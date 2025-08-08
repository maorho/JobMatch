"use client";

import React from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { isInternalJob, Job } from "./JobTable";

interface JobCardProps {
  job: Job;
  jobIndex: number;
}

const JobCard: React.FC<JobCardProps> = ({ job, jobIndex }) => {
  const jobID = job._id;
  const router = useRouter();
  const handleClick = () => {
    router.push(
      `/job/${isInternalJob(job) ? "internal" : "external"}/${jobID}`
    );
  };

  return (
    <motion.div
      onClick={handleClick}
      initial={{ opacity: 0, x: -40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: jobIndex * 0.05, duration: 0.5 }} //
      className="shadow-xl px-2 h-20 w-200 font-semibold text-white border rounded-xl m-auto mt-2 bg-blue-300 cursor-pointer hover:scale-105 transition-transform"
    >
      <h2 className="ml-2">{job.job}</h2>
      <h3 className="ml-2.5">
        {typeof job.company === "object"
          ? job.company.companyName
          : job.company}
      </h3>
      <div className="flex ml-2.5 justify-between pr-2">
        {isInternalJob(job) && <h3>{job.type}</h3>}
        <h3>
          {isInternalJob(job)
            ? job.city + "," + job.country
            : job.city + "," + job.country}
        </h3>
      </div>
    </motion.div>
  );
};

export default JobCard;
