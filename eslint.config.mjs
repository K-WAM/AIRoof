import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

// `next lint` is deprecated in Next 15 (removed in 16), so lint runs through the
// ESLint CLI instead. See the "lint" script in package.json.
export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Pre-existing `any`s in the older API routes (webhook/tools/cron payloads).
      // Kept visible as warnings rather than errors so lint is usable as a gate
      // today; tighten these to `error` once the payload types are filled in.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "graphify-out/**",
      "Marketing Tools/**",
      // Operational Node scripts (seed/provision/pitch-deck), not app code — they
      // are legitimately CommonJS/console-driven and shouldn't fail an app lint.
      "scripts/**",
    ],
  },
];
