import mongoose from "mongoose";

const ExternalJobSchema = new mongoose.Schema({
    job:{
        type: String,
        required: true,
    },
    company_description:{
        type: String,
        default:'',
    },
    company:{
        type: String,
        required: true,
    },
    city:{
        type: String,
        required: false,
    },
    country:{
        type: String,
        required: true,
    },
    url:{
        type: String,
        required: true,
    },
    finalUrl:{
        type: String,
        required: true,
        // NOT unique: distinct postings (e.g. multi-location roles) can share an
        // apply URL. Dedup is handled per-company via (companySource, sourceJobId).
    },
    description:{
        type: String,
        default:'',
    },
    skills:{
        type: [String],
        required: true,
    },
    prefered_qualifications:{
        type: [String]
    },
    seniority:{
        type: [String],
        required: true,
    },
    // --- Scout / ATS ingestion fields (all optional, back-compatible) ---
    source:{
        type: String,
        default: 'csv', // 'greenhouse' | 'lever' | 'comeet' | 'csv' | 'manual'
    },
    sourceJobId:{
        type: String, // stable id from the ATS, used for dedup
    },
    companySource:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CompanySource',
    },
    applyUrl:{
        type: String,
    },
    // Location as the ATS gave it ("Remote - USA", "Tel Aviv-Yafo, IL"); city/
    // country above hold the normalized form (see lib/locations).
    rawLocation:{
        type: String,
        default: '',
    },
    remote:{
        type: Boolean,
        default: false,
    },
    companyDomain:{
        type: String, // company website domain, for the logo
        default: '',
    },
    logoUrl:{
        type: String, // resolved company logo URL (with graceful UI fallback)
        default: '',
    },
    postedAt:{
        type: Date, // when the posting went live on the source, if known
    },
    firstSeenAt:{
        type: Date,
        default: Date.now, // when the Scout first ingested it
    },
    lastSeenAt:{
        type: Date,
        default: Date.now, // last scout poll that still found this posting in the ATS feed
    },
    // Soft close: a posting that left its ATS feed (or went stale) is kept with
    // active:false so applications, saved lists and the SSR job page still
    // resolve it; every list/feed/search reads through OPEN_JOBS below.
    active:{
        type: Boolean,
        default: true,
    },
    closedAt:{
        type: Date,
    },
    embedding:{
        type: [Number], // reserved for the Matcher (in-app cosine, Atlas-ready)
        default: undefined,
        select: false,
    },
    // Small indexed marker for "has an embedding": `embedding: {$exists}` cannot
    // use an index (a 1536-float array), so the backfill and the health counts
    // go through this field instead.
    embeddedAt:{
        type: Date,
    }
},{timestamps:true});

/** Filter for everything a user may still apply to. `$ne:false` so legacy docs without the field stay open. */
export const OPEN_JOBS = { active: { $ne: false } } as const;

// Stable per-company dedup for ATS-sourced jobs: two sources on the same ATS
// with a colliding sourceJobId stay independent. CSV/manual docs (no sourceJobId)
// are excluded via the partial filter.
ExternalJobSchema.index(
    { companySource: 1, sourceJobId: 1 },
    { unique: true, partialFilterExpression: { sourceJobId: { $type: 'string' } } }
);

// Query-performance indexes for the dashboard filters and feeds.
ExternalJobSchema.index({ postedAt: -1 });
ExternalJobSchema.index({ company: 1 });
ExternalJobSchema.index({ country: 1 });
ExternalJobSchema.index({ city: 1 });
ExternalJobSchema.index({ active: 1 });
// Open postings newest-first: the public feed, the sitemap and the search fallback.
ExternalJobSchema.index({ active: 1, postedAt: -1 });
// Embedding backfill ("open and not embedded yet") and the health counts.
ExternalJobSchema.index({ embeddedAt: 1 });
ExternalJobSchema.index({ active: 1, embeddedAt: 1 });
// Backs the staleness sweep (soft-close ATS jobs not seen in the latest polls).
ExternalJobSchema.index({ lastSeenAt: 1 });
// "What's new since X" sorts (match digest) must use an index: a blocking sort
// over documents that carry a 1536-float embedding exceeds Mongo's 32MB limit.
ExternalJobSchema.index({ firstSeenAt: -1 });
ExternalJobSchema.index({ remote: 1 });
// Facet dropdowns: distinct(field, OPEN_JOBS) can't use the single-field
// indexes above (the filter is on `active`); these let it walk the index only.
// Built in production by the sync-indexes route.
ExternalJobSchema.index({ active: 1, company: 1 });
ExternalJobSchema.index({ active: 1, city: 1 });
ExternalJobSchema.index({ active: 1, country: 1 });

export default mongoose.models.ExternalJobs || mongoose.model('ExternalJobs',ExternalJobSchema);
