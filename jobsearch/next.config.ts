import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure the PDF font files are traced into the serverless bundle (they are
  // read via fs at runtime, not imported, so Next won't include them otherwise).
  outputFileTracingIncludes: {
    "/api/chat/download-resume": ["./src/app/lib/fonts/**"],
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
