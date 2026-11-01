import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Files sent in a chat thread (candidate ↔ recruiter). Stored in the app's
 * S3 bucket under <prefix><conversation>/<random>.<ext>, never under the
 * sender's filename; read back through a short-lived signed URL that only a
 * participant can mint (the route checks membership). Under test, or when
 * S3 isn't configured, an in-memory store stands in so the feature degrades
 * clearly instead of half-working.
 *
 * The prefix defaults to "resumes/messages/": the app's IAM user may only
 * write under "resumes/" (and may not delete anything). MESSAGE_FILES_PREFIX
 * overrides it once the policy is widened.
 */
export const MESSAGE_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const MESSAGE_FILES_PER_MESSAGE = 3;
export const SIGNED_URL_TTL_SEC = 5 * 60;
const prefix = () => (process.env.MESSAGE_FILES_PREFIX || "resumes/messages/").replace(/^\/+/, "").replace(/\/?$/, "/");
const folderOf = (conversationId: string) => `${prefix()}${conversationId}/`;

/** What people send a recruiter: a résumé, a cover letter, a portfolio, a certificate, a screenshot. */
const ALLOWED: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  md: "text/markdown",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  zip: "application/zip",
};

export type MessageAttachment = { key: string; name: string; size: number; mime: string };

export const extensionOf = (name: string) => (name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "");
export const isAllowedFile = (name: string) => extensionOf(name) in ALLOWED;
export const isImage = (mime: string) => mime.startsWith("image/");

export function s3Configured(): boolean {
  return !!(process.env.AWS_REGION && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.S3_BUCKET_NAME);
}

let client: S3Client | null = null;
const s3 = () =>
  (client ??= new S3Client({
    region: process.env.AWS_REGION!,
    credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID!, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY! },
  }));

/** Test / unconfigured stand-in: bytes kept in this process; "signed" URLs are data: URLs so a download still works. */
const memory = new Map<string, { bytes: Buffer; mime: string }>();
const memoryStore = () => process.env.NODE_ENV === "test" || !s3Configured();

export class AttachmentError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Validate and store one file; returns the metadata the message carries. */
export async function storeMessageFile(conversationId: string, file: { name: string; size: number; bytes: Buffer }): Promise<MessageAttachment> {
  const ext = extensionOf(file.name);
  const mime = ALLOWED[ext];
  if (!mime) throw new AttachmentError(415, `סוג קובץ לא נתמך: ${file.name}`);
  if (file.size > MESSAGE_FILE_MAX_BYTES || file.bytes.length > MESSAGE_FILE_MAX_BYTES) throw new AttachmentError(413, `${file.name} גדול מ-10MB`);
  if (!file.bytes.length) throw new AttachmentError(400, `${file.name} ריק`);
  const key = `${folderOf(conversationId)}${randomUUID()}.${ext}`;
  if (memoryStore()) memory.set(key, { bytes: file.bytes, mime });
  else await s3().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET_NAME!, Key: key, Body: file.bytes, ContentType: mime, ContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}` }));
  return { key, name: file.name.slice(0, 200), size: file.bytes.length, mime };
}

/** A URL the browser can open for a few minutes. The caller has already checked the person may see this thread. */
export async function signedMessageFileUrl(conversationId: string, key: string): Promise<string | null> {
  if (!key.startsWith(folderOf(conversationId))) return null; // a key from another thread is never served
  if (memoryStore()) {
    const m = memory.get(key);
    return m ? `data:${m.mime};base64,${m.bytes.toString("base64")}` : null;
  }
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: process.env.S3_BUCKET_NAME!, Key: key }), { expiresIn: SIGNED_URL_TTL_SEC });
}

/** Parse the files of a multipart message, applying the per-message limits before any upload. */
export async function filesFromForm(form: FormData): Promise<{ name: string; size: number; bytes: Buffer }[]> {
  const files = form.getAll("files").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
  if (files.length > MESSAGE_FILES_PER_MESSAGE) throw new AttachmentError(400, `עד ${MESSAGE_FILES_PER_MESSAGE} קבצים בהודעה`);
  const out = [];
  for (const f of files) {
    if (!isAllowedFile(f.name)) throw new AttachmentError(415, `סוג קובץ לא נתמך: ${f.name}`);
    if (f.size > MESSAGE_FILE_MAX_BYTES) throw new AttachmentError(413, `${f.name} גדול מ-10MB`);
    out.push({ name: f.name, size: f.size, bytes: Buffer.from(await f.arrayBuffer()) });
  }
  return out;
}
