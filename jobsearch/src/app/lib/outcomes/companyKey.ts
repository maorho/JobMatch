/** Normalised company slug shared by the outcome loop, the question bank and its public URLs (safe for client bundles). */
export const companyKey = (s: string) =>
  (s || "")
    .toLowerCase()
    .replace(/\.(com|io|ai|co|net|org|il|dev)\b/g, " ") // "Wix.com" and "Wix" are the same company
    .replace(/\b(ltd|inc|llc|corp|corporation|technologies|technology|labs|group|israel|בע"מ|בעמ)\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, "-");
