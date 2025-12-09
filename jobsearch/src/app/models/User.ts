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

  // ✅ תוסיף את אלה כדי ש-TypeScript יכיר בהם
  createdAt?: Date;
  updatedAt?: Date;
}

export type IUserModel = IUser;
const UserSchema = new Schema<IUser>(
  {
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
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
  },
  { timestamps: true } // ✅ זה מוסיף createdAt ו-updatedAt למסד הנתונים
);

const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

export default User;