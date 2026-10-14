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
  /**
   * Auto-apply through the Puppeteer server (labelled beta in the UI).
   * Default: on only when PUPPETEER_SERVER_URL is set — there is nothing to
   * apply with otherwise. FEATURE_AUTO_APPLY="1"/"0" overrides either way.
   */
  get autoApply() {
    const explicit = process.env.FEATURE_AUTO_APPLY;
    if (explicit === "1") return true;
    if (explicit === "0") return false;
    return !!process.env.PUPPETEER_SERVER_URL;
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
