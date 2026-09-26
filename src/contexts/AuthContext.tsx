"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { clearCachedProfile, readCachedProfile, writeCachedProfile } from "@/lib/auth/profileCache";
import { installSessionRetry, safeExpiry, writeSessionCookie } from "@/lib/auth/sessionFetch";

/** Refresh the ID token this long before it expires. */
const REFRESH_AHEAD_MS = 5 * 60_000;

interface AuthUser {
  uid: string;
  email: string | null;
  businessId?: string;
  businessName?: string;
  role?: "superadmin" | "owner" | "staff" | "viewer";
  superadmin?: boolean;
  /** Phase 12/Phase 7 — descriptive job title + a friendly name for punch/labor
   * attribution; neither carries any permission (see src/types/team.ts). */
  trade?: string;
  displayName?: string;
  crewId?: string;
  /** Set on the shared read-only identity /api/demo/sandbox-token mints for a
   * prospect exploring /try/[vertical] — never true for a real teammate, even
   * one with role "viewer". Drives the sandbox banner in company/layout.tsx. */
  isSandboxVisitor?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  idToken: string | null;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  idToken: null,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [idToken, setIdToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;
    let uninstallRetry: (() => void) | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let tokenExpiresAt = 0;
    let onWake: (() => void) | undefined;

    (async () => {
      const [auth, { onIdTokenChanged }] = await Promise.all([
        getFirebaseAuth(),
        import("firebase/auth"),
      ]);
      if (cancelled) return;
      if (!auth) {
        setLoading(false);
        return;
      }

      // Force a fresh token and write the cookie right away (don't wait for onIdTokenChanged, which re-runs the
      // profile fetch) — the retry wrapper replays its request the moment this resolves.
      const forceRefresh = async (): Promise<string | null> => {
        const current = auth.currentUser;
        if (!current) return null;
        const result = await current.getIdTokenResult(true);
        tokenExpiresAt = safeExpiry(result.expirationTime);
        writeSessionCookie(result.token, tokenExpiresAt);
        return result.token;
      };
      uninstallRetry = installSessionRetry(forceRefresh);
      // Background tabs throttle timers and a sleeping laptop skips them, so also check when the tab comes back.
      onWake = () => {
        if (document.visibilityState !== "visible" || !auth.currentUser) return;
        if (tokenExpiresAt - Date.now() < REFRESH_AHEAD_MS) void forceRefresh().catch(() => {});
      };
      document.addEventListener("visibilitychange", onWake);
      window.addEventListener("focus", onWake);

      // onIdTokenChanged fires on sign-in, sign-out, and every token refresh (the timer below and forceRefresh cause
      // those — Firebase does not refresh on its own here). __session holds the ID token so API routes can verify it.
      unsub = onIdTokenChanged(auth, async (firebaseUser: User | null) => {
        clearTimeout(refreshTimer);
        if (!firebaseUser) {
          tokenExpiresAt = 0;
          setUser(null);
          setIdToken(null);
          setLoading(false);
          clearCachedProfile();
          document.cookie = "__session=; path=/; max-age=0; SameSite=Lax";
          return;
        }

        // Serve a cached profile for this uid immediately, if one exists, so a
        // full page load or a layout remount (company <-> admin) never blocks
        // its first paint on the token + Firestore round trip below — this is
        // a read-path UX cache only (see profileCache.ts), so it's always safe
        // to render optimistically while the real values are re-verified.
        const cached = readCachedProfile<AuthUser>(firebaseUser.uid);
        if (cached) {
          setUser(cached);
          setLoading(false);
        }

        try {
          // The cached token may already be most of the way through its hour: the cookie gets the token's REAL
          // remaining life, and a refresh is scheduled ahead of its expiry (immediately if it is already close).
          const result = await firebaseUser.getIdTokenResult();
          const token = result.token;
          tokenExpiresAt = safeExpiry(result.expirationTime);
          setIdToken(token);
          writeSessionCookie(token, tokenExpiresAt);
          refreshTimer = setTimeout(() => {
            void firebaseUser.getIdToken(true).catch(() => {});
          }, Math.max(0, tokenExpiresAt - Date.now() - REFRESH_AHEAD_MS));

          let profile: AuthUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
          };

          // Server-verified equivalent of the old client Firestore read (see
          // /api/auth/profile) — the cookie set just above authenticates it,
          // and this is the last call site that pulled @firebase/firestore
          // into the client bundle on every authenticated page.
          const res = await fetch("/api/auth/profile", { credentials: "same-origin" }).catch(() => null);
          if (res?.ok) {
            const data = (await res.json().catch(() => null))?.profile;
            if (data) profile = { ...profile, ...data };
          }

          // onIdTokenChanged also fires on Firebase's own hourly token refresh,
          // so this re-fetch (and the cache it refreshes) naturally picks up a
          // role change within one cycle instead of sticking on a stale value.
          setUser(profile);
          writeCachedProfile(profile);
        } catch (err) {
          console.error("Auth profile load failed:", err);
          if (!cached) setUser({ uid: firebaseUser.uid, email: firebaseUser.email });
        } finally {
          setLoading(false);
        }
      });
    })();

    return () => {
      cancelled = true;
      unsub?.();
      uninstallRetry?.();
      clearTimeout(refreshTimer);
      if (onWake) {
        document.removeEventListener("visibilitychange", onWake);
        window.removeEventListener("focus", onWake);
      }
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, idToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
