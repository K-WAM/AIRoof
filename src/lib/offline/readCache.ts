import { offlineStore } from "./db";
import { identityRevision, offlineIdentity, type OfflineIdentity } from "./identity";

interface CachedRead { id: string; uid: string; savedAt: number; body: string; status: number; headers: [string, string][] }
let savedAt: number | null = null;
let disconnected = false;
export function offlineReadState() { return { disconnected, savedAt }; }
export function reportConnection(offline: boolean, saved?: number) {
  disconnected = offline;
  if (saved !== undefined) savedAt = savedAt === null ? saved : Math.min(savedAt, saved);
  if (!offline) savedAt = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event("luxor-offline"));
}

/** Exact allowlist: never admin, photos, notes, documents or arbitrary job subroutes. */
export function cacheableRead(url: URL, user: OfflineIdentity | null): boolean {
  if (!user?.businessId || user.preview || user.uid.startsWith("field:") || url.origin !== location.origin) return false;
  if (new URLSearchParams(location.search).has("preview") || url.searchParams.has("preview")) return false;
  const bid = url.searchParams.get("businessId");
  if (bid && bid !== user.businessId) return false;
  if (/^\/api\/businesses\/[^/]+\/appointments$/.test(url.pathname)) {
    try { return decodeURIComponent(url.pathname.split("/")[3]) === user.businessId; } catch { return false; }
  }
  const job = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
  let jobDetail = false;
  if (job) {
    try { jobDetail = !["export", "from-request"].includes(decodeURIComponent(job[1])); } catch { return false; }
  }
  return ["/api/company/bootstrap", "/api/company/crews", "/api/company/time-blocks", "/api/jobs"].includes(url.pathname)
    || jobDetail;
}

export async function clearReadCache(uid: string) {
  const entries = await offlineStore<CachedRead[]>("reads", "readonly", s => s.getAll());
  for (const entry of entries.filter(e => e.uid === uid)) await offlineStore("reads", "readwrite", s => s.delete(entry.id));
  reportConnection(false);
}

export async function fetchWithOfflineCache(input: RequestInfo | URL, init: RequestInit | undefined, send: typeof fetch): Promise<Response> {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(raw, location.origin);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const signal = init?.signal ?? (input instanceof Request ? input.signal : null);
  const user = offlineIdentity();
  const revision = identityRevision();
  const eligible = method === "GET" && cacheableRead(url, user);
  const id = user ? JSON.stringify([user.uid, url.href]) : "";
  const localApi = url.origin === location.origin && url.pathname.startsWith("/api/");
  const write = localApi && !["GET", "HEAD", "OPTIONS"].includes(method);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const outbox = headers.has("x-offline-owner");
  const paused = (uncertain = false) => Response.json({ error: uncertain
    ? "Connection lost — couldn't confirm your change. Check it when you have signal before trying again."
    : "Offline — your change was not saved. Try again when you have signal." }, { status: 503 });
  if (write && !outbox && (navigator.onLine === false || disconnected)) return paused();
  try {
    const response = await send(input, init);
    if (eligible && response.ok && response.headers.get("content-type")?.includes("application/json") && !response.redirected && identityRevision() === revision) {
      const clone = response.clone();
      try {
        const body = await clone.text();
        if (identityRevision() === revision) {
          // Store only representation headers, never a cookie, token or hop-by-hop header.
          const headers: [string, string][] = ["content-type", "cache-control"].flatMap(key => response.headers.has(key) ? [[key, response.headers.get(key)!] as [string, string]] : []);
          await offlineStore("reads", "readwrite", s => s.put({ id, uid: user!.uid, savedAt: Date.now(), body, status: response.status, headers } satisfies CachedRead));
          if (identityRevision() !== revision) await offlineStore("reads", "readwrite", s => s.delete(id));
        }
      } catch { /* Best-effort read cache: a storage failure must not hide a successful live read. */ }
    }
    if (localApi && response.ok && !response.headers.has("x-luxor-offline")) reportConnection(false);
    return response;
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
    if (localApi) reportConnection(true);
    if (eligible && identityRevision() === revision) {
      const cached = await offlineStore<CachedRead | undefined>("reads", "readonly", s => s.get(id)).catch(() => undefined);
      if (cached && identityRevision() === revision) {
        const headers = new Headers(cached.headers);
        headers.set("x-luxor-offline", String(cached.savedAt));
        reportConnection(true, cached.savedAt);
        return new Response(cached.body, { status: cached.status, headers });
      }
    }
    if (write && !outbox) return paused(true);
    throw error;
  }
}
