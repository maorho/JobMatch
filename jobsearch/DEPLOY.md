# פריסה (Deploy) — JobMatch

מדריך קצר להעלאת JobMatch לפרודקשן. רשימת משתני הסביבה המלאה, עם הסבר לכל מפתח, נמצאת ב-[`.env.example`](./.env.example).

## 1. Vercel (האפליקציה)

| הגדרה | ערך |
| --- | --- |
| Root Directory | `jobsearch` |
| Framework | Next.js (זיהוי אוטומטי) |
| Node.js | **22.x** — נגזר מ-`package.json` → `engines` (ו-`.nvmrc` מקומית) |
| Build / Install | ברירת המחדל (`npm ci`, `next build`) |

**משתני סביבה** (Settings → Environment Variables, לכל סביבה שרלוונטית — Production וגם Preview):

- חובה: `MONGO_URI`, `JWT_SECRET`, `CRON_SECRET` (32+ תווים בפרודקשן), `APP_URL` (https, בלי `/` בסוף).
- מומלץ: `OPENAI_API_KEY` (בלעדיו אין התאמה/סוכנים/ראיונות), S3 (`AWS_*`, `S3_BUCKET_NAME`), מייל (`RESEND_API_KEY` או `SMTP_*` + `EMAIL_FROM`).
- לפי פיצ'ר: Google (`GOOGLE_CLIENT_ID/SECRET` + `TOKEN_ENCRYPTION_KEY`), WhatsApp/Telegram (כולל `WHATSAPP_APP_SECRET` / `TELEGRAM_WEBHOOK_SECRET`), Puppeteer (`PUPPETEER_SERVER_URL` + `SCRAPER_TOKEN`).
- ב-Preview אפשר `APP_URL` של ה-preview; ה-OAuth redirect חייב להיות רשום ב-Google Console לאותו origin.

`src/app/lib/env.ts` נבדק בעליית השרת: בפרודקשן פריסה עם מפתח חסר/קצר **נכשלת בעלייה** (ולא ב-cron הראשון). משתנה עם שם שגוי (`SERPAPI-KEY` במקום `SERPAPI_KEY`) מקבל אזהרה בלוג.

**maxDuration**: ראוטים כבדים (`/api/agents/tick`, `/api/scout/run` — 300 שניות; עוד ~30 ראוטים עם ערך נמוך יותר) דורשים תוכנית Pro או Fluid Compute. ב-Hobby הם ייחתכו אחרי 60 שניות.

כותרות אבטחה (`X-Frame-Options`, `Permissions-Policy`, CSP ב-Report-Only) מוגדרות ב-`next.config.ts`. ה-CSP כרגע רק מדווח; לפני אכיפה יש לעבור על הדיווחים ולהוסיף nonces לסקריפטים של Next.

## 2. MongoDB Atlas

1. Cluster עם IP allowlist `0.0.0.0/0` (Vercel לא מגיע מכתובת קבועה) או Private Endpoint.
2. אינדקסי Atlas Search על האוסף של המשרות (`src/app/lib/matcher/atlas.ts`):
   - `job_vectors` — vector: `embedding`, 1536 ממדים, cosine; פילטרים `company`, `country`, `city`, `remote`, `firstSeenAt`.
   - `job_text` — string: `job`, `description`, `company`, `skills`; token: `city`, `country`.
3. אינדקסים רגילים של Mongoose: אחרי הפריסה הראשונה (וכל שינוי סכמה) להריץ
   `GET $APP_URL/api/scout/sync-indexes?cron_secret=$CRON_SECRET`.
4. בלי אינדקסי Atlas Search האפליקציה נופלת לחישוב in-process (`ATLAS_SEARCH=0` כופה זאת).

## 3. GitHub Actions

- `ci.yml` — typecheck, lint, בדיקות, build על Node 22; `npm audit` קריטי בלבד, לא חוסם.
- `cron-jobs.yml` — מפעיל את ה-cron routes (scout, matcher, agents tick, gmail sync, ניקוי).
  Secrets נדרשים ב-Repository → Settings → Secrets:
  - `CRON_SECRET` — זהה לערך ב-Vercel.
  - `PROD_BASE_URL` — ה-origin של הפרודקשן (כרגע קבוע ב-workflow כ-`https://job-match-six.vercel.app`; אם עוברים לדומיין משלכם, לעדכן).

## 4. שרת Puppeteer + Worker (מארח נפרד)

`next` על Vercel לא יכול להריץ Chrome. שרת ה-apply רץ על VM/Container (Railway, Fly, Render, EC2):

```bash
cd jobsearch && npm ci
SCRAPER_TOKEN=... SCRAPER_ALLOWED_ORIGIN=https://job-match-six.vercel.app OPENAI_API_KEY=... npm run puppeteer-server   # מאזין על פורט 4000
APP_URL=https://job-match-six.vercel.app CRON_SECRET=... OPENAI_API_KEY=... npm run worker                               # תור ה-auto-apply
```

- `PORT` של השרת קבוע ל-4000 ב-`server/index.ts`; לשים אותו מאחורי reverse proxy עם TLS, ולתת ל-Vercel את ה-URL הציבורי כ-`PUPPETEER_SERVER_URL`.
- `SCRAPER_TOKEN` חייב להיות זהה בשני הצדדים (בפרודקשן הוא חובה כשיש `PUPPETEER_SERVER_URL`).
- `FEATURE_AUTO_APPLY` לא נדרש: הפיצ'ר נדלק אוטומטית כשיש `PUPPETEER_SERVER_URL`.
- Worker: `WORKER_BUDGET_MS` / `WORKER_IDLE_MS` לכיוונון.

## 5. בדיקות אחרי פריסה (smoke)

```bash
BASE=https://job-match-six.vercel.app
curl -fsS "$BASE/api/admin/health?cron_secret=$CRON_SECRET" | jq      # db, catalogue freshness, מה מוגדר, usage
curl -fsSI "$BASE/" | grep -i "x-frame-options\|content-security"        # כותרות האבטחה
curl -fsS "$BASE/robots.txt"; curl -fsS "$BASE/sitemap.xml" | head -c 400  # APP_URL נכון (לא localhost)
```

ב-Vercel → Logs: בעלייה לא אמורה להופיע `Invalid environment`; אזהרות `⚠️ env:` מצביעות על שירות אופציונלי שלא הוגדר.

## 6. פיתוח מקומי

```bash
nvm use            # .nvmrc → 22
cp .env.example .env.local   # ולמלא
npm ci && npm run dev
```
