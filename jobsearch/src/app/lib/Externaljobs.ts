import type { ExternalJob } from "@/app/components/JobTable";

let externalJobsCache: ExternalJob[] = [];

export function setExternalJobs(jobs: ExternalJob[]) {
  externalJobsCache = jobs;
}

export function getExternalJobs(): ExternalJob[] {
  return externalJobsCache;
}

export function getExternalJobById(id: string): ExternalJob | undefined {
  // many external jobs are now coming from Mongo, include _id on type or cast
  return externalJobsCache.find((job: any) => String(job._id) === String(id));
}
