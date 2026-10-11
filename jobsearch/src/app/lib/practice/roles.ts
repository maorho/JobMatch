/**
 * The practice platform's vocabulary: roles, levels and how much time each
 * task kind gets per role × level. Timed coding questions are minutes on a
 * countdown; home assignments are hours in a soft window (late = flagged,
 * still reviewed).
 */
export const PRACTICE_ROLES = ["frontend", "backend", "fullstack", "data", "devops", "qa", "mobile"] as const;
export type PracticeRole = (typeof PRACTICE_ROLES)[number];
export const PRACTICE_LEVELS = ["junior", "mid", "senior"] as const;
export type PracticeLevel = (typeof PRACTICE_LEVELS)[number];
export const TASK_KINDS = ["coding", "assignment"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const ROLE_INFO: Record<PracticeRole, { he: string; en: string; stack: string; language: string }> = {
  frontend: { he: "Frontend", en: "Frontend Developer", stack: "React, TypeScript, CSS, browser APIs", language: "typescript" },
  backend: { he: "Backend", en: "Backend Developer", stack: "Node.js / Python / Go, REST, SQL, caching, queues", language: "typescript" },
  fullstack: { he: "Full Stack", en: "Full Stack Developer", stack: "React + Node.js, REST, SQL/NoSQL, auth", language: "typescript" },
  data: { he: "Data / ML", en: "Data Scientist / Analyst", stack: "Python, pandas, SQL, statistics, scikit-learn", language: "python" },
  devops: { he: "DevOps", en: "DevOps / Platform Engineer", stack: "Linux, Docker, Kubernetes, CI/CD, Terraform, bash", language: "bash" },
  qa: { he: "QA / Automation", en: "QA Automation Engineer", stack: "test design, Playwright/Selenium, API testing, Python/JS", language: "typescript" },
  mobile: { he: "Mobile", en: "Mobile Developer", stack: "React Native / Kotlin / Swift, state, networking", language: "typescript" },
};

export const LEVEL_HE: Record<PracticeLevel, string> = { junior: "ג'וניור", mid: "Mid", senior: "סניור" };

const CODING_BASE: Record<PracticeLevel, number> = { junior: 30, mid: 45, senior: 60 };
const ASSIGNMENT_BASE: Record<PracticeLevel, number> = { junior: 4, mid: 6, senior: 8 };
const ROLE_FACTOR: Record<PracticeRole, number> = { frontend: 1, backend: 1, fullstack: 1.1, data: 1.2, devops: 1.2, qa: 0.9, mobile: 1 };

/** Minutes on the clock for a timed coding question. */
export function codingMinutes(role: PracticeRole, level: PracticeLevel): number {
  return Math.round((CODING_BASE[level] * ROLE_FACTOR[role]) / 5) * 5;
}
/** Hours in the window of a home assignment. */
export function assignmentHours(role: PracticeRole, level: PracticeLevel): number {
  return Math.round(ASSIGNMENT_BASE[level] * ROLE_FACTOR[role]);
}

export const isRole = (v: unknown): v is PracticeRole => PRACTICE_ROLES.includes(v as PracticeRole);
export const isLevel = (v: unknown): v is PracticeLevel => PRACTICE_LEVELS.includes(v as PracticeLevel);
export const isKind = (v: unknown): v is TaskKind => TASK_KINDS.includes(v as TaskKind);

const ROLE_RE: Record<PracticeRole, RegExp> = {
  frontend: /\b(front[- ]?end|react|vue|angular|css|html|next\.?js|ui developer)\b/gi,
  backend: /\b(back[- ]?end|node\.?js|express|nest\.?js|django|flask|fastapi|spring|\.net|golang|\bgo\b|microservices|rest api|graphql|postgres|mongodb)\b/gi,
  fullstack: /\b(full[- ]?stack|mern|mean)\b/gi,
  data: /\b(data scien|data analy|machine learning|\bml\b|pandas|numpy|scikit|pytorch|tensorflow|sql analyst|bi developer|statistics)\b/gi,
  devops: /\b(devops|sre|site reliability|kubernetes|k8s|docker|terraform|ci\/cd|jenkins|ansible|cloud engineer|platform engineer)\b/gi,
  qa: /\b(qa|quality assurance|automation engineer|test engineer|selenium|playwright|cypress|manual test)\b/gi,
  mobile: /\b(mobile|android|ios|kotlin|swift|react native|flutter)\b/gi,
};

/** Best-guess role from a résumé / current title (frontend when nothing matches — the most common junior profile here). */
export function inferRole(text: string): PracticeRole {
  const t = text || "";
  let best: PracticeRole = "frontend";
  let bestHits = 0;
  for (const role of PRACTICE_ROLES) {
    const hits = (t.match(ROLE_RE[role]) || []).length * (role === "fullstack" ? 2 : 1);
    if (hits > bestHits) {
      best = role;
      bestHits = hits;
    }
  }
  return best;
}
