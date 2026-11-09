"use client";
import React, { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { MapPin, Clock, Bookmark, X } from "lucide-react";
import { useJobSignals } from "../lib/hooks/useJobSignals";
import { isInternalJob, getJobType, getSeniorityLevel, type Job } from "./JobTable";
import CompanyLogo from "./CompanyLogo";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime.js";
import { useT } from "../lib/i18n/LanguageProvider";
import "dayjs/locale/he.js";

dayjs.extend(relativeTime);

interface JobCardProps {
  job: Job;
  jobIndex: number;
}

/**
 * One posting in the grid. Fixed structure so every card in a row lines up:
 * header (logo, two-line title, company, actions) → one meta line → two lines
 * of "why it fits" or description → footer with the score and the button.
 */
const JobCard: React.FC<JobCardProps> = ({ job, jobIndex }) => {
  const router = useRouter();
  const href = isInternalJob(job) ? `/job/internal/${job._id}` : `/job/external/${job._id}`;
  const open = () => router.push(href);
  const signals = useJobSignals();
  const { t, lang } = useT();
  const id = String(job._id || job.id || "");
  const isSaved = signals.saved.has(id);
  const [hidden, setHidden] = useState(false);
  const act = async (e: React.MouseEvent, kind: "saved" | "dismissed") => {
    e.stopPropagation();
    e.preventDefault();
    if (!signals.signedIn) return router.push(`/Login?next=${encodeURIComponent(href)}`);
    const on = await signals.toggle(id, kind, isInternalJob(job) ? "Job" : "ExternalJobs", typeof job.matchScore === "number" ? job.matchScore : null);
    if (kind === "dismissed" && on) setHidden(true); // "not relevant" leaves the feed right away
  };
  if (hidden) return null;

  const companyName = isInternalJob(job) ? job.company.companyName : job.company;
  const location = [job.city, job.country].filter((v) => v && v !== "Unknown").join(", ") || ((job as any).remote ? "Remote" : "");
  const workMode = getJobType(job);
  const level = getSeniorityLevel(job);
  // When it was posted: the employer's date, else when we first saw it, else when it was added here.
  const postedRaw = job.postedAt || job.firstSeenAt || job.createdAt;
  const posted = postedRaw && dayjs(postedRaw).isValid() && !dayjs(postedRaw).isAfter(dayjs().add(1, "day")) ? dayjs(postedRaw) : null;
  const time = posted ? t("card.posted", { ago: posted.locale(lang).fromNow() }) : "";
  const timeTitle = posted ? `${job.postedAt ? t("card.postedAt") : t("card.firstSeen")} ${posted.format("D MMM YYYY, HH:mm")}` : "";
  const why = (job as any).why as string | undefined;
  const meta = [location + ((job as any).remote && job.city ? " · Remote" : ""), workMode].filter(Boolean).join(" · ");
  // Years of experience required, read from the description — more honest than the title.
  const years = job.experienceMin != null ? (job.experienceMax != null && job.experienceMax !== job.experienceMin ? t("card.yearsRange", { a: job.experienceMin, b: job.experienceMax }) : t("card.years", { n: job.experienceMin })) : "";
  const techChips = (job.tech || []).slice(0, 3);
  const reposted = (job.repostCount || 0) > 0;

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
      className="jm-card jm-card-hover jm-reveal p-5 flex flex-col h-full min-w-0 cursor-pointer"
    >
      {/* Actions sit on their own row above the title, so the title keeps the full card width on one line */}
      <div className="flex items-center justify-end gap-0.5 -me-1.5 -mt-2 mb-1">
          <button type="button" onClick={(e) => act(e, "saved")} aria-pressed={isSaved} aria-label={isSaved ? t("card.saved") : t("card.save")} title={isSaved ? t("card.saved") : t("card.save")} className={`h-7 w-7 rounded-full inline-flex items-center justify-center transition-colors ${isSaved ? "bg-teal text-white" : "text-ink-400 hover:bg-canvas hover:text-navy"}`}>
            <Bookmark className="h-3.5 w-3.5" fill={isSaved ? "currentColor" : "none"} />
          </button>
          <button type="button" onClick={(e) => act(e, "dismissed")} aria-label={t("card.notRelevant")} title={t("card.notRelevant")} className="h-7 w-7 rounded-full inline-flex items-center justify-center text-ink-400 hover:bg-red-50 hover:text-red-600 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
      </div>
      <div className="flex items-start gap-3">
        <CompanyLogo name={companyName} domain={job.companyDomain} logoUrl={job.logoUrl} className="h-10 w-10 shrink-0 rounded-xl border border-line p-1" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-navy text-[17px] leading-snug [overflow-wrap:anywhere]">
            {job.job}
          </h3>
          <p className="text-sm text-ink-600 truncate">{companyName}</p>
        </div>
      </div>

      {/* One meta line: where · how · level · when */}
      <div className="mt-3 flex items-center gap-2 text-xs text-ink-600 min-w-0">
        {meta && (
          <span className="inline-flex items-center gap-1 truncate">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-400" />
            <span className="truncate">{meta}</span>
          </span>
        )}
        {level && <span className={`jm-chip shrink-0 ${level === "Junior" || level === "Intern" ? "jm-chip-sky" : ""}`}>{t(`level.${level}` as any)}</span>}
        {years && <span className="jm-chip shrink-0" title={t("card.yearsTitle")}>{years}</span>}
        {time && (
          <time dateTime={posted!.toISOString()} title={timeTitle} className="ms-auto inline-flex items-center gap-1 shrink-0 text-xs text-ink-400">
            <Clock className="h-3 w-3" />
            {time}
          </time>
        )}
      </div>

      {(techChips.length > 0 || reposted) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          {techChips.map((t) => (
            <span key={t} className="rounded-full border border-line bg-canvas px-2 py-0.5 text-ink-600" dir="ltr">{t}</span>
          ))}
          {reposted && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700" title={t("card.repostedTitle")}>{t("card.reposted")}</span>}
        </div>
      )}

      {/* Two lines: why it fits (reranked) or the posting's own words */}
      {why ? (
        <p className="mt-3 text-sm text-teal-600 leading-relaxed line-clamp-2 min-h-[2.75rem] [overflow-wrap:anywhere]" dir="auto" title={why}>
          ✓ {why}
        </p>
      ) : job.description ? (
        <p className="mt-3 text-sm text-ink-600 leading-relaxed line-clamp-2 min-h-[2.75rem] [overflow-wrap:anywhere]" dir="auto">
          {job.description}
        </p>
      ) : (
        <div className="min-h-[2.75rem] mt-3" />
      )}

      {/* Footer: the score on one side, the action on the other; always at the bottom */}
      <div className="mt-auto pt-4 flex items-center justify-between gap-3">
        {typeof job.matchScore === "number" ? (
          <span className="inline-flex items-baseline gap-1.5 rounded-full bg-teal-50 px-3 py-1.5" title={job.likelihood ? t("card.matchFull", { score: job.matchScore, pct: job.likelihood.pct }) : t("card.matchTitle")}>
            <span className="text-base font-semibold text-teal-600 leading-none">{job.matchScore}%</span>
            <span className="text-xs text-teal-600/80">{job.likelihood ? t("card.interview", { pct: job.likelihood.pct }) : t("card.match")}</span>
          </span>
        ) : (
          <span />
        )}
        <span className="jm-btn jm-btn-accent jm-btn-sm">{t("card.viewJob")}</span>
      </div>
    </motion.article>
  );
};

export default JobCard;
