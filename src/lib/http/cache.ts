import { NextResponse } from "next/server";

/**
 * Cache-Control tiers for API responses. Every route here is authenticated
 * by a cookie (__session or the field-access cookie) scoped to one tenant —
 * so **every tier must be `private`**. A shared/CDN cache (`public`,
 * `s-maxage`) would risk serving one tenant's response to another's request
 * on a shared edge cache; that is a cross-tenant data leak, not a bug to
 * tune later. Never widen these to `public` without re-reading this comment.
 */
export const CachePolicy = {
  /** Changes rarely (business config, library catalog, crew roster). */
  semiStatic: "private, max-age=30, stale-while-revalidate=300",
  /** Changes often; the client should always revalidate but a matching ETag saves the body. */
  volatile: "private, no-cache",
  /** Content-addressed or otherwise immutable once written (a photo blob keyed by photoId). */
  immutable: "private, max-age=3600",
  /** Every mutation, and anything under /api/field/** (never let a shared device cache a grant). */
  noStore: "no-store",
} as const;

export type CachePolicyName = keyof typeof CachePolicy;

/** JSON response with a Cache-Control header from one of the named tiers above. */
export function jsonWithCache<T>(data: T, policy: CachePolicyName, init?: ResponseInit): NextResponse {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", CachePolicy[policy]);
  return NextResponse.json(data, { ...init, headers });
}
