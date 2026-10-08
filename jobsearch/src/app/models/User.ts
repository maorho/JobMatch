import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUser extends Document {
  username: string;
  email: string;
  password: string;
  fullname: string;
  recruiter: boolean;
  admin: boolean;
  approved?: boolean;
  company_id?: mongoose.Types.ObjectId | null;
  company?: string;
  phone: string;
  resume?: string;
  currentJob?: string;

  memory?: {
    skills: string[];
    experience: string[];
    preferences: {
      preferredLanguage?: "he" | "en";
      preferredResumeStyle?: string;
      hideSections?: string[];
    };
  };

  resumeText?: string;
  embedding?: number[];
  // Latest résumé built/improved in ResumeAI (structured JSON) + its review.
  resumeStructured?: unknown;
  resumeScore?: number;
  resumeIssues?: string[];
  resumeUpdatedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

const UserSchema = new Schema<IUser>(
  {
    username: { type: String, required: true, unique: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: { type: String, required: true },
    fullname: { type: String, required: true },

    recruiter: { type: Boolean, default: false },
    admin: { type: Boolean, default: false },
    approved: { type: Boolean, default: false },

    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null,
    },
    company: { type: String, default: "" },

    resume: { type: String, default: "" },

    phone: { type: String, required: true },
    currentJob: { type: String, default: "" },

    // Extracted résumé text + its embedding, used to personalize the job feed.
    resumeText: { type: String, default: "", select: false },
    embedding: { type: [Number], default: undefined, select: false },
    // Latest résumé built/improved in ResumeAI (structured JSON) + its review.
    resumeStructured: { type: mongoose.Schema.Types.Mixed, default: undefined, select: false },
    resumeScore: { type: Number, default: undefined },
    resumeIssues: { type: [String], default: undefined },
    resumeUpdatedAt: { type: Date, default: undefined },

    memory: {
      skills: { type: [String], default: [] },
      experience: { type: [String], default: [] },
      preferences: {
        type: Object,
        // Factory default so each user gets its own object (a static literal
        // default would be shared/mutable across documents).
        default: () => ({
          preferredLanguage: "he",
          preferredResumeStyle: "ats",
          hideSections: [],
        }),
      },
    },
  },
  { timestamps: true }
);

const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

export default User;
