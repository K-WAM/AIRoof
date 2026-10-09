"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useBusinessId } from "@/hooks/useBusinessId";
import type { CompanyBootstrap } from "@/types/bootstrap";

interface BootstrapContextValue {
  data: CompanyBootstrap | null;
  /** True once a fetch (cache or network) has resolved at least once. */
  ready: boolean;
  refresh: () => void;
}

const BootstrapContext = createContext<BootstrapContextValue>({ data: null, ready: false, refresh: () => {} });

const CACHE_VERSION = 3; // bump to invalidate all cached entries on shape changes
const SOFT_TTL_MS = 10 * 60 * 1000;

interface CacheEnvelope {
  v: number;
  at: number;
  data: CompanyBootstrap;
}

function cacheKey(businessId: string) {
  return `lx:bootstrap:${businessId}`;
}

function readCache(businessId: string): CompanyBootstrap | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(businessId));
    if (!raw) return null;
    const env = JSON.parse(raw) as CacheEnvelope;
    if (env.v !== CACHE_VERSION) return null;
    return env.data;
  } catch {
    return null;
  }
}

function writeCache(businessId: string, data: CompanyBootstrap) {
  try {
    const env: CacheEnvelope = { v: CACHE_VERSION, at: Date.now(), data };
    sessionStorage.setItem(cacheKey(businessId), JSON.stringify(env));
  } catch {
    /* ignore — sessionStorage unavailable or full */
  }
}

function isStale(businessId: string): boolean {
  try {
    const raw = sessionStorage.getItem(cacheKey(businessId));
    if (!raw) return true;
    const env = JSON.parse(raw) as CacheEnvelope;
    return env.v !== CACHE_VERSION || Date.now() - env.at > SOFT_TTL_MS;
  } catch {
    return true;
  }
}

/**
 * Mounts once in the company shell. Replaces the two independent
 * client-Firestore reads useBusinessModules/useBusinessTimezone used to make
 * — both hooks below become thin selectors over this context so no call
 * site elsewhere in the app changes. Paints instantly from a sessionStorage
 * cache (same key pattern the two hooks used to each keep separately) and
 * revalidates in the background when the cache has gone soft-stale.
 */
export function BootstrapProvider({ children }: { children: React.ReactNode }) {
  const businessId = useBusinessId();
  const [data, setData] = useState<CompanyBootstrap | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback((bid: string, background: boolean) => {
    fetch(`/api/company/bootstrap?businessId=${encodeURIComponent(bid)}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<CompanyBootstrap>) : Promise.reject()))
      .then((fresh) => {
        setData(fresh);
        writeCache(bid, fresh);
      })
      .catch(() => {
        /* keep whatever we already painted (cache or nothing) */
      })
      .finally(() => {
        if (!background) setReady(true);
      });
  }, []);

  // Wait for the signed-in user: before the profile loads, useBusinessId() falls back to the demo tenant, and that
  // request (a 401) used to mark the shell "ready" with nothing loaded — every module then looked switched on, so
  // screens briefly asked for data this client's products don't include.
  const { user } = useAuth();
  // …and for the user's own business id (or a superadmin, who previews by ?preview=): the profile can land a moment
  // after sign-in, and until then useBusinessId() still answers the demo fallback.
  const signedIn = !!user && (!!user.businessId || !!user.superadmin);
  useEffect(() => {
    if (!businessId || !signedIn) return;
    setReady(false);
    const cached = readCache(businessId);
    if (cached) {
      setData(cached);
      setReady(true);
      if (isStale(businessId)) load(businessId, true);
      return;
    }
    load(businessId, false);
  }, [businessId, signedIn, load]);

  const refresh = useCallback(() => {
    if (businessId) load(businessId, true);
  }, [businessId, load]);

  return (
    <BootstrapContext.Provider value={{ data, ready, refresh }}>
      {children}
    </BootstrapContext.Provider>
  );
}

export function useBootstrap(): BootstrapContextValue {
  return useContext(BootstrapContext);
}
