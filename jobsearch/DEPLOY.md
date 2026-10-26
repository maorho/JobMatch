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

- חובה: `MONGO_URI`, `JWT_SECRET`, `CRON_SECRET` (32+ תווים בפרודקשן), `APP_URL` (https, בלי `/` בסוף; ב-Preview ראו למטה).
- מומלץ: `OPENAI_API_KEY` (בלעדיו אין התאמה/סוכנים/ראיונות), S3 (`AWS_*`, `S3_BUCKET_NAME`), מייל (`RESEND_API_KEY` או `SMTP_*` + `EMAIL_FROM` — ראו "מייל" למטה).
- לפי פיצ'ר: Google (`GOOGLE_CLIENT_ID/SECRET` + `TOKEN_ENCRYPTION_KEY`), WhatsApp/Telegram (כולל `WHATSAPP_APP_SECRET` / `TELEGRAM_WEBHOOK_SECRET`), Puppeteer (`PUPPETEER_SERVER_URL` + `SCRAPER_TOKEN`).

`src/app/lib/env.ts` נבדק בעליית השרת. **רק** ארבעת מפתחות החובה (`MONGO_URI`, `JWT_SECRET`, `CRON_SECRET`, `APP_URL`) מפילים פריסת פרודקשן **בעלייה** (ולא ב-cron הראשון). כל השאר אופציונלי: מפתח-שותף חסר (למשל `TELEGRAM_BOT_TOKEN` בלי `TELEGRAM_WEBHOOK_SECRET`, `PUPPETEER_SERVER_URL` בלי `SCRAPER_TOKEN`) או ערך לא תקין מייצרים אזהרת `⚠️ env:` בלוג, הערך מתעלם והפיצ'ר מכבה את עצמו (webhook מחזיר 503, auto-apply כבוי וכו'). ערך ריק (`KEY=`) נחשב לא מוגדר; דגלי `FEATURE_*` מקבלים `1`/`0` וגם `true`/`false`. משתנה עם שם שגוי (`SERPAPI-KEY` במקום `SERPAPI_KEY`) מקבל אזהרה בלוג.

**Preview deployments**: ב-Preview (`VERCEL_ENV=preview`) אין צורך להגדיר `APP_URL` — אם הוא חסר, האפליקציה משתמשת ב-`https://$VERCEL_BRANCH_URL` (כתובת קבועה לכל branch), ואם גם הוא חסר ב-`https://$VERCEL_URL` (שניהם מוזרקים ע"י Vercel). בפרודקשן (`VERCEL_ENV=production`) `APP_URL` עדיין חובה. OAuth ב-Preview עובד רק אם ה-redirect של אותו origin רשום ב-Google Console.

**מייל (Gmail SMTP)**: ב-Google Account → Security מפעילים אימות דו-שלבי ויוצרים App Password, ואז:
`SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=<כתובת ה-Gmail>`, `SMTP_PASS=<ה-App Password>`, `EMAIL_FROM=<אותה כתובת>` (למשל `JobMatch <you@gmail.com>`). **לא** להגדיר `SMTP_SECURE` — בפורט 465 TLS נדלק אוטומטית. חלופה: `RESEND_API_KEY` + `EMAIL_FROM` מדומיין מאומת ב-Resend.

**maxDuration**: ראוטים כבדים (`/api/agents/tick`, `/api/scout/run` — 300 שניות; עוד ~30 ראוטים עם ערך נמוך יותר) דורשים תוכנית Pro או Fluid Compute. ב-Hobby הם ייחתכו אחרי 60 שניות.

כותרות אבטחה (`X-Frame-Options`, `Permissions-Policy`, CSP ב-Report-Only) מוגדרות ב-`next.config.ts`. ה-CSP כרגע רק מדווח: הדפדפן שולח הפרות ל-`/api/csp-report`, שרושם שורה אחת לכל הפרה (`[csp] <directive> blocked <uri> on <path>`, עד 20 בדקה לכל instance) ב-Vercel Logs. לפני אכיפה יש לעבור על הדיווחים ולהוסיף nonces לסקריפטים של Next.

## 2. MongoDB Atlas

1. Cluster עם IP allowlist `0.0.0.0/0` (Vercel לא מגיע מכתובת קבועה) או Private Endpoint.
2. אינדקסי Atlas Search על האוסף של המשרות (`src/app/lib/matcher/atlas.ts`):
   - `job_vectors` — vector: `embedding`, 1536 ממדים, cosine; פילטרים `company`, `country`, `city`, `remote`, `firstSeenAt`.
   - `job_text` — string: `job`, `description`, `company`, `skills`; token: `city`, `country`.
3. אינדקסים רגילים של Mongoose: אחרי הפריסה הראשונה (וכל שינוי סכמה) להריץ
   `GET $APP_URL/api/scout/sync-indexes?cron_secret=$CRON_SECRET`.
4. בלי אינדקסי Atlas Search האפליקציה נופלת לחישוב in-process (`ATLAS_SEARCH=0` כופה זאת).
5. סינון משרות לא-פעילות בתוך שלב ה-Atlas (`ATLAS_FILTER_ACTIVE`): להוסיף את `active` כשדה filter לאינדקס `job_vectors` (`{"type": "filter", "path": "active"}`) וכ-`boolean` לאינדקס `job_text`, לחכות שהאינדקסים יסיימו build, ורק אז להגדיר `ATLAS_FILTER_ACTIVE=1` ב-Vercel. בלי זה (ברירת המחדל) המשרות הלא-פעילות מסוננות אחרי השלב — עובד, רק פחות מדויק ב-limit.

## 3. GitHub Actions

- `ci.yml` — typecheck, lint, בדיקות, build על Node 22; `npm audit` קריטי בלבד, לא חוסם.
- `cron-jobs.yml` — מפעיל את ה-cron routes (scout, matcher, agents tick, gmail sync, ניקוי).
  Secret נדרש ב-Repository → Settings → Secrets: `CRON_SECRET` — זהה לערך ב-Vercel.
  `PROD_BASE_URL` **אינו** secret: הוא מוגדר ב-`env:` של קובץ ה-workflow עצמו (`.github/workflows/cron-jobs.yml`, כרגע `https://job-match-six.vercel.app`). אם עוברים לדומיין משלכם — לעדכן שם.
- CI רץ על כל push, וגם על pull_request; ה-concurrency group מבוסס על שם ה-branch, כך שריצת ה-PR מבטלת את ריצת ה-push של אותו branch.

## 4. שרת Puppeteer + Worker (מארח נפרד)

`next` על Vercel לא יכול להריץ Chrome. שרת ה-apply רץ על VM/Container (Railway, Fly, Render, EC2):

```bash
cd jobsearch && npm ci
# שרת ה-apply (Chrome). PORT אופציונלי — ברירת מחדל 4000
PORT=4000 SCRAPER_TOKEN=... SCRAPER_ALLOWED_ORIGIN=https://job-match-six.vercel.app OPENAI_API_KEY=... npm run puppeteer-server

# ה-worker (תור ה-auto-apply וה-agent ticks הארוכים) — אותו env contract כמו האפליקציה
NODE_ENV=production MONGO_URI=... JWT_SECRET=... CRON_SECRET=... APP_URL=https://job-match-six.vercel.app OPENAI_API_KEY=... \
PUPPETEER_SERVER_URL=https://apply.example.com SCRAPER_TOKEN=... npm run worker
```

- השרת מאזין על `process.env.PORT` (ברירת מחדל 4000, `server/index.ts`) — כך עובד גם בפלטפורמות שמזריקות `PORT` (Railway/Render/Fly). לשים אותו מאחורי reverse proxy עם TLS, ולתת ל-Vercel ול-worker את ה-URL הציבורי כ-`PUPPETEER_SERVER_URL`.
- ה-worker מריץ את אותה בדיקת env (`validateEnv`): `MONGO_URI`, `JWT_SECRET`, `CRON_SECRET`, `APP_URL` חובה; `OPENAI_API_KEY` לסוכנים; `PUPPETEER_SERVER_URL` + `SCRAPER_TOKEN` נדרשים כדי שהוא באמת יגיש — בלעדיהם auto-apply כבוי ובקשות ההגשה נדחות (deferred).
- `SCRAPER_TOKEN` חייב להיות זהה בכל הצדדים (Vercel, worker, שרת ה-apply). בפרודקשן `PUPPETEER_SERVER_URL` בלי `SCRAPER_TOKEN` = אזהרה בעלייה ו-auto-apply כבוי.
- `FEATURE_AUTO_APPLY` לא נדרש: הפיצ'ר נדלק אוטומטית כששרת ה-apply מוגדר (`FEATURE_AUTO_APPLY=0` מכבה). כשהוא כבוי, כרטיס ההגשה האוטומטית מציג "הגשה אוטומטית אינה זמינה כרגע".
- Worker: `WORKER_BUDGET_MS` / `WORKER_IDLE_MS` לכיוונון.

## 5. בדיקות אחרי פריסה (smoke)

```bash
BASE=https://job-match-six.vercel.app
curl -fsS "$BASE/api/admin/health?cron_secret=$CRON_SECRET" | jq      # db, catalogue freshness, מה מוגדר, usage
curl -fsSI "$BASE/" | grep -i "x-frame-options\|content-security"        # כותרות האבטחה
curl -fsS "$BASE/robots.txt"; curl -fsS "$BASE/sitemap.xml" | head -c 400  # APP_URL נכון (לא localhost)
```

ב-Vercel → Logs: בעלייה לא אמורה להופיע `Invalid environment`; אזהרות `⚠️ env:` מצביעות על שירות אופציונלי שלא הוגדר או שהוגדר חלקית (ולכן כבוי).

## 6. פיתוח מקומי

```bash
nvm use            # .nvmrc → 22
cp .env.example .env.local   # ולמלא
npm ci && npm run dev
```
