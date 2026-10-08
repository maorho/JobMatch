import { connectToDatabase } from "@/app/lib/db";
import ExternalJobs from "@/app/models/ExternalJobs";
import CompanySource from "@/app/models/CompanySource";
import Candidates from "@/app/models/Candidates";
import { getAdapter } from "./adapters";
import { getLogoUrl, resolveLogoDomain } from "./logo";
import { isIsraelOrRemote } from "./locationFilter";
import { NormalizedPosting } from "./types";
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
 * ATS types whose adapter returns a company's COMPLETE current board in one
 * pass. For these we can reconcile immediately: a stored job that is no longer
 * in the feed has been filled/closed and is deleted on the spot. Excluded:
 * "workday" (adapter caps detail enrichment at ~80 postings, so its list can be
 * partial) and "serpapi" (an aggregator — one source maps to many companies),
 * which both rely on the time-based staleness sweep instead.
 */
const COMPLETE_FEED_ATS = new Set([
  "greenhouse",
  "lever",
  "comeet",
  "ashby",
  "recruitee",
  "smartrecruiters",
  "amazon",
  "google", // paginates to exhaustion, so the list is complete
  "apple", // same: pages until totalRecords is reached
]);

export type ScoutSourceResult = {
  company: string;
  atsType: string;
  fetched: number;
  created: number;
  removed: number;
  error?: string;
};

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
   * Also rewrite title/description/location/postedAt of postings we already
   * have (normally only new postings are written). Used after parser or
   * normalizer improvements so the existing catalog picks them up.
   */
  refresh?: boolean;
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
    if (processed > 0 && Date.now() - startedAt > timeBudgetMs) break;
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

      const postings = await adapter(src.identifier, src.secondaryIdentifier);
      result.fetched = postings.length;

      // Which of these do we already have? Dedup per company source so two
      // companies on the same ATS with a colliding sourceJobId stay independent.
      const ids = postings.map((p) => p.sourceJobId).filter(Boolean);
      const existing = await ExternalJobs.find({
        companySource: src._id,
        sourceJobId: { $in: ids },
      }).select("sourceJobId");
      const seen = new Set(existing.map((e: any) => e.sourceJobId));

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
        // staleness sweep never expires a job that is still in the feed.
        if (keepIds.length) {
          await ExternalJobs.updateMany(
            { companySource: src._id, sourceJobId: { $in: keepIds } },
            { $set: { lastSeenAt: new Date(), active: true } }
          );
        }

        // Optional full refresh of existing postings (parser/normalizer upgrades).
        if (opts.refresh && keepPostings.length) {
          await ExternalJobs.bulkWrite(
            keepPostings.map((p) => ({
              updateOne: {
                filter: { companySource: src._id, sourceJobId: p.sourceJobId },
                update: {
                  $set: {
                    job: p.title,
                    description: p.description,
                    seniority: p.seniority || [],
                    ...(p.postedAt ? { postedAt: p.postedAt } : {}),
                    ...(p.applyUrl ? { applyUrl: p.applyUrl, url: p.applyUrl, finalUrl: p.applyUrl } : {}),
                    ...locationFields(p),
                  },
                },
              },
            })),
            { ordered: false }
          );
        }

        // Live reconciliation: for ATS types that return a complete board,
        // a stored job no longer in the feed has been filled/closed — delete it
        // (and cascade its application records). Guarded by postings.length > 0
        // so a transient empty fetch can't wipe a company's jobs.
        if (COMPLETE_FEED_ATS.has(src.atsType) && postings.length > 0) {
          const gone = await ExternalJobs.find({
            companySource: src._id,
            sourceJobId: { $type: "string", $nin: keepIds },
          }).select("_id");
          if (gone.length) {
            const goneIds = gone.map((g: any) => g._id);
            await ExternalJobs.deleteMany({ _id: { $in: goneIds } });
            await Candidates.deleteMany({
              jobModel: "ExternalJobs",
              jobId: { $in: goneIds },
            });
            result.removed = goneIds.length;
          }
        }
      } else {
        result.created = fresh.length; // would-create count
        if (COMPLETE_FEED_ATS.has(src.atsType) && postings.length > 0) {
          result.removed = await ExternalJobs.countDocuments({
            companySource: src._id,
            sourceJobId: { $type: "string", $nin: keepIds },
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
