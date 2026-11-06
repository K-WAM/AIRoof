import { offlineStore } from "./db";
import { fieldIdentity, identityRevision, offlineIdentity, type OfflineIdentity } from "./identity";

export interface OutboxItem {
  id: string; uid: string; url: string; businessId: string; jobId?: string; author: string;
  body: Record<string, unknown>; audio?: Blob; createdAt: number; attempts: number; nextAt: number;
  responseStatus?: number; kept?: boolean; state: "waiting" | "rejected" | "sent" | "confirmation"; error?: string; result?: Record<string, unknown>;
}
const changed = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event("luxor-outbox")); };
export const listOutbox = async (uid: string) => (await offlineStore<OutboxItem[]>("outbox", "readonly", s => s.getAll())).filter(i => i.uid === uid).sort((a,b) => a.createdAt - b.createdAt);
export async function deleteOutboxItem(uid: string, id: string) {
  const item = await offlineStore<OutboxItem | undefined>("outbox", "readonly", s => s.get(id));
  if (item?.uid === uid) await offlineStore("outbox", "readwrite", s => s.delete(id));
  changed();
}
export async function clearOutbox(uid: string) { for (const item of await listOutbox(uid)) await deleteOutboxItem(uid, item.id); }
async function save(item: OutboxItem) { await offlineStore("outbox", "readwrite", s => s.put(item)); changed(); }

export async function keepOutboxItem(uid: string, id: string) {
  await offlineStore("outbox", "readwrite", store => {
    const request = store.get(id);
    request.onsuccess = () => {
      const item = request.result as OutboxItem | undefined;
      if (item?.uid === uid && item.state === "rejected") store.put({ ...item, kept: true });
    };
    return request;
  });
  changed();
}

function acknowledged(url: string, data: Record<string, unknown>) {
  if (data.proposedCorrection) return true;
  if (url.endsWith("/field-audio")) return typeof data.success === "boolean";
  if (url.endsWith("/photos")) return data.ok === true && typeof data.photoId === "string";
  if (url.endsWith("/punch")) return data.ok === true && !!data.day;
  const update = data.update as { updateId?: unknown } | undefined;
  return data.corrected === true || typeof update?.updateId === "string";
}

/** Convert a proposal in one transaction. Double taps/reloads cannot create two confirmations. */
export async function confirmOutboxItem(uid: string, id: string) {
  await offlineStore("outbox", "readwrite", store => {
    const request = store.get(id);
    request.onsuccess = () => {
      const item = request.result as OutboxItem | undefined;
      if (!item || item.uid !== uid || item.state !== "confirmation") return;
      item.body = { businessId: item.businessId, submittedBy: item.author, confirmCorrection: item.result?.proposedCorrection, clientRequestId: `${item.id}-confirm`, clientCreatedAt: Date.now() };
      item.state = "waiting"; item.attempts = 0; item.nextAt = 0;
      delete item.result; delete item.error; delete item.audio;
      store.put(item);
    };
    return request;
  });
  changed();
}

export async function enqueueField(url: string, body: Record<string, unknown>, audio?: Blob, owner?: OfflineIdentity): Promise<OutboxItem> {
  const user = owner ?? await fieldIdentity();
  if (!user || user.preview || (user.businessId && user.businessId !== body.businessId)) throw new Error("Sign in to save on this phone. Your entry has not been sent.");
  const id = crypto.randomUUID();
  const item: OutboxItem = {
    id, uid: user.uid, url, businessId: String(body.businessId), jobId: typeof body.jobId === "string" ? body.jobId : url.match(/\/jobs\/([^/]+)/)?.[1],
    author: String(body.submittedBy ?? body.uploadedBy ?? body.workerName ?? ""),
    body: { ...body, clientRequestId: id, clientCreatedAt: Date.now() }, audio,
    createdAt: Date.now(), attempts: 0, nextAt: 0, state: "waiting",
  };
  try { await save(item); } catch { throw new Error("This phone could not save your entry. Keep it open and try again; nothing has been sent."); }
  return item;
}

let running: Promise<void> | null = null;
export function flushOutbox(owner?: OfflineIdentity, send: typeof fetch = fetch, now = Date.now()): Promise<void> {
  if (running) return running;
  running = (async () => {
    const user = owner ?? await fieldIdentity();
    if (!user || user.preview || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
    const revision = identityRevision();
    for (const item of await listOutbox(user.uid)) {
      if (item.state !== "waiting") continue;
      if (item.nextAt > now) break;
      if (identityRevision() !== revision) break;
      if (!owner && (await fieldIdentity())?.uid !== user.uid) break;
      // Persist backoff BEFORE sending. A closed tab never erases an unacknowledged upload.
      item.attempts++;
      item.nextAt = now + Math.min(300_000, 1000 * 2 ** Math.min(item.attempts, 9));
      await save(item);
      try {
        const res = await send(item.url, { method: "POST", headers: { "Content-Type": "application/json", "x-offline-owner": item.uid }, body: JSON.stringify(item.body) });
        const result = await res.json().catch(() => null);
        const data: Record<string, unknown> = result && typeof result === "object" ? result : {};
        if (res.ok && acknowledged(item.url, data)) {
          item.result = data;
          item.state = data.proposedCorrection ? "confirmation" : data.success === false ? "rejected" : "sent";
          if (item.state === "rejected") item.error = typeof data.error === "string" ? data.error : "This entry was not accepted. Your phone copy is kept.";
          if (item.state === "sent") { item.body = {}; delete item.audio; }
        } else if (res.ok) {
          item.error = "The server did not confirm this entry. Your phone copy is kept.";
        } else {
          item.result = data; item.responseStatus = res.status;
          item.error = typeof data.error === "string" ? data.error : `Send failed (${res.status})`;
          // Auth/rate/server/pending responses are retryable. Keep every other rejection for explicit review.
          if (res.headers.get("x-idempotency-final") === "1" || (res.status >= 400 && res.status < 500 && ![401,403,408,425,429].includes(res.status))) item.state = "rejected";
        }
      } catch { item.error = "Waiting for signal"; }
      await save(item);
      // Preserve punch order; never let a later action overtake an unresolved earlier one.
      if (item.state === "waiting") break;
    }
  })().finally(() => { running = null; });
  return running;
}

export async function fieldPost(url: string, init: RequestInit, audio?: Blob): Promise<Response> {
  const owner = await fieldIdentity().catch(() => null);
  // Preserve the existing online superadmin flow without persisting preview data on the device.
  if (owner?.preview) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("Preview changes need a connection. Your entry has not been sent.");
    const body = { ...JSON.parse(String(init.body)), clientRequestId: crypto.randomUUID() };
    const response = await fetch(url, { ...init, body: JSON.stringify(body) });
    if (!response.ok) {
      const data = await response.clone().json().catch(() => ({}));
      throw new Error(typeof data.error === "string" ? data.error : "Not saved. Try again when you have signal.");
    }
    return response;
  }
  let item: OutboxItem;
  try {
    item = await enqueueField(url, JSON.parse(String(init.body)), audio, owner ?? undefined);
  } catch (error) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) throw error;
    const body = { ...JSON.parse(String(init.body)), clientRequestId: crypto.randomUUID() };
    return fetch(url, { ...init, body: JSON.stringify(body) });
  }
  await flushOutbox().catch(() => {});
  const saved = (await listOutbox(item.uid).catch(() => [])).find(i => i.id === item.id);
  if (!saved) return Response.json({ queued: true }, { status: 202 });
  if (saved.state === "waiting" && saved.responseStatus && saved.error) return Response.json({ ...saved.result, error: saved.error }, { status: saved.responseStatus });
  if (saved.state === "waiting" || saved.state === "confirmation") return Response.json({ queued: true }, { status: 202 });
  if (saved.state === "rejected") return Response.json({ ...saved.result, error: saved.error ?? "Not accepted. Your entry is kept on this phone." }, { status: saved.responseStatus ?? 422 });
  return Response.json(saved.result);
}

let retryUsers = 0;
let stopRetry: (() => void) | null = null;
export function startOutboxRetry() {
  retryUsers++;
  if (!stopRetry) {
    const retry = () => {
      const user = offlineIdentity();
      if (!user || user.preview) return;
      void listOutbox(user.uid).then(items => {
        if (items.some(i => i.state === "waiting")) return flushOutbox();
      }).catch(() => {});
    };
    window.addEventListener("online", retry); window.addEventListener("focus", retry); window.addEventListener("luxor-identity", retry);
    const timer = window.setInterval(retry, 30_000); retry();
    stopRetry = () => {
      window.clearInterval(timer); window.removeEventListener("online", retry); window.removeEventListener("focus", retry); window.removeEventListener("luxor-identity", retry);
    };
  }
  let stopped = false;
  return () => {
    if (stopped) return; stopped = true;
    if (--retryUsers === 0) { stopRetry?.(); stopRetry = null; }
  };
}
