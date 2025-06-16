import { OutsideJob } from "../components/JobTable";


let externalJobsCache: OutsideJob[] = [];

export function setExternalJobs(jobs: OutsideJob[]) {
  externalJobsCache = jobs;
}

export function getExternalJobs(): OutsideJob[] {
  return externalJobsCache;
}

/**
 * מחזיר משרה חיצונית לפי מזהה (url או מזהה אחר)
 * @param id - מזהה ייחודי של המשרה (url)
 * @returns OutsideJob או undefined אם לא נמצאה
 */
export function getExternalJobById(id: string): OutsideJob | undefined {
  return externalJobsCache.find((job) => job.id === id);
}