import mongoose from "mongoose";

/** A message sent through the Contact Us form. */
const ContactMessageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, maxlength: 120 },
    email: { type: String, required: true, maxlength: 200, lowercase: true, trim: true },
    subject: { type: String, default: "", maxlength: 200 },
    message: { type: String, required: true, maxlength: 5000 },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: undefined },
    status: { type: String, enum: ["new", "read", "replied"], default: "new" },
  },
  { timestamps: true }
);

ContactMessageSchema.index({ status: 1, createdAt: -1 });

export default mongoose.models.ContactMessage || mongoose.model("ContactMessage", ContactMessageSchema);
