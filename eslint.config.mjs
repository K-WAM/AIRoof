import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

// `next lint` is deprecated in Next 15 (removed in 16), so lint runs through the
// ESLint CLI instead. See the "lint" script in package.json.
const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Pre-existing `any`s in the older API routes (webhook/tools/cron payloads).
      // Kept visible as warnings rather than errors so lint is usable as a gate
      // today; tighten these to `error` once the payload types are filled in.
      "@typescript-eslint/no-explicit-any": "warn",
      // firebase/firestore is a ~281KB client chunk. The last client-side
      // Firestore call sites were replaced by server API routes in Phase 1 of
      // the speed/foundation work (see src/lib/firebase/client.ts's header
      // comment) specifically to drop it from every authenticated page —
      // this rule is what keeps it from creeping back in. Admin-SDK code
      // under src/lib/firebase/admin.ts (a different package, firebase-admin)
      // is unaffected.
      "no-restricted-imports": ["error", { paths: [{
        name: "firebase/firestore",
        message: "Client Firestore reads/writes were removed to keep @firebase/firestore out of the browser bundle. Add a server API route instead (see /api/company/bootstrap for the pattern).",
      }] }],
    },
  },
  {
    // The one place the client Firestore SDK type is still referenced, for
    // anyone who genuinely needs to reintroduce a scoped exception later.
    files: ["src/lib/firebase/client.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "graphify-out/**",
      "Marketing Tools/**",
      // Other tools (e.g. Kilo) park detached git worktrees inside the repo; they are copies of this app, not source.
      ".kilo/**",
      // Operational Node scripts (seed/provision/pitch-deck), not app code — they
      // are legitimately CommonJS/console-driven and shouldn't fail an app lint.
      "scripts/**",
    ],
  },
];

export default config;
