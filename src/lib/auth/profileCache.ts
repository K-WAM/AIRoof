// sessionStorage cache for the resolved auth profile (T-067). Every route
// under src/app is client-rendered and previously blocked its first paint on
// two sequential async steps inside AuthContext's onIdTokenChanged callback
// (firebaseUser.getIdToken() then a Firestore businessUsers read) — on every
// full load, and again on every top-level layout remount (company <-> admin).
// This lets AuthContext render a known-good profile immediately while it
// re-validates in the background, same sessionStorage-cache shape
// useBusinessModules() already uses for its own per-business read.
//
// Client-side UX cache only — never a security boundary. Every server API
// route independently re-verifies the real Firebase ID token from the
// __session cookie, so a stale cached profile here can only affect what the
// UI shows before the background refresh lands, never what the backend
// allows.

const STORAGE_KEY = "air_auth_profile_v1";

/**
 * Returns the cached profile if one exists and belongs to `uid`, or `null` on
 * a cache miss, a different signed-in user, unavailable storage, or corrupt
 * JSON — every failure mode is a miss, never a thrown error.
 */
export function readCachedProfile<T extends { uid: string }>(uid: string): T | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    if (!parsed || parsed.uid !== uid) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Best-effort write — caching is a UX nicety, never required to succeed. */
export function writeCachedProfile<T extends { uid: string }>(profile: T): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* storage unavailable/full — next load just falls back to a fresh fetch */
  }
}

/** Called on sign-out so the next sign-in (possibly a different user) never
 * sees a stale profile, even for the instant before the background refresh
 * resolves. */
export function clearCachedProfile(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
