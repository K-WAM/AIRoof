// Framework-agnostic core of the client data-cache layer. src/hooks/useQuery.ts
// is the React binding; this module holds the actual cache, single-flight
// in-flight map, tag→key index, and sessionStorage persistence so multiple
// hook instances (and non-React callers like prefetch-on-hover) share one
// source of truth per key.
//
// Why this exists instead of adding SWR/react-query: this app already has a
// working in-house invalidation bus for the same problem
// (src/lib/events/quickAdd.ts's `useQuickAddRefresh`), plus two ad hoc
// sessionStorage read-caches (profileCache.ts, and the old
// useBusinessModules/useBusinessTimezone). Generalizing those two patterns
// into one is less new concept surface than running a third library
// alongside them. See MASTER_PLAN.md / the Phase 1 plan for the full
// rationale.
import type { Tag } from "./tags";

export interface QueryOpts {
  tags?: Tag[];
  /** Mirror successful responses to sessionStorage so a remount (e.g. back-nav) paints at 0ms. */
  persist?: boolean;
  /** How long a cached entry is considered fresh before a mount triggers a background revalidate. Default 30s. */
  ttlMs?: number;
  fetchInit?: RequestInit;
}

interface CacheEntry<T = unknown> {
  data?: T;
  error?: Error;
  at: number;
  tags: Tag[];
}

const PERSIST_PREFIX = "lx:q:";
const MAX_PERSIST_BYTES = 256_000;
const DEFAULT_TTL_MS = 30_000;

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();
const subscribers = new Map<string, Set<() => void>>();
const tagIndex = new Map<Tag, Set<string>>();

function notify(key: string) {
  subscribers.get(key)?.forEach((cb) => cb());
}

function trackTags(key: string, tags: Tag[] | undefined) {
  if (!tags?.length) return;
  for (const tag of tags) {
    let set = tagIndex.get(tag);
    if (!set) { set = new Set(); tagIndex.set(tag, set); }
    set.add(key);
  }
}

function readPersisted<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = sessionStorage.getItem(PERSIST_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
}

function writePersisted<T>(key: string, entry: CacheEntry<T>) {
  try {
    const serialized = JSON.stringify(entry);
    if (serialized.length > MAX_PERSIST_BYTES) return; // too big to be worth mirroring
    sessionStorage.setItem(PERSIST_PREFIX + key, serialized);
  } catch {
    /* sessionStorage unavailable or full — in-memory cache still works */
  }
}

/** Synchronous read of whatever's cached right now — memory first, then sessionStorage. */
export function getCached<T>(key: string, opts?: QueryOpts): CacheEntry<T> | undefined {
  const mem = cache.get(key) as CacheEntry<T> | undefined;
  if (mem) return mem;
  if (opts?.persist) {
    const persisted = readPersisted<T>(key);
    if (persisted) {
      cache.set(key, persisted);
      trackTags(key, opts.tags);
      return persisted;
    }
  }
  return undefined;
}

export function isStale(entry: CacheEntry | undefined, ttlMs = DEFAULT_TTL_MS): boolean {
  if (!entry) return true;
  return Date.now() - entry.at > ttlMs;
}

/** Single-flight network fetch for `key`. Concurrent callers share one in-flight promise. */
export function fetchQuery<T>(key: string, url: string, opts: QueryOpts = {}): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fetch(url, { credentials: "same-origin", ...opts.fetchInit })
    .then(async (res) => {
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return (await res.json()) as T;
    })
    .then((data) => {
      const entry: CacheEntry<T> = { data, at: Date.now(), tags: opts.tags ?? [] };
      cache.set(key, entry);
      trackTags(key, opts.tags);
      if (opts.persist) writePersisted(key, entry);
      notify(key);
      return data;
    })
    .catch((error: Error) => {
      const prior = cache.get(key);
      const entry: CacheEntry<T> = { data: prior?.data as T | undefined, error, at: Date.now(), tags: opts.tags ?? [] };
      cache.set(key, entry);
      notify(key);
      throw error;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

/** Fire-and-forget warm of the cache — used for prefetch-on-hover/pointerdown. */
export function prefetch(key: string, url: string, opts?: QueryOpts): void {
  const cached = getCached(key, opts);
  if (cached && !isStale(cached, opts?.ttlMs)) return;
  fetchQuery(key, url, opts).catch(() => {});
}

/** Optimistic local update — patches the cached value immediately without a network round trip. */
export function patch<T>(key: string, fn: (prev: T | undefined) => T): void {
  const prior = cache.get(key) as CacheEntry<T> | undefined;
  const entry: CacheEntry<T> = { data: fn(prior?.data), at: prior?.at ?? Date.now(), tags: prior?.tags ?? [] };
  cache.set(key, entry);
  notify(key);
}

/**
 * Mark every key tagged with any of `tags` as needing a refetch. This clears
 * the timestamp (so the next mount/subscriber sees it as stale) and notifies
 * live subscribers, whose useQuery instances re-run fetchQuery themselves —
 * this module has no React dependency and doesn't refetch on their behalf.
 */
export function invalidate(...tags: Tag[]): void {
  const keys = new Set<string>();
  for (const tag of tags) {
    tagIndex.get(tag)?.forEach((k) => keys.add(k));
  }
  for (const key of keys) {
    const entry = cache.get(key);
    if (entry) cache.set(key, { ...entry, at: 0 });
    notify(key);
  }
}

export function subscribe(key: string, cb: () => void): () => void {
  let set = subscribers.get(key);
  if (!set) { set = new Set(); subscribers.set(key, set); }
  set.add(cb);
  return () => {
    set!.delete(cb);
    if (set!.size === 0) subscribers.delete(key);
  };
}

export const __internal = { cache, tagIndex, DEFAULT_TTL_MS };
