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
    active:{
        type: Boolean,
        default: true,
    },
    embedding:{
        type: [Number], // reserved for the Matcher (in-app cosine, Atlas-ready)
        default: undefined,
        select: false,
    }
},{timestamps:true});

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
// Backs the staleness sweep (delete ATS jobs not seen in the latest polls).
ExternalJobSchema.index({ lastSeenAt: 1 });
ExternalJobSchema.index({ remote: 1 });

export default mongoose.models.ExternalJobs || mongoose.model('ExternalJobs',ExternalJobSchema);
