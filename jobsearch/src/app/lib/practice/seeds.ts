import type { PracticeRole, TaskKind } from "./roles";

/**
 * Built-in tasks used when no LLM is available (tests, offline, no key) and
 * as the floor of every catalogue. Level-neutral statements; the clock and
 * the rubric weights scale with the level at insert time.
 */
export type SeedTask = {
  kind: TaskKind;
  slug: string;
  title: string;
  prompt: string;
  language?: string;
  starterCode?: string;
  examples?: { input: string; output: string; explanation?: string }[];
  constraints?: string[];
  deliverables?: string[];
  rubric: { criterion: string; weight: number; description?: string }[];
  hints?: string[];
  tags: string[];
  difficulty: number;
};

const CODE_RUBRIC = [
  { criterion: "נכונות", weight: 4, description: "הפתרון מחזיר תוצאה נכונה על הדוגמאות ועל מקרי קצה" },
  { criterion: "סיבוכיות", weight: 2, description: "זמן וזיכרון סבירים לגודל הקלט שבאילוצים" },
  { criterion: "קריאות", weight: 2, description: "שמות ברורים, פונקציות קטנות, בלי קוד מת" },
  { criterion: "מקרי קצה", weight: 2, description: "קלט ריק, כפילויות, ערכים שליליים, גבולות" },
];
const HOME_RUBRIC = [
  { criterion: "עמידה בדרישות", weight: 3, description: "כל ה-deliverables קיימים ועובדים" },
  { criterion: "ארכיטקטורה", weight: 2, description: "הפרדת אחריות, מבנה פרויקט הגיוני" },
  { criterion: "איכות קוד", weight: 2, description: "קריאות, שמות, טיפול בשגיאות" },
  { criterion: "בדיקות", weight: 2, description: "בדיקות משמעותיות למסלולים העיקריים" },
  { criterion: "README ותקשורת", weight: 1, description: "איך להריץ, מה הוחלט ולמה, מה היה נעשה עם עוד זמן" },
];

const common = {
  twoSum: {
    kind: "coding" as const,
    slug: "two-sum-indices",
    title: "זוג מספרים שסכומם יעד",
    prompt: "נתון מערך של מספרים שלמים nums ומספר target. החזירו את האינדקסים של שני איברים שסכומם שווה ל-target.\n\nמובטח שיש בדיוק פתרון אחד, ואסור להשתמש באותו איבר פעמיים. סדר האינדקסים לא משנה.",
    language: "typescript",
    starterCode: "export function twoSum(nums: number[], target: number): [number, number] {\n  // your code\n  return [0, 0];\n}\n",
    examples: [
      { input: "nums = [2, 7, 11, 15], target = 9", output: "[0, 1]", explanation: "2 + 7 = 9" },
      { input: "nums = [3, 2, 4], target = 6", output: "[1, 2]" },
    ],
    constraints: ["2 ≤ nums.length ≤ 10^5", "-10^9 ≤ nums[i], target ≤ 10^9"],
    rubric: CODE_RUBRIC,
    hints: ["מה אפשר לשמור בזמן מעבר אחד על המערך כדי לא לחפש שוב?"],
    tags: ["arrays", "hash map"],
    difficulty: 1,
  },
  lru: {
    kind: "coding" as const,
    slug: "lru-cache",
    title: "LRU Cache",
    prompt: "ממשו מבנה נתונים LRUCache(capacity) עם שתי פעולות:\n\nget(key) — מחזיר את הערך אם קיים, אחרת -1.\nput(key, value) — מכניס או מעדכן; כשהקיבולת מלאה, מסירים את האיבר שלא נעשה בו שימוש הכי הרבה זמן.\n\nשתי הפעולות צריכות לרוץ ב-O(1) ממוצע.",
    language: "typescript",
    starterCode: "export class LRUCache {\n  constructor(private capacity: number) {}\n  get(key: number): number {\n    return -1;\n  }\n  put(key: number, value: number): void {}\n}\n",
    examples: [{ input: "capacity = 2; put(1,1); put(2,2); get(1); put(3,3); get(2)", output: "get(1) → 1, get(2) → -1", explanation: "put(3,3) הוציא את 2, שהיה הכי פחות בשימוש" }],
    constraints: ["1 ≤ capacity ≤ 3000", "עד 10^5 פעולות"],
    rubric: CODE_RUBRIC,
    hints: ["Map ב-JavaScript שומר סדר הכנסה. מה קורה אם מוחקים ומכניסים מחדש?"],
    tags: ["design", "hash map", "linked list"],
    difficulty: 3,
  },
};

export const SEEDS: Record<PracticeRole, SeedTask[]> = {
  frontend: [
    common.twoSum,
    {
      kind: "coding",
      slug: "debounce",
      title: "debounce עם ביטול",
      prompt: "כתבו פונקציה debounce(fn, waitMs) שמחזירה פונקציה עטופה: קריאות חוזרות בתוך waitMs דוחות את ההפעלה, ו-fn רצה פעם אחת עם הארגומנטים של הקריאה האחרונה.\n\nלפונקציה המוחזרת צריכה להיות גם מתודה cancel() שמבטלת הפעלה ממתינה.\n\nהסבירו בהערה קצרה מתי תשתמשו ב-debounce לעומת throttle.",
      language: "typescript",
      starterCode: "export function debounce<T extends (...args: any[]) => void>(fn: T, waitMs: number): T & { cancel(): void } {\n  // your code\n  return fn as any;\n}\n",
      examples: [{ input: "d = debounce(log, 100); d('a'); d('b'); (wait 150ms)", output: "log('b') פעם אחת" }],
      constraints: ["בלי ספריות חיצוניות", "this והארגומנטים נשמרים"],
      rubric: CODE_RUBRIC,
      tags: ["closures", "timers", "browser"],
      difficulty: 2,
    },
    {
      kind: "assignment",
      slug: "job-board-ui",
      title: "לוח משרות עם סינון וחיפוש",
      prompt: "בנו אפליקציית React קטנה שמציגה רשימת משרות מקובץ JSON (כ-50 משרות: כותרת, חברה, עיר, תגיות, תאריך).\n\nדרישות: חיפוש טקסט חופשי, סינון לפי עיר ותגיות (ריבוי בחירה), מיון לפי תאריך, מצב טעינה/ריק, ו-URL שמשקף את הסינון (אפשר לשתף קישור).\n\nהתייחסו לנגישות (מקלדת, aria) ולמובייל.",
      deliverables: ["ריפו עם README: איך מריצים", "קומפוננטות מופרדות (רשימה, פילטרים, כרטיס)", "state ב-URL (query params)", "לפחות 3 בדיקות (Testing Library/Vitest)", "פסקה: מה הייתם משפרים עם עוד יום"],
      rubric: HOME_RUBRIC,
      tags: ["react", "state", "a11y"],
      difficulty: 2,
    },
  ],
  backend: [
    common.lru,
    {
      kind: "coding",
      slug: "rate-limiter",
      title: "Rate limiter בחלון הזזה",
      prompt: "ממשו RateLimiter(limit, windowMs) עם מתודה allow(clientId, nowMs): boolean — מחזירה true אם ללקוח נשארו קריאות בחלון של windowMs האחרונות, אחרת false.\n\nהניחו שהזמן מגיע כפרמטר (nowMs) כדי שאפשר יהיה לבדוק דטרמיניסטית. חשבו על זיכרון: לקוחות שלא נראו זמן רב לא צריכים להישאר בזיכרון לנצח.",
      language: "typescript",
      starterCode: "export class RateLimiter {\n  constructor(private limit: number, private windowMs: number) {}\n  allow(clientId: string, nowMs: number): boolean {\n    return true;\n  }\n}\n",
      examples: [{ input: "limit=2, window=1000; allow('a',0) allow('a',10) allow('a',20) allow('a',1011)", output: "true, true, false, true" }],
      constraints: ["עד 10^6 קריאות", "אלפי לקוחות במקביל"],
      rubric: CODE_RUBRIC,
      tags: ["design", "queues", "time"],
      difficulty: 3,
    },
    {
      kind: "assignment",
      slug: "url-shortener-api",
      title: "שירות קיצור כתובות",
      prompt: "בנו REST API לקיצור כתובות: POST /links יוצר קיצור, GET /:code מפנה (302) וסופר קליקים, GET /links/:code/stats מחזיר סטטיסטיקה.\n\nדרישות: ולידציה של URL, קודים ייחודיים ולא ניתנים לניחוש, הגנה מפני ספאם (rate limit בסיסי), persistence (SQLite/Postgres/Mongo — הבחירה שלכם, נמקו), ו-Dockerfile.",
      deliverables: ["ריפו עם README והרצה ב-docker compose", "סכמת DB ונימוק לבחירה", "בדיקות אינטגרציה ל-3 ה-endpoints", "טיפול בשגיאות עקבי (קודי HTTP, גוף שגיאה)", "פסקה: איך זה מתרחב ל-10K בקשות בשנייה"],
      rubric: HOME_RUBRIC,
      tags: ["rest", "sql", "docker"],
      difficulty: 3,
    },
  ],
  fullstack: [
    common.twoSum,
    common.lru,
    {
      kind: "assignment",
      slug: "tasks-app-fullstack",
      title: "ניהול משימות — full stack",
      prompt: "בנו אפליקציה לניהול משימות: צד שרת עם API (יצירה, עדכון סטטוס, מחיקה, רשימה עם פילטר), וצד לקוח ב-React שמציג, מוסיף ומעדכן משימות אופטימית.\n\nדרישות: אימות פשוט (טוקן), ולידציה בשרת, שגיאות מוצגות למשתמש, ו-persistence אמיתי.",
      deliverables: ["ריפו מונורפו עם README", "API מתועד (OpenAPI או טבלה ב-README)", "עדכון אופטימי עם rollback בשגיאה", "בדיקות: 2 לשרת, 2 ללקוח", "פסקה: מה הייתם משנים לפרודקשן"],
      rubric: HOME_RUBRIC,
      tags: ["react", "rest", "auth"],
      difficulty: 3,
    },
  ],
  data: [
    {
      kind: "coding",
      slug: "sessionize-events",
      title: "חלוקת אירועים לסשנים",
      prompt: "נתונה רשימת אירועים (user_id, timestamp בשניות). חלקו אותם לסשנים: אירועים של אותו משתמש במרחק של עד 30 דקות זה מזה שייכים לאותו סשן.\n\nהחזירו לכל משתמש את מספר הסשנים ואת אורך הסשן הארוך ביותר (בשניות). האירועים לא ממוינים.",
      language: "python",
      starterCode: "from typing import List, Tuple, Dict\n\ndef sessionize(events: List[Tuple[str, int]]) -> Dict[str, Tuple[int, int]]:\n    \"\"\"user_id -> (sessions, longest_session_seconds)\"\"\"\n    return {}\n",
      examples: [{ input: "[('u1', 0), ('u1', 600), ('u1', 4000), ('u2', 5)]", output: "{'u1': (2, 600), 'u2': (1, 0)}" }],
      constraints: ["עד 10^6 אירועים", "pandas מותר אבל לא חובה"],
      rubric: CODE_RUBRIC,
      tags: ["pandas", "time series", "grouping"],
      difficulty: 2,
    },
    {
      kind: "coding",
      slug: "sql-top-n-per-group",
      title: "SQL: שתי ההזמנות הגדולות לכל לקוח",
      prompt: "טבלאות: customers(id, name), orders(id, customer_id, amount, created_at).\n\nכתבו שאילתה שמחזירה לכל לקוח את שתי ההזמנות הגדולות ביותר שלו (שם לקוח, סכום, תאריך), ממוינות לפי שם לקוח ואז סכום יורד. לקוחות בלי הזמנות לא מופיעים.\n\nהסבירו בהערה מה הסיבוכיות ואיזה אינדקס היה עוזר.",
      language: "sql",
      starterCode: "-- your query\n",
      examples: [{ input: "לקוח 'Dana' עם הזמנות 50, 120, 80", output: "Dana 120, Dana 80" }],
      constraints: ["SQL סטנדרטי (window functions מותרות)"],
      rubric: CODE_RUBRIC,
      tags: ["sql", "window functions"],
      difficulty: 2,
    },
    {
      kind: "assignment",
      slug: "churn-analysis",
      title: "ניתוח נטישה על דאטהסט ציבורי",
      prompt: "בחרו דאטהסט ציבורי של לקוחות עם תווית churn (למשל Telco Customer Churn). בצעו EDA, בנו מודל בסיסי לחיזוי נטישה, והציגו ממצאים כאילו למנהל/ת מוצר.\n\nהדגש הוא על החשיבה: מה מסביר נטישה, מה המודל שווה בפועל (לא רק accuracy), ומה הייתם ממליצים לעשות.",
      deliverables: ["Notebook מסודר שרץ מההתחלה לסוף", "EDA עם 3–5 תובנות מנומקות", "מודל + הערכה עם מדדים מתאימים (precision/recall/ROC) ו-baseline", "מצגת/README של 1 עמוד למנהל/ת מוצר", "פסקה: מגבלות ודליפות נתונים אפשריות"],
      rubric: HOME_RUBRIC,
      tags: ["pandas", "sklearn", "storytelling"],
      difficulty: 3,
    },
  ],
  devops: [
    {
      kind: "coding",
      slug: "log-parser-top-errors",
      title: "סקריפט: שגיאות נפוצות מלוג",
      prompt: "כתבו סקריפט (bash או Python) שמקבל נתיב לקובץ לוג בפורמט `2026-10-11T10:00:00Z level=ERROR service=api msg=\"...\"` ומדפיס את 5 ההודעות (msg) הנפוצות ביותר ברמת ERROR, עם מספר ההופעות ושמות ה-services שבהן הופיעו.\n\nהקובץ יכול להיות גדול (גיגהבייטים) — אל תטענו אותו כולו לזיכרון.",
      language: "bash",
      starterCode: "#!/usr/bin/env bash\nset -euo pipefail\nLOG=\"$1\"\n# your pipeline\n",
      examples: [{ input: "לוג עם 3 שורות ERROR msg=\"db timeout\" ו-1 msg=\"oom\"", output: "3 db timeout [api,worker]\n1 oom [api]" }],
      constraints: ["קלט לא ממוין", "msg יכול להכיל רווחים"],
      rubric: CODE_RUBRIC,
      tags: ["bash", "streams", "observability"],
      difficulty: 2,
    },
    {
      kind: "coding",
      slug: "k8s-rollout-check",
      title: "בדיקת בריאות ל-rollout",
      prompt: "כתבו סקריפט שמקבל שם deployment ו-namespace, מריץ `kubectl rollout status` עם timeout, ואם ה-rollout נכשל: מדפיס את 20 שורות הלוג האחרונות של ה-pods שלא ב-Ready ומבצע `kubectl rollout undo`.\n\nקוד היציאה צריך לשקף הצלחה/כישלון, והסקריפט צריך להיות idempotent.",
      language: "bash",
      starterCode: "#!/usr/bin/env bash\nset -euo pipefail\nDEPLOY=\"$1\"; NS=\"${2:-default}\"; TIMEOUT=\"${3:-120s}\"\n",
      constraints: ["אין גישה לאינטרנט בזמן ריצה", "אפשר להניח kubectl מוגדר"],
      rubric: CODE_RUBRIC,
      tags: ["kubernetes", "bash", "ci/cd"],
      difficulty: 3,
    },
    {
      kind: "assignment",
      slug: "ci-cd-for-service",
      title: "CI/CD מלא לשירות קטן",
      prompt: "קחו שירות web קטן (אפשר Hello-World עם endpoint /health) ובנו לו: Dockerfile רזה ורב-שלבי, pipeline ב-GitHub Actions (lint, test, build, push image), ופריסה ל-Kubernetes מקומי (kind/minikube) עם Helm chart או manifests, כולל readiness/liveness ו-HPA.\n\nהוסיפו Terraform (או Pulumi) שמגדיר לפחות משאב אחד (אפילו local/docker provider) כדי להראות IaC.",
      deliverables: ["ריפו עם README: מהקלונה לפריסה ב-5 פקודות", "Dockerfile רב-שלבי < 100MB", "pipeline שרץ ירוק עם cache", "manifests/Helm עם probes ו-resources", "פסקה: מה הייתם מוסיפים ל-prod (secrets, observability, rollback)"],
      rubric: HOME_RUBRIC,
      tags: ["docker", "github actions", "kubernetes", "terraform"],
      difficulty: 3,
    },
  ],
  qa: [
    {
      kind: "coding",
      slug: "test-plan-login",
      title: "מקרי בדיקה למסך התחברות",
      prompt: "למסך התחברות (אימייל + סיסמה, 'זכור אותי', 'שכחתי סיסמה', נעילה אחרי 5 ניסיונות) כתבו מערך בדיקות כקוד: טבלה/מבנה נתונים של מקרים עם שם, קלט, תוצאה צפויה ועדיפות, ולפחות 3 בדיקות אוטומטיות ב-Playwright (אפשר pseudo-selectors).\n\nכסו: נתיב מאושר, ולידציות, אבטחה (SQLi/XSS בשדות), נגישות בסיסית, ונעילה.",
      language: "typescript",
      starterCode: "import { test, expect } from '@playwright/test';\n\nexport const cases = [\n  // { name, input, expected, priority }\n];\n\ntest('valid login lands on dashboard', async ({ page }) => {\n});\n",
      rubric: [
        { criterion: "כיסוי", weight: 4, description: "מקרי קצה, שליליים, אבטחה ונגישות" },
        { criterion: "תעדוף", weight: 2, description: "P1/P2/P3 מנומק" },
        { criterion: "אוטומציה", weight: 2, description: "selectors יציבים, waits נכונים, בדיקות עצמאיות" },
        { criterion: "קריאות", weight: 2 },
      ],
      tags: ["test design", "playwright", "security"],
      difficulty: 2,
    },
    common.twoSum,
    {
      kind: "assignment",
      slug: "api-test-suite",
      title: "חבילת בדיקות ל-API ציבורי",
      prompt: "בחרו API ציבורי (למשל reqres.in או jsonplaceholder) ובנו לו חבילת בדיקות אוטומטיות: חיוביות, שליליות, סכמה (JSON schema), ביצועים בסיסיים (זמן תגובה), ודוח.\n\nהריצו ב-CI (GitHub Actions) עם דוח HTML כ-artifact.",
      deliverables: ["ריפו עם README", "לפחות 15 בדיקות ב-3 קטגוריות", "ולידציית סכמה לתשובות", "pipeline עם דוח", "מסמך קצר: באגים/חוסר עקביות שמצאתם ב-API"],
      rubric: HOME_RUBRIC,
      tags: ["api testing", "ci", "schema"],
      difficulty: 2,
    },
  ],
  mobile: [
    common.twoSum,
    {
      kind: "coding",
      slug: "infinite-list-cache",
      title: "רשימה אינסופית עם cache ו-retry",
      prompt: "כתבו hook (React Native) או ViewModel (Kotlin/Swift) usePagedList(fetchPage) שטוען עמודים לפי דרישה, שומר cache בזיכרון, מבצע retry אחד בכישלון רשת, ומונע קריאות כפולות לאותו עמוד.\n\nהחזירו { items, loadMore, loading, error, refresh }.",
      language: "typescript",
      starterCode: "export function usePagedList<T>(fetchPage: (page: number) => Promise<{ items: T[]; hasMore: boolean }>) {\n  // your code\n}\n",
      constraints: ["בלי ספריות (react-query וכו')", "גלילה מהירה לא יוצרת race"],
      rubric: CODE_RUBRIC,
      tags: ["hooks", "networking", "state"],
      difficulty: 3,
    },
    {
      kind: "assignment",
      slug: "weather-app-mobile",
      title: "אפליקציית מזג אוויר עם offline",
      prompt: "בנו אפליקציית מובייל (React Native / Flutter / native) שמציגה מזג אוויר ל-3 ערים לבחירת המשתמש מ-API ציבורי, עובדת גם offline (cache אחרון עם חותמת זמן), ותומכת ב-pull to refresh ובמצב כהה.",
      deliverables: ["ריפו עם README וצילומי מסך", "שכבת data מופרדת מה-UI", "offline עם ציון 'עודכן לפני X'", "2 בדיקות unit ל-logic", "פסקה: מה היה חסר לשחרור לחנות"],
      rubric: HOME_RUBRIC,
      tags: ["react native", "offline", "api"],
      difficulty: 2,
    },
  ],
};
