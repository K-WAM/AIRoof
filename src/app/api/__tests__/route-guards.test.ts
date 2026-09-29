import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// T-170 — route authorization inventory. Every exported HTTP handler under src/app/api must run one of the central guards
// (directly, or through a local helper that does), or its route must be listed in PUBLIC_ROUTES with the reason it is safe
// without one. A new route that forgets its guard fails CI here instead of shipping open. Hidden navigation is not access
// control: this is the check.

const API_ROOT = join(process.cwd(), "src", "app", "api");

const GUARDS = [
  "verifyAuthAndRole", // session + membership of the requested tenant (src/lib/auth/verifyRole.ts)
  "verifySuperadmin", // live superadmin custom claim
  "verifyOwnBusinessRole", // session; tenant taken from the caller's own membership
  "verifyFieldAccess", // staff session or a signed, job-scoped field grant
  "peekFieldSessionClaims", // field session cookie (read-only "which job am I on"; no data returned beyond ids)
  "consumeFieldExchangeToken", // one-time signed field QR grant
  "exchangeLegacyFieldKey", // legacy field key exchange (constant-time compare, audited)
  "verifyIdToken", // "who am I" (auth/profile) — answers only for the caller
  "requireCronAuth", // cron bearer secret
  "verifyVapiWebhook", // Vapi webhook secret + replay guard
  "verifyElevenLabsToolSecret", // ElevenLabs tool/initiation shared secret
  "verifyElevenLabsPostCallSignature", // ElevenLabs HMAC post-call signature
];

// Route path (relative to src/app/api, forward slashes) → why it is safe without a guard.
const PUBLIC_ROUTES: Record<string, string> = {
  "health/route.ts": "reports configured/not-configured booleans only; no tenant data",
  "calendar/feed/[token]/route.ts": "the unguessable token IS the credential: only its sha256 is stored, unknown/inactive → 404",
  "demo/sandbox-token/route.ts": "rate-limited; hard-coded demo tenant (must carry isDemo) and a read-only viewer identity",
};

const HANDLER = /^export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/m;

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : routeFiles(path);
    return name === "route.ts" ? [path] : [];
  });
}

/** Top-level function declarations → their bodies (up to the next top-level declaration). */
function functions(source: string): Map<string, string> {
  const starts = [...source.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm)];
  const map = new Map<string, string>();
  starts.forEach((match, index) => {
    const end = index + 1 < starts.length ? starts[index + 1].index : source.length;
    map.set(match[1], source.slice(match.index, end));
  });
  return map;
}

function unguardedHandlers(source: string): string[] {
  const fns = functions(source);
  const guardCall = new RegExp(`\\b(${GUARDS.join("|")})\\(`);
  const guarded = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, body] of fns) {
      if (guarded.has(name)) continue;
      const callsGuardedHelper = [...guarded].some((helper) => new RegExp(`\\b${helper}\\(`).test(body.slice(body.indexOf("{"))));
      if (guardCall.test(body) || callsGuardedHelper) {
        guarded.add(name);
        changed = true;
      }
    }
  }
  const handlers = [...fns.keys()].filter((name) => /^(GET|POST|PUT|PATCH|DELETE)$/.test(name));
  return handlers.filter((name) => !guarded.has(name));
}

describe("API route authorization inventory (T-170)", () => {
  const files = routeFiles(API_ROOT);
  const rel = (path: string) => relative(API_ROOT, path).split(sep).join("/");

  it("finds the API routes", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("uses only function-declaration handlers (so this inventory can see every one)", () => {
    const arrowHandlers = files.filter((file) => /^export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\b/m.test(readFileSync(file, "utf8")));
    expect(arrowHandlers.map(rel)).toEqual([]);
  });

  it("every handler runs a central guard, or its route is an explicitly justified public route", () => {
    const open: string[] = [];
    for (const file of files) {
      const path = rel(file);
      if (PUBLIC_ROUTES[path]) continue;
      const source = readFileSync(file, "utf8");
      if (!HANDLER.test(source)) continue;
      for (const handler of unguardedHandlers(source)) open.push(`${path} ${handler}`);
    }
    expect(open).toEqual([]);
  });

  it("the public-route list has no stale entries", () => {
    const existing = new Set(files.map(rel));
    expect(Object.keys(PUBLIC_ROUTES).filter((path) => !existing.has(path))).toEqual([]);
  });
});
