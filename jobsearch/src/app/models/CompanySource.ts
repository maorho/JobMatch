import { Schema, model, models } from "mongoose";

/**
 * A company career source the Scout agent monitors.
 * `atsType` selects the adapter; `identifier` is the token/slug that adapter
 * plugs into the ATS API URL (e.g. the Greenhouse board token, the Lever
 * company handle, the Comeet company uid). `careersUrl` is a human reference.
 */
const CompanySourceSchema = new Schema(
  {
    companyName: {
      type: String,
      required: true,
    },
    atsType: {
      type: String,
      enum: [
        "greenhouse",
        "lever",
        "comeet",
        "ashby",
        "smartrecruiters",
        "recruitee",
        "workable",
        "serpapi",
        "amazon",
        "workday",
        "google",
        "apple",
        "html",
        "generic",
      ],
      required: true,
    },
    identifier: {
      type: String,
      required: true, // board token / company slug, or (serpapi) the search query
    },
    // Comeet needs a second part (company uid + token); kept optional/generic.
    secondaryIdentifier: {
      type: String,
    },
    careersUrl: {
      type: String, // human reference, and the target for the generic adapter
      default: "",
    },
    domain: {
      type: String, // company website domain, e.g. "monday.com" — used for the logo
      default: "",
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    lastPolledAt: {
      type: Date,
    },
    lastError: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// One source per (ats, identifier) pair.
CompanySourceSchema.index({ atsType: 1, identifier: 1 }, { unique: true });

export default models.CompanySource ||
  model("CompanySource", CompanySourceSchema);
