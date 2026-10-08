// eslint-config-next 16 ships native flat configs; no FlatCompat needed
// (the compat shim crashed on a circular plugin reference under ESLint 9).
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "out/**", "coverage/**", "next-env.d.ts"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // Pre-existing code leans on `any` (Mongoose lean() docs, ATS payloads).
      // Surface it, don't block CI on it; tighten per-module over time.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // Tooling configs are CommonJS by convention.
    files: ["*.config.js", "*.config.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // Test fixtures model third-party payloads loosely by design.
    files: ["tests/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
];

export default eslintConfig;
