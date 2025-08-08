import { ExternalJob } from "../components/JobTable";


let externalJobsCache: ExternalJob[] = [];

export function setExternalJobs(jobs: ExternalJob[]) {
  externalJobsCache = jobs;
}

export function getExternalJobs(): ExternalJob[] {
  return externalJobsCache;
}

/**
 * מחזיר משרה חיצונית לפי מזהה (url או מזהה אחר)
 * @param id - מזהה ייחודי של המשרה (url)
 * @returns ExternalJob או undefined אם לא נמצאה
 */
export function getExternalJobById(id: string): ExternalJob | undefined {
  console.log(`externalJobsCache`,externalJobsCache);
  return externalJobsCache.find((job) => job._id === id);
}