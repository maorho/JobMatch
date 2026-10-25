import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs from "@/app/models/ExternalJobs";
import CompanySource from "@/app/models/CompanySource";
import { getAdapter } from "./adapters";
import { getLogoUrl, resolveLogoDomain } from "./logo";
import { isIsraelOrRemote } from "./locationFilter";
import { NormalizedPosting, toPartialPostings } from "./types";
import { normalizeLocation } from "@/app/lib/locations/normalizeLocation";

/**
 * Canonical city/country/remote for a posting (location agent, rules stage).
 * When the rules can't resolve the string we keep the raw city so nothing is
 * lost; the backfill endpoint later runs the LLM stage over `rawLocation`.
 */
function locationFields(p: NormalizedPosting) {
  const loc = normalizeLocation({ city: p.city, country: p.country });
  return {
    city: loc.confidence === "low" ? p.city || "" : loc.city,
    country: loc.country || p.country || "Unknown",
    remote: loc.remote,
    rawLocation: loc.raw,
  };
}

/**
 * ATS types whose adapter can return a company's COMPLETE current board. For
 * these we reconcile immediately — but only when the adapter says the list is
 * complete (a plain array, or `complete: true`; see AdapterResult in types.ts):
 * a stored job that is no longer in the feed has been filled/closed and is
 * soft-closed on the spot (`active:false`, `closedAt`), keeping the row and
 * its applications; it is reopened if it reappears. A partial list still
 * ingests new postings and refreshes lastSeenAt, it just never closes anything.
 * Excluded: "workday" (adapter caps detail enrichment at ~80 postings, so its
 * list can be partial) and "serpapi" (an aggregator — one source maps to many
 * companies), which both rely on the time-based staleness sweep instead.
 */
const COMPLETE_FEED_ATS = new Set([
  "greenhouse",
  "lever",
  "comeet",
  "ashby",
  "recruitee",
  "smartrecruiters",
  "amazon",
  "google", // paginates to exhaustion; partial when a later page fails or the page cap is hit
  "apple", // pages until totalRecords is reached (partial otherwise)
  "eightfold", // pages until the reported count is reached (partial otherwise)
]);

export type ScoutSourceResult = {
  company: string;
  atsType: string;
  fetched: number;
  created: number;
  /** Postings soft-closed because they left a complete feed. */
  removed: number;
  /** Previously closed postings that came back. */
  reopened?: number;
  /** The adapter could not deliver the whole board: new postings were ingested, nothing was soft-closed. */
  partial?: boolean;
  partialReason?: string;
  error?: string;
};

/** One source may not eat the chunk: past this, it is recorded as errored and nothing is reconciled. */
const SOURCE_DEADLINE_MS = 90_000;
/**
 * Per-ATS overrides for boards that legitimately need longer. Eightfold pages
 * ten at a time with rate-limit backoff and time-boxes itself (list 60s,
 * details until 85s), so it gets a little headroom over the default.
 */
const SOURCE_DEADLINE_BY_ATS: Partial<Record<string, number>> = {
  eightfold: 120_000,
};
/** Slack between a source's deadline and the hard end of the call (bookkeeping, DB writes, response). */
const START_MARGIN_MS = 10_000;
/** The always-polled first source never gets less than this, even when the caller is nearly out of time. */
const MIN_FIRST_SOURCE_MS = 20_000;

export function sourceDeadlineFor(atsType: string, override?: number): number {
  return override ?? SOURCE_DEADLINE_BY_ATS[atsType] ?? SOURCE_DEADLINE_MS;
}

function withDeadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: source deadline of ${Math.round(ms / 1000)}s exceeded`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export type ScoutResult = {
  sources: number; // sources handled in this call
  totalSources: number; // enabled sources matching the query
  processed: number; // sources actually polled before the time budget ran out
  nextOffset: number | null; // where the next chunk should start; null = done
  created: number;
  removed: number;
  results: ScoutSourceResult[];
};

export type RunOptions = {
  company?: string; // limit to one company (by name), for debugging
  dry?: boolean; // fetch + diff but do not write
  /**
   * Chunking for serverless hosts: process sources [offset, offset+limit) in a
   * stable (_id) order, and stop starting new sources once `timeBudgetMs` has
   * elapsed. The result's `nextOffset` tells the caller where to resume, so a
   * cron can walk the whole catalog in several short calls instead of one
   * long call that gets killed by the platform timeout.
   */
  offset?: number;
  limit?: number;
  timeBudgetMs?: number;
  /**
   * Absolute time (ms since epoch) the whole call must be finished by — the
   * platform limit or the bus deadline. A source is only started when its
   * full per-source deadline (+ margin) still fits before it, so a big board
   * started near the end can never overrun the function.
   */
  deadlineAt?: number;
  /**
   * Also rewrite title/description/location/postedAt of postings we already
   * have (normally only new postings are written). Used after parser or
   * normalizer improvements so the existing catalog picks them up. City /
   * country / remote are only rewritten when the raw location string changed,
   * so a value the Locator (LLM stage) already cleaned is kept.
   */
  refresh?: boolean;
  /** Called after every source (the bus lease renewal when run as an agent). */
  heartbeat?: () => Promise<void> | void;
  /** Override the per-source deadline (tests). */
  sourceDeadlineMs?: number;
};

/**
 * The Scout agent: for every enabled company source, pull current postings
 * from its ATS, detect the ones we have not stored yet, and ingest them.
 */
export async function runScout(opts: RunOptions = {}): Promise<ScoutResult> {
  await connectToDatabase();

  const query: Record<string, unknown> = { enabled: true };
  if (opts.company) query.companyName = opts.company;

  const offset = Math.max(0, opts.offset ?? 0);
  const limit = opts.limit && opts.limit > 0 ? opts.limit : 0; // 0 = no cap
  const timeBudgetMs = opts.timeBudgetMs ?? Infinity;
  const startedAt = Date.now();

  const totalSources = await CompanySource.countDocuments(query);
  let cursor = CompanySource.find(query).sort({ _id: 1 }).skip(offset);
  if (limit) cursor = cursor.limit(limit);
  const sources = await cursor;

  const results: ScoutSourceResult[] = [];
  let createdTotal = 0;
  let removedTotal = 0;
  let processed = 0;

  for (const src of sources) {
    // Out of time: leave the rest for the next chunk rather than get killed.
    // Always poll at least one source so every call makes progress.
    let deadlineMs = sourceDeadlineFor(src.atsType, opts.sourceDeadlineMs);
    if (processed > 0) {
      if (Date.now() - startedAt > timeBudgetMs) break;
      // Not enough room left for this source's worst case: the next chunk starts it.
      if (opts.deadlineAt && opts.deadlineAt - Date.now() < deadlineMs + START_MARGIN_MS) break;
    } else if (opts.deadlineAt) {
      // The first source always runs, but never past the hard end of the call.
      deadlineMs = Math.min(deadlineMs, Math.max(MIN_FIRST_SOURCE_MS, opts.deadlineAt - Date.now() - START_MARGIN_MS));
    }
    processed++;
    const result: ScoutSourceResult = {
      company: src.companyName,
      atsType: src.atsType,
      fetched: 0,
      created: 0,
      removed: 0,
    };

    try {
      const adapter = getAdapter(src.atsType);
      if (!adapter) throw new Error(`No adapter for atsType "${src.atsType}"`);

      const fetched = toPartialPostings(await withDeadline(adapter(src.identifier, src.secondaryIdentifier), deadlineMs, src.companyName));
      const postings = fetched.postings;
      result.fetched = postings.length;
      if (!fetched.complete) {
        result.partial = true;
        if (fetched.reason) result.partialReason = fetched.reason;
        console.warn(`[scout] ${src.companyName}: partial list (${postings.length} postings) — ingesting, not reconciling${fetched.reason ? `: ${fetched.reason}` : ""}`);
      }
      // Only a complete board may close jobs; a partial one would close live postings it never reached.
      const reconcile = COMPLETE_FEED_ATS.has(src.atsType) && fetched.complete && postings.length > 0;

      // Which of these do we already have? Dedup per company source so two
      // companies on the same ATS with a colliding sourceJobId stay independent.
      // A stored posting that was soft-closed and is back in the feed is
      // reopened below rather than treated as new.
      const ids = postings.map((p) => p.sourceJobId).filter(Boolean);
      const existing = await ExternalJobs.find({
        companySource: src._id,
        sourceJobId: { $in: ids },
      }).select("sourceJobId active rawLocation");
      const seen = new Set(existing.map((e: any) => e.sourceJobId));
      const closed = new Set(existing.filter((e: any) => e.active === false).map((e: any) => e.sourceJobId));
      const storedRaw = new Map(existing.map((e: any) => [e.sourceJobId, e.rawLocation || ""]));

      // Relevance uses both the raw strings and the normalized remote flag, so
      // "Remote - USA" (normalized to country United States) still qualifies.
      const relevant = (p: NormalizedPosting) =>
        isIsraelOrRemote({ ...p, remote: locationFields(p).remote });

      const fresh = postings.filter(
        (p) => p.sourceJobId && !seen.has(p.sourceJobId) && relevant(p)
      );

      // All currently-open Israel/remote postings for this source — the keep
      // set the stored jobs are reconciled against.
      const keepPostings = postings.filter((p) => p.sourceJobId && relevant(p));
      const keepIds = keepPostings.map((p) => p.sourceJobId as string);

      if (!opts.dry) {
        if (fresh.length) {
          // Aggregators (SerpApi) return many different companies, so the
          // company name and logo come from each posting; ATS sources use the
          // configured company + domain.
          const isAggregator = src.atsType === "serpapi";
          const docs = fresh.map((p: NormalizedPosting) => {
            const link =
              p.applyUrl || `https://jobs.local/${src.atsType}/${p.sourceJobId}`;
            const company = isAggregator
              ? p.company || src.companyName
              : src.companyName;
            // Resolve the company's own domain; never a shared ATS host like
            // comeet.com (which would give every company the same logo).
            const domain = resolveLogoDomain(src.domain, company);
            return {
              job: p.title,
              company,
              company_description: "",
              ...locationFields(p),
              url: link,
              finalUrl: link,
              description: p.description,
              skills: [],
              prefered_qualifications: [],
              seniority: p.seniority || [],
              source: src.atsType,
              sourceJobId: p.sourceJobId,
              companySource: src._id,
              applyUrl: p.applyUrl,
              postedAt: p.postedAt,
              active: true,
              companyDomain: domain,
              logoUrl: getLogoUrl(domain),
            };
          });

          try {
            const inserted = await ExternalJobs.insertMany(docs, {
              ordered: false,
            });
            result.created = inserted.length;
          } catch (e: any) {
            // Duplicate-key races are expected and fine; count what landed and
            // only log genuinely unexpected write errors (per-doc codes live in
            // writeErrors on a MongoBulkWriteError, not the top-level code).
            result.created =
              e?.insertedDocs?.length ?? e?.result?.insertedCount ?? 0;
            const writeErrors = e?.writeErrors ?? e?.result?.writeErrors ?? [];
            const nonDup = (Array.isArray(writeErrors) ? writeErrors : []).filter(
              (we: any) => (we?.code ?? we?.err?.code) !== 11000
            );
            if (nonDup.length) {
              console.error(`[scout] insert errors for ${src.companyName}:`, nonDup);
            }
          }
        }

        // Refresh the "last seen" stamp on every still-open posting so the
        // staleness sweep never expires a job that is still in the feed, and
        // reopen any that had been soft-closed (back in the feed = open again).
        if (keepIds.length) {
          await ExternalJobs.updateMany(
            { companySource: src._id, sourceJobId: { $in: keepIds } },
            { $set: { lastSeenAt: new Date(), active: true }, $unset: { closedAt: 1 } }
          );
          const reopened = keepIds.filter((id) => closed.has(id)).length;
          if (reopened) result.reopened = reopened;
        }

        // Optional full refresh of existing postings (parser/normalizer upgrades).
        // Location fields are left alone unless the raw string changed: the
        // Locator may have resolved them better than the rules can.
        if (opts.refresh && keepPostings.length) {
          await ExternalJobs.bulkWrite(
            keepPostings.map((p) => {
              const loc = locationFields(p);
              const sameRaw = storedRaw.has(p.sourceJobId) && storedRaw.get(p.sourceJobId) === loc.rawLocation;
              return {
                updateOne: {
                  filter: { companySource: src._id, sourceJobId: p.sourceJobId },
                  update: {
                    $set: {
                      job: p.title,
                      description: p.description,
                      seniority: p.seniority || [],
                      ...(p.postedAt ? { postedAt: p.postedAt } : {}),
                      ...(p.applyUrl ? { applyUrl: p.applyUrl, url: p.applyUrl, finalUrl: p.applyUrl } : {}),
                      ...(sameRaw ? {} : loc),
                    },
                  },
                },
              };
            }),
            { ordered: false }
          );
        }

        // Live reconciliation: for ATS types that return a complete board,
        // a stored job no longer in the feed has been filled/closed — soft-close
        // it (the row and its applications stay; readers filter active:false).
        // Guarded by postings.length > 0 so a transient empty fetch can't close
        // a company's jobs, and by `fetched.complete` so a partial list never does.
        if (reconcile) {
          const gone = await ExternalJobs.updateMany(
            { companySource: src._id, sourceJobId: { $type: "string", $nin: keepIds }, active: { $ne: false } },
            { $set: { active: false, closedAt: new Date() } }
          );
          result.removed = gone.modifiedCount ?? 0;
        }
      } else {
        result.created = fresh.length; // would-create count
        if (reconcile) {
          result.removed = await ExternalJobs.countDocuments({
            companySource: src._id,
            sourceJobId: { $type: "string", $nin: keepIds },
            active: { $ne: false },
          });
        }
      }

      createdTotal += result.created;
      removedTotal += result.removed;

      if (!opts.dry) {
        src.lastPolledAt = new Date();
        src.lastError = "";
        await src.save();
      }
    } catch (err: any) {
      result.error = err?.message || String(err);
      console.error(`[scout] ${src.companyName} failed:`, err);
      if (!opts.dry) {
        src.lastPolledAt = new Date();
        src.lastError = result.error ?? "";
        await src.save();
      }
    }

    results.push(result);
    await opts.heartbeat?.();
  }

  // More to do if we stopped early (budget) or this chunk didn't reach the end.
  const reached = offset + processed;
  const nextOffset = reached < totalSources ? reached : null;

  return {
    sources: sources.length,
    totalSources,
    processed,
    nextOffset,
    created: createdTotal,
    removed: removedTotal,
    results,
  };
}
