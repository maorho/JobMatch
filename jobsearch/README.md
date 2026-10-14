# JobMatch

Israeli tech-job search with a team of AI agents: the Scout ingests live postings from company ATSes (Greenhouse, Lever, Comeet, Workable, …), the Matcher embeds jobs and résumés for semantic matching, and further agents handle tailoring, referral outreach, auto-apply through a Puppeteer server, interview prep (text, voice and phone), content and application tracking via Gmail. Hebrew UI, Next.js 16 App Router, MongoDB Atlas.

## Run locally

```bash
nvm use                       # Node 22 (.nvmrc)
cp .env.example .env.local    # fill in at least MONGO_URI, JWT_SECRET, CRON_SECRET, OPENAI_API_KEY
npm ci
npm run dev                   # http://localhost:3000
```

`npm test` runs Vitest (unit + integration on an in-memory MongoDB), `npm run typecheck` and `npm run lint` match CI.

## Layout

- `src/app` — pages, API routes (`api/**`), `lib/` (agents, matcher, scout, interview, email, env contract), `models/` (Mongoose).
- `server/` — the Puppeteer render/apply server (`npm run puppeteer-server`) and the background worker (`npm run worker`); both run on a separate host.
- `tests/` — Vitest suites; `evals/` — agent evals.
- `.github/workflows` — `ci.yml` (typecheck, lint, tests, build) and `cron-jobs.yml` (scheduled scout/matcher/agent ticks against production).

## Deploy

See [DEPLOY.md](./DEPLOY.md): Vercel settings (root `jobsearch`, Node 22, env vars), Atlas indexes, GitHub secrets for the cron workflow, the Puppeteer host and post-deploy smoke checks. Every environment variable is documented in [.env.example](./.env.example) and validated at boot by `src/app/lib/env.ts`.
