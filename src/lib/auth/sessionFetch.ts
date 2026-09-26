// Keeps the __session cookie honest (owner's "Invalid session" on Generate Invoice, 2026-09-25).
//
// __session holds a Firebase ID token, which lives one hour. Two things went wrong:
//  1. The cookie was always written with max-age=3600, even when it held an already-cached token issued 40 minutes
//     earlier — so the browser kept sending a token the server could no longer verify.
//  2. Firebase only refreshes a token proactively when another Firebase SDK asks it to, and this app loads none on the
//     client, so nothing refreshed it. Reads kept working (they fall back to the field-access cookie); the invoice POST,
//     which needs a real session, got a 401 "Invalid session".
// AuthProvider now writes the cookie with the token's REAL remaining life and refreshes it before it expires. The fetch
// wrapper below is the backstop for the gap a sleeping laptop leaves: a same-origin /api/ call that comes back 401
// refreshes the token once and replays the request once.

const SESSION_ERRORS = new Set(["Invalid session", "Unauthenticated"]);
/** A failing server (e.g. Admin auth not configured) must not turn every 401 into a refresh storm. */
const REFRESH_COOLDOWN_MS = 60_000;

export function writeSessionCookie(token: string, expiresAtMs: number, now = Date.now()): void {
  const maxAge = Math.max(0, Math.min(3600, Math.floor((expiresAtMs - now) / 1000) - 30));
  const secureFlag = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `__session=${token}; path=/; max-age=${maxAge}; SameSite=Lax${secureFlag}`;
}

function requestUrl(input: RequestInfo | URL): URL | null {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return new URL(raw, location.origin);
  } catch {
    return null;
  }
}

/** Only bodies we can send twice. A Request object's body is consumed by the first send, and so is a stream. */
function isReplayable(input: RequestInfo | URL, init?: RequestInit): boolean {
  if (typeof Request !== "undefined" && input instanceof Request) {
    return (input.method === "GET" || input.method === "HEAD") && init?.body == null;
  }
  const body = init?.body;
  return body == null || typeof body === "string" || body instanceof URLSearchParams
    || (typeof FormData !== "undefined" && body instanceof FormData)
    || (typeof Blob !== "undefined" && body instanceof Blob)
    || body instanceof ArrayBuffer || ArrayBuffer.isView(body);
}

type SessionWindow = Window & { __sessionRetry?: { users: number; restore: () => void } };

/** A token's expiry as epoch ms, or a conservative 55 minutes from now when it can't be read — never NaN, which would
 *  turn a "refresh before expiry" timer into an immediate, endless refresh loop. */
export function safeExpiry(expirationTime: string, now = Date.now()): number {
  const parsed = Date.parse(expirationTime);
  return Number.isFinite(parsed) ? parsed : now + 55 * 60_000;
}

/**
 * Wrap window.fetch once (reference-counted, so every mounted AuthProvider shares one wrapper). `refresh` must force a
 * new ID token, write the cookie, and resolve to the token (or null when nobody is signed in). Returns an uninstall
 * function; the original fetch comes back when the last user uninstalls.
 */
export function installSessionRetry(refresh: () => Promise<string | null>): () => void {
  if (typeof window === "undefined") return () => {};
  const w = window as SessionWindow;
  let released = false;
  const release = () => {
    if (released || !w.__sessionRetry) return;
    released = true;
    w.__sessionRetry.users -= 1;
    if (w.__sessionRetry.users <= 0) { w.__sessionRetry.restore(); delete w.__sessionRetry; }
  };
  if (w.__sessionRetry) { w.__sessionRetry.users += 1; return release; }

  const previous = window.fetch;
  const original = previous.bind(window);
  let inflight: Promise<string | null> | null = null;
  let lastRefreshAt = 0;

  const refreshOnce = (): Promise<string | null> => {
    if (inflight) return inflight;
    if (Date.now() - lastRefreshAt < REFRESH_COOLDOWN_MS) return Promise.resolve(null);
    lastRefreshAt = Date.now();
    inflight = refresh().catch(() => null).finally(() => { inflight = null; });
    return inflight;
  };

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await original(input, init);
    if (res.status !== 401) return res;
    const url = requestUrl(input);
    if (!url || url.origin !== location.origin || !url.pathname.startsWith("/api/") || !isReplayable(input, init)) return res;
    const body = await res.clone().json().catch(() => null) as { error?: unknown } | null;
    if (!body || typeof body.error !== "string" || !SESSION_ERRORS.has(body.error)) return res;
    const token = await refreshOnce();
    return token ? original(input, init) : res;
  };

  w.__sessionRetry = { users: 1, restore: () => { window.fetch = previous; } };
  return release;
}
