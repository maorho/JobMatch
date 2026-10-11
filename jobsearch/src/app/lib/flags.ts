/**
 * Feature flags for capabilities that exist but are not launch-ready. Server
 * code reads FEATURE_*; client components read the NEXT_PUBLIC_ twin (Next
 * inlines those at build time). Unset = the safe default listed here.
 * Read lazily (getters) so a flag flipped at runtime or in a test applies.
 */
export const FEATURES = {
  /** Phone interviews over Twilio: never tested live. Off until it is. */
  get phone() {
    return process.env.FEATURE_PHONE === "1";
  },
  /** Auto-apply through the Puppeteer server: on, but labelled beta in the UI. */
  get autoApply() {
    return process.env.FEATURE_AUTO_APPLY !== "0";
  },
  /** Personal MCP keys. */
  get mcp() {
    return process.env.FEATURE_MCP !== "0";
  },
};

export const featureSnapshot = () => ({ phone: FEATURES.phone, autoApply: FEATURES.autoApply, mcp: FEATURES.mcp });

export const PUBLIC_FEATURES = {
  phone: process.env.NEXT_PUBLIC_FEATURE_PHONE === "1",
  autoApply: process.env.NEXT_PUBLIC_FEATURE_AUTO_APPLY !== "0",
  mcp: process.env.NEXT_PUBLIC_FEATURE_MCP !== "0",
} as const;
