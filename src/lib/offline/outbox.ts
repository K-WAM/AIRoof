import { offlineStore } from "./db";
import { fieldIdentity, identityRevision, type OfflineIdentity } from "./identity";

export interface OutboxItem {
  id: string; uid: string; url: string; businessId: string; jobId?: string; author: string;
  body: Record<string, unknown>; audio?: Blob; createdAt: number; attempts: number; nextAt: number;
  responseStatus?: number; state: "waiting" | "rejected" | "sent" | "confirmation"; error?: string; result?: Record<string, unknown>;
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
      if (item.state !== "waiting" || item.nextAt > now) continue;
      if (identityRevision() !== revision) break;
      if (!owner && (await fieldIdentity())?.uid !== user.uid) break;
      // Persist backoff BEFORE sending. A closed tab never erases an unacknowledged upload.
      item.attempts++;
      item.nextAt = now + Math.min(300_000, 1000 * 2 ** Math.min(item.attempts, 9));
      await save(item);
      try {
        const res = await send(item.url, { method: "POST", headers: { "Content-Type": "application/json", "x-offline-owner": item.uid }, body: JSON.stringify(item.body) });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          item.result = data;
          item.state = data.proposedCorrection ? "confirmation" : data.success === false ? "rejected" : "sent";
          if (item.state === "sent") { item.body = {}; delete item.audio; }
        } else {
          item.result = data; item.responseStatus = res.status;
          item.error = typeof data.error === "string" ? data.error : `Send failed (${res.status})`;
          // Auth/rate/server/pending responses are retryable. Keep every other rejection for explicit review.
          if (res.status >= 400 && res.status < 500 && ![401,403,408,425,429].includes(res.status)) item.state = "rejected";
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
  const item = await enqueueField(url, JSON.parse(String(init.body)), audio);
  await flushOutbox();
  const saved = (await listOutbox(item.uid)).find(i => i.id === item.id)!;
  if (saved.state === "waiting" || saved.state === "confirmation") return Response.json({ queued: true }, { status: 202 });
  if (saved.state === "rejected") return Response.json({ ...saved.result, error: saved.error ?? "Not accepted. Your entry is kept on this phone." }, { status: saved.responseStatus ?? 422 });
  return Response.json(saved.result);
}

export function startOutboxRetry() {
  const retry = () => { void flushOutbox().catch(() => {}); };
  window.addEventListener("online", retry); window.addEventListener("focus", retry);
  const timer = window.setInterval(retry, 30_000); retry();
  return () => { clearInterval(timer); window.removeEventListener("online", retry); window.removeEventListener("focus", retry); };
}
