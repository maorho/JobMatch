import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure the PDF font files are traced into the serverless bundle (they are
  // read via fs at runtime, not imported, so Next won't include them otherwise).
  outputFileTracingIncludes: {
    "/api/chat/download-resume": ["./src/app/lib/fonts/**"],
  },
};

export default nextConfig;
