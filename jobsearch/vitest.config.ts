import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Tests never touch styles; stop Vite from loading the Tailwind PostCSS config.
  css: { postcss: { plugins: [] } },
  resolve: {
    // Mirror tsconfig's "@/*" -> "./src/*" so app modules import unchanged.
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The 50k-document scale suite is excluded by the default `test` script
    // (CLI --exclude) and run on demand via `npm run test:scale`.
    exclude: ["node_modules/**"],
    // Integration suites boot an in-memory MongoDB (first run downloads it).
    testTimeout: 60_000,
    hookTimeout: 180_000,
    // Each file gets its own process: isolated Mongoose model cache + DB.
    pool: "forks",
    env: {
      // Never let a test reach real services.
      OPENAI_API_KEY: "test-key-not-used",
      CRON_SECRET: "test-cron-secret",
      JWT_SECRET: "test-jwt-secret-at-least-32-characters-long",
      // The Applier is gated on an apply server in prod; the suites stub it.
      FEATURE_AUTO_APPLY: "1",
    },
  },
});
