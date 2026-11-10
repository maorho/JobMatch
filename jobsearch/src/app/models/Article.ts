import mongoose from "mongoose";

/**
 * An article on /Articels. Written by the Writer agent (status "draft" until
 * an admin publishes) or by hand. The static seed articles in
 * content/articles.ts are merged in at read time.
 */
export const ARTICLE_STATUSES = ["draft", "published", "archived"] as const;

const SectionSchema = new mongoose.Schema(
  {
    heading: { type: String, default: "" },
    paragraphs: { type: [String], default: [] },
    bullets: { type: [String], default: [] },
  },
  { _id: false }
);

const ReferenceSchema = new mongoose.Schema({ title: { type: String, default: "" }, url: { type: String, default: "" }, note: { type: String, default: "" } }, { _id: false });

const ArticleSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, maxlength: 200 },
    excerpt: { type: String, default: "", maxlength: 400 },
    tags: { type: [String], default: [] },
    readMinutes: { type: Number, default: 5 },
    sections: { type: [SectionSchema], default: [] },
    references: { type: [ReferenceSchema], default: [] },
    /** The English version (the top-level text is Hebrew). */
    en: {
      title: { type: String, default: "" },
      excerpt: { type: String, default: "" },
      tags: { type: [String], default: [] },
      sections: { type: [SectionSchema], default: [] },
      references: { type: [ReferenceSchema], default: [] },
    },
    seo: {
      title: { type: String, default: "" },
      description: { type: String, default: "" },
      keywords: { type: [String], default: [] },
    },
    status: { type: String, enum: ARTICLE_STATUSES, default: "draft", index: true },
    publishedAt: { type: Date },
    /** Where it came from. */
    source: { type: String, enum: ["agent", "manual"], default: "agent" },
    topic: { type: String, default: "" },
    angle: { type: String, default: "" },
    audience: { type: String, default: "" },
    model: { type: String, default: "" },
    runId: { type: mongoose.Schema.Types.ObjectId, ref: "AgentRun" },
    /** The catalog numbers the piece was grounded in (for transparency). */
    facts: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true }
);

ArticleSchema.index({ status: 1, publishedAt: -1 });

export default mongoose.models.Article || mongoose.model("Article", ArticleSchema);
