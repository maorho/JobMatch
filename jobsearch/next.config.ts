import type { NextConfig } from "next";
import path from "node:path";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy, report-only for now so nothing breaks while the
 * violation reports tell us what the enforced policy must allow. Known needs:
 *  - company logos: icons.duckduckgo.com / www.google.com/s2 (lib/scout/logo.ts),
 *    plus logo URLs stored on jobs by the ATS adapters (arbitrary https hosts)
 *  - fonts: next/font self-hosts Outfit, so no googleapis/gstatic
 *  - voice interview: the browser talks to api.openai.com directly (WebRTC SDP
 *    exchange over https; the media itself is peer-to-peer, not CSP-governed)
 *  - Next's hydration scripts are inline, so an *enforced* script-src would need
 *    nonces; the production report-only policy below deliberately omits
 *    'unsafe-inline' to measure exactly that.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self'${isDev ? " 'unsafe-inline' 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://icons.duckduckgo.com https://www.google.com https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.openai.com wss://api.openai.com",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The voice interview (components/VoiceInterview.tsx) uses the microphone and
  // an optional camera self-view on our own origin; nothing uses geolocation.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
  { key: "Content-Security-Policy-Report-Only", value: csp },
];

// Font files read with fs at runtime (PDF rendering) — every route that can
// end up rendering a PDF needs them traced into its serverless bundle.
const FONT_GLOB = ["./src/app/lib/fonts/**"];

const nextConfig: NextConfig = {
  // The repo root once held a stray package.json; pin the workspace root so
  // Turbopack never infers it from a parent directory.
  turbopack: { root: path.join(__dirname) },
  // Native/ heavy server-only packages stay out of the bundler.
  serverExternalPackages: ["mongoose", "bcrypt", "puppeteer", "cheerio"],
  // Ensure the PDF font files are traced into the serverless bundle (they are
  // read via fs at runtime, not imported, so Next won't include them otherwise).
  outputFileTracingIncludes: {
    "/api/chat/download-resume": FONT_GLOB,
    "/api/agents/tick": FONT_GLOB,
    "/api/auto-apply": FONT_GLOB,
    "/api/mcp": FONT_GLOB,
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  // Friendly URLs for the (historically misspelled) articles route.
  async redirects() {
    return [
      { source: "/articles", destination: "/Articels", permanent: true },
      { source: "/articles/:slug", destination: "/Articels/:slug", permanent: true },
      { source: "/jobs", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
