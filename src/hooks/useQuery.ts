"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { fetchQuery, getCached, isStale, subscribe, type QueryOpts } from "@/lib/data/store";

export interface UseQueryResult<T> {
  data: T | undefined;
  error: Error | undefined;
  /** True only on a genuinely cold cache — never true while stale data is already on screen. */
  loading: boolean;
  /** True while a background revalidation is in flight and stale data is still shown. */
  revalidating: boolean;
  refetch: () => void;
}

/**
 * React binding for src/lib/data/store.ts. Always paints synchronously from
 * whatever's cached (memory, then sessionStorage when `persist` is set)
 * before any network call — `loading` only ever reflects a truly cold key,
 * so a page revisited in the same tab never shows a skeleton again.
 *
 * Pass `key: null` to skip fetching entirely (e.g. while a required id isn't
 * known yet).
 */
export function useQuery<T>(key: string | null, url: string, opts?: QueryOpts): UseQueryResult<T> {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const subscribeFn = useCallback(
    (cb: () => void) => (key ? subscribe(key, cb) : () => {}),
    [key]
  );
  const getSnapshot = useCallback(() => (key ? getCached<T>(key, optsRef.current) : undefined), [key]);
  const entry = useSyncExternalStore(subscribeFn, getSnapshot, getSnapshot);

  const [revalidating, setRevalidating] = useState(false);

  const run = useCallback(() => {
    if (!key) return;
    setRevalidating(true);
    fetchQuery<T>(key, url, optsRef.current)
      .catch(() => {})
      .finally(() => setRevalidating(false));
  }, [key, url]);

  useEffect(() => {
    if (!key) return;
    const cached = getCached<T>(key, optsRef.current);
    if (!cached || isStale(cached, optsRef.current?.ttlMs)) run();
  }, [key, run]);

  return {
    data: entry?.data,
    error: entry?.error,
    loading: !key ? false : entry?.data === undefined && entry?.error === undefined,
    revalidating,
    refetch: run,
  };
}
