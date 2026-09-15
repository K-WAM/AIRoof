// Short-TTL in-process cache for businessUsers/{uid} point reads. Every
// authenticated API request calls verifyAuthAndRole, which used to run a
// 3-clause composite Firestore query every single time; this memo turns
// repeat calls within a warm lambda instance into a Map lookup.
//
// Per-instance only (not shared across Vercel function instances), so a
// demotion or deactivation can be served stale for up to TTL_MS on other
// instances — acceptable because AuthContext's own client-side profile cache
// already tolerates up to an hour of staleness. The one case that must never
// be stale is an ownership change (the last-owner guard depends on an
// accurate count), so callers bypass this cache whenever the allowed-roles
// check includes "owner".
import type { TeamMemberDoc } from "@/lib/team/invite";

const TTL_MS = 30_000;
const MAX_ENTRIES = 500;

interface CacheEntry {
  member: TeamMemberDoc | null;
  exp: number;
}

const cache = new Map<string, CacheEntry>();

export function getCachedMember(uid: string): TeamMemberDoc | null | undefined {
  const entry = cache.get(uid);
  if (!entry) return undefined;
  if (entry.exp <= Date.now()) {
    cache.delete(uid);
    return undefined;
  }
  return entry.member;
}

export function setCachedMember(uid: string, member: TeamMemberDoc | null): void {
  // FIFO eviction: an unbounded Map in a long-lived warm lambda is a slow leak.
  if (cache.size >= MAX_ENTRIES && !cache.has(uid)) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(uid, { member, exp: Date.now() + TTL_MS });
}

/** Call after any write to businessUsers/{uid} so the next read is fresh. */
export function invalidateCachedMember(uid: string): void {
  cache.delete(uid);
}
