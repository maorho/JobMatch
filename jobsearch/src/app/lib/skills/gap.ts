import { connectToDatabase } from "@/app/lib/db";
import User from "@/app/models/User";
import ExternalJobs, { OPEN_JOBS } from "@/app/models/ExternalJobs";
import { extractTech } from "@/app/lib/jobs/enrich";
import { inferCandidateLevel, levelFit, type CandidateLevel } from "@/app/lib/matcher/level";
import { normalizeSearchProfile } from "@/app/lib/matcher/searchProfile";
import { roleTitleMatches, inferRole, type PracticeRole, type PracticeLevel } from "@/app/lib/practice/roles";
import { structuredToText, isStructuredResume } from "@/app/lib/resume/structuredToText";

type JobRow = { job: string; seniority?: string[]; experienceMin?: number|null ; city?: string; tech?: string[] };
export type SkillGap = {
  slice: { roles: PracticeRole[]; level: PracticeLevel; cities: string[]; jobs: number };
  skills: { name: string; count: number; demandPct: number; have: boolean }[]; // ממוין לפי demandPct
  /** The slice was too small (< MIN_SLICE) and was widened: first without the cities, then without the level. */
  widened: "cities" | "level" | null;
  computedAt: Date;
};
const MIN_SLICE = 15;

export async function computeSkillGap(userId: string): Promise<SkillGap | null> {
    await connectToDatabase();
    const user = await User.findById(userId).select("+resumeText searchProfile +resumeStructured level").lean();
    if(!user) {
        return null;
    }
    const resumeText = (user.resumeText || "").trim() || (isStructuredResume(user.resumeStructured) ? structuredToText(user.resumeStructured) : "");
    if (!resumeText) return null;
    const jobs = await ExternalJobs.find({...OPEN_JOBS,tech:{$exists: true, $ne:[]}}).select("job seniority experienceMin city tech").lean() as unknown as JobRow[];
    const wanted = wantedSlice(user.searchProfile, user.level, resumeText);
    const mine = new Set(extractTech("",resumeText,60));
    let slice = filterSlice(jobs, wanted);
    let widened: "cities" | "level" | null=null;
    if(slice.length < MIN_SLICE && wanted.cities.length) {
        slice = filterSlice(jobs, { ...wanted, cities: [] });
        widened = "cities";
    }
    if(slice.length < MIN_SLICE) {
        slice = filterSlice(jobs,{...wanted,cities:[]},{ignoreLevel:true});
        widened = "level";
    }
    const counts = new Map<string,number>();
    for(const job of slice) {
        for(const t of job.tech || []) {
            counts.set(t,(counts.get(t)||0)+1);
        }
    }
    const skills = [...counts.entries()].map(([name,count]) => ({ name, count, demandPct: Math.round(count*100/slice.length), have: mine.has(name) })).filter(s=> s.count >= 5 || s.demandPct >= 10).sort((a,b) => b.demandPct - a.demandPct);
    return {slice: { ...wanted, jobs: slice.length }, skills,widened, computedAt: new Date()};
}

const wantedSlice = (profile:unknown, level: CandidateLevel|undefined,resumeText: string): { roles: PracticeRole[]; level: PracticeLevel; cities: string[]} => {
    const normalized = normalizeSearchProfile(profile);
    const roles = normalized.roles.length ? normalized.roles : [inferRole(resumeText)];
    const chosenLevel = normalized.level ?? level ?? inferCandidateLevel(resumeText);
    const cities = normalized.cities;
    return { roles, level: chosenLevel, cities };
}
const filterSlice = (jobs: JobRow[], wanted: { roles: PracticeRole[]; level: PracticeLevel; cities: string[] }, options: { ignoreLevel?: boolean}={}) =>{
    const filtered = jobs.filter(job => {
        const jc = (job.city || "").toLocaleLowerCase();
        return roleTitleMatches(job.job, wanted.roles) &&
               (options.ignoreLevel || levelFit(wanted.level,job.job, job.seniority, job.experienceMin) >= 0.55) &&
               (wanted.cities.length === 0 || wanted.cities.some(city => jc && (city.toLowerCase().includes(jc) || jc.includes(city.toLowerCase()))
        ));
    });
    return filtered;
}

