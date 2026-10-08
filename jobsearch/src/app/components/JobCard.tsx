"use client";
import React from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { MapPin, Clock } from "lucide-react";
import { isInternalJob, getJobType, getSeniorityLevel, type Job } from "./JobTable";
import CompanyLogo from "./CompanyLogo";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime.js";

dayjs.extend(relativeTime);

interface JobCardProps {
  job: Job;
  jobIndex: number;
}

const JobCard: React.FC<JobCardProps> = ({ job, jobIndex }) => {
  const router = useRouter();
  const href = isInternalJob(job) ? `/job/internal/${job._id}` : `/job/external/${job._id}`;
  const open = () => router.push(href);

  const companyName = isInternalJob(job) ? job.company.companyName : job.company;
  const location =
    [job.city, job.country].filter((v) => v && v !== "Unknown").join(", ") ||
    ((job as any).remote ? "Remote" : "");
  const workMode = getJobType(job);
  const level = getSeniorityLevel(job);
  const skills = (!isInternalJob(job) && Array.isArray(job.skills) ? job.skills : []).filter(Boolean).slice(0, 3);
  const time = job.createdAt ? dayjs(job.createdAt).fromNow() : "";

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(jobIndex % 12, 8) * 0.04, duration: 0.3 }}
      onClick={open}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open())}
      role="link"
      tabIndex={0}
      aria-label={`${job.job} at ${companyName}`}
      className="jm-card jm-card-hover p-5 flex flex-col gap-4 h-full cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <CompanyLogo
          name={companyName}
          domain={job.companyDomain}
          logoUrl={job.logoUrl}
          className="h-11 w-11 shrink-0 rounded-xl border border-line p-1"
        />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-navy leading-snug line-clamp-2" title={job.job}>
            {job.job}
          </h3>
          <p className="text-sm text-ink-600 truncate">{companyName}</p>
        </div>
        {typeof job.matchScore === "number" && (
          <span className="jm-chip jm-chip-teal shrink-0" title="Match to your résumé">
            {job.matchScore}%
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {location && (
          <span className="jm-chip">
            <MapPin className="h-3 w-3" />
            {location}
            {(job as any).remote && job.city ? " · Remote" : ""}
          </span>
        )}
        {workMode && <span className="jm-chip">{workMode}</span>}
        {level && <span className={`jm-chip ${level === "Junior" || level === "Intern" ? "jm-chip-sky" : ""}`}>{level}</span>}
      </div>

      {job.description && (
        <p className="text-sm text-ink-600 leading-relaxed line-clamp-3" dir="auto">
          {job.description}
        </p>
      )}

      {skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {skills.map((s) => (
            <span key={s} className="text-xs text-ink-400 bg-canvas rounded-md px-2 py-0.5 truncate max-w-[140px]">
              {s}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto pt-4 border-t border-line flex items-center justify-between gap-3">
        <span className="jm-muted inline-flex items-center gap-1">
          {time && (
            <>
              <Clock className="h-3.5 w-3.5" />
              {time}
            </>
          )}
        </span>
        <span className="jm-btn jm-btn-accent jm-btn-sm">View job</span>
      </div>
    </motion.article>
  );
};

export default JobCard;
