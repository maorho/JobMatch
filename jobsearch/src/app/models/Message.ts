import mongoose from "mongoose";

const AttachmentSchema = new mongoose.Schema(
  {
    key: { type: String, required: true }, // S3 object key: messages/<conversation>/<random>.<ext>
    name: { type: String, required: true, maxlength: 200 }, // the sender's filename, shown in the chat
    size: { type: Number, required: true },
    mime: { type: String, required: true },
  },
  { _id: false }
);

const MessageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, default: "", maxlength: 4000 }, // may be empty when files are attached
    attachments: { type: [AttachmentSchema], default: [] },
    readAt: { type: Date, default: undefined }, // when the recipient opened it
  },
  { timestamps: true }
);

MessageSchema.index({ conversationId: 1, createdAt: 1 });

export default mongoose.models.Message || mongoose.model("Message", MessageSchema);
