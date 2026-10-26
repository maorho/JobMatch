import { defineConfig } from "vitest/config";
import path from "path";
import fs from "fs";

// Real-model quality evals: `npm run eval`. Loads .env.local (OPENAI_API_KEY) itself;
// keeps NODE_ENV out of "test" so the production code paths (LLM calls) run.
const envFile = path.resolve(__dirname, ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i <= 0 || line.trim().startsWith("#")) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^"|"$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  css: { postcss: { plugins: [] } },
  test: {
    include: ["evals/**/*.eval.ts"],
    environment: "node",
    pool: "forks",
    testTimeout: 300_000,
    hookTimeout: 60_000,
  },
});
