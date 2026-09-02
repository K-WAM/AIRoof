// Per-IP request budget for the routes reachable without an authenticated
// session (T-063). In-memory, per-serverless-instance only — a cold start
// resets every counter. That makes this defense-in-depth against floods/
// brute force, not a precise or distributed guarantee; a determined attacker
// spread across many instances/IPs isn't stopped by this alone. Firestore-
// backed cross-instance limiting is deliberately out of scope (see
// MASTER_PLAN.md's T-063 — no new paid dependency, no guess-tuned budget).

import { NextRequest, NextResponse } from "next/server";

export interface RateLimitConfig {
  /** Rolling window size. */
  windowMs: number;
  /** Requests allowed per key within the window. */
  max: number;
  /** Distinguishes counters between routes sharing this module's map. */
  keyPrefix: string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Opportunistic cleanup so a long-lived warm instance doesn't grow the map
// forever under many distinct IPs. Cheap: only sweeps when the map is large
// enough to matter, and only entries that have already expired.
const SWEEP_THRESHOLD = 5000;
function sweepExpired(now: number): void {
  if (buckets.size < SWEEP_THRESHOLD) return;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

function clientIp(request: NextRequest): string {
  // Vercel sets x-forwarded-for on every request; the first entry is the
  // original client. x-real-ip is a fallback for other environments/tests.
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Returns a 429 NextResponse if `request`'s IP has exceeded `config.max`
 * requests within `config.windowMs`, or `null` if the request should proceed
 * — same "guard returns a response to short-circuit, or null to continue"
 * shape as `requireCronAuth`.
 */
export function checkRateLimit(request: NextRequest, config: RateLimitConfig): NextResponse | null {
  const now = Date.now();
  sweepExpired(now);

  const key = `${config.keyPrefix}:${clientIp(request)}`;
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + config.windowMs });
    return null;
  }

  bucket.count += 1;
  if (bucket.count <= config.max) return null;

  const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return NextResponse.json(
    { error: "Too many requests" },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}

// Exported only for tests — lets a test suite start each case from a clean
// slate instead of depending on run order / accumulated state.
export function _resetRateLimitState(): void {
  buckets.clear();
}
