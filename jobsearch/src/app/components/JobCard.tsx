"use client";
import React from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { isInternalJob, type Job } from "./JobTable";

interface JobCardProps {
  job: Job;
  jobIndex: number;
}

const JobCard: React.FC<JobCardProps> = ({ job, jobIndex }) => {
  const router = useRouter();

  const handleClick = () => {
    if (isInternalJob(job)) {
      router.push(`/job/internal/${job._id}`); // keep your existing internal logic
    } else {
      // IMPORTANT: external jobs must navigate with Mongo _id so refresh works
      // Ensure ExternalJob type includes _id from DB
      const extId = (job as any)._id;
      router.push(`/job/external/${extId}`);
    }
  };

  return (
    <motion.div
      onClick={handleClick}
      initial={{ opacity: 0, x: -40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: jobIndex * 0.05, duration: 0.5 }}
      className="shadow-xl px-2 h-20 w-200 font-semibold text-white border rounded-xl m-auto mt-2 bg-blue-300 cursor-pointer hover:scale-105 transition-transform"
    >
      <h2 className="ml-2">{job.job}</h2>
      <h3 className="ml-2.5">
        {isInternalJob(job) ? job.company.companyName : (job as any).company}
      </h3>
      <div className="flex ml-2.5 justify-between pr-2">
        <h3>
          {(isInternalJob(job) ? (job as any).type : "external") as string}
        </h3>
        <h3>
          {job.city},{job.country}
        </h3>
      </div>
    </motion.div>
  );
};

export default JobCard;
