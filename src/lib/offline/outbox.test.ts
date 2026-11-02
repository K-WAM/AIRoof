import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearOutbox, confirmOutboxItem, enqueueField, fieldPost, flushOutbox, keepOutboxItem, listOutbox, startOutboxRetry } from "./outbox";
import { setOfflineIdentity } from "./identity";

vi.mock("@/lib/firebase/client", () => ({ getFirebaseAuth: async () => ({ currentUser: { uid: "worker-a" } }) }));
const owner = { uid: "worker-a", businessId: "biz" };
const url = "/api/jobs/J-1/updates";
const body = { businessId: "biz", rawText: "Used 12 bundles", submittedBy: "Carlos" };
beforeEach(() => { vi.stubGlobal("indexedDB", new IDBFactory()); setOfflineIdentity(owner); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("durable field outbox", () => {
  it("refuses preview and cross-tenant entries", async () => {
    await expect(enqueueField(url, body, undefined, { ...owner, preview: true })).rejects.toThrow("Sign in");
    await expect(enqueueField(url, { ...body, businessId: "other" }, undefined, owner)).rejects.toThrow("Sign in");
    expect(await listOutbox(owner.uid)).toEqual([]);
  });
  it("does not send or claim saved when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(enqueueField(url, body, undefined, owner)).rejects.toThrow("could not save");
  });
  it("keeps an entry when a 200 response does not acknowledge the saved record", async () => {
    await enqueueField(url, body, undefined, owner);
    await flushOutbox(owner, vi.fn(async () => new Response("<html>Sign in</html>")));
    expect((await listOutbox(owner.uid))[0]).toMatchObject({ state: "waiting", body: expect.objectContaining({ rawText: body.rawText }), error: expect.stringContaining("did not confirm") });
  });
  it("preserves the online preview flow without storing preview data", async () => {
    setOfflineIdentity({ ...owner, preview: true });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ update: { updateId: "preview" } })));
    await fieldPost(url, { method: "POST", body: JSON.stringify(body) });
    expect(await listOutbox(owner.uid)).toEqual([]);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toHaveProperty("clientRequestId");
  });
  it("preserves audio, request metadata and one id through network failure and backoff", async () => {
    const audio = new Blob(["voice"], { type: "audio/webm" });
    const item = await enqueueField(url, body, audio, owner);
    const send = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(Response.json({ update: { updateId: "u1" } }));
    await flushOutbox(owner, send, 10_000);
    const saved = (await listOutbox(owner.uid))[0];
    expect(saved.audio?.size).toBe(5); expect(saved.jobId).toBe("J-1"); expect(saved.author).toBe("Carlos");
    expect(saved.body.clientRequestId).toBe(item.id);
    await flushOutbox(owner, send, 10_001); expect(send).toHaveBeenCalledTimes(1);
    await flushOutbox(owner, send, 12_000); expect(send).toHaveBeenCalledTimes(2);
    const first = JSON.parse(send.mock.calls[0][1].body), second = JSON.parse(send.mock.calls[1][1].body);
    expect(first).toEqual(second); expect(send.mock.calls[1][1].headers["x-offline-owner"]).toBe(owner.uid);
    expect((await listOutbox(owner.uid))[0].state).toBe("sent");
    await flushOutbox(owner, send, 99_999); expect(send).toHaveBeenCalledTimes(2);
  });
  it("never sends another user's entries and clears only the requested user", async () => {
    await enqueueField(url, body, undefined, owner);
    const other = { ...owner, uid: "worker-b" };
    await enqueueField(url, body, undefined, other);
    const send = vi.fn(async () => Response.json({ ok: true }));
    await clearOutbox(other.uid); await flushOutbox(other, send); expect(send).not.toHaveBeenCalled();
    expect(await listOutbox(owner.uid)).toHaveLength(1);
  });
  it.each([401,403,408,425,429,500,503])("keeps %i responses for retry without dropping the request", async status => {
    await enqueueField(url, body, undefined, owner);
    await flushOutbox(owner, vi.fn(async () => Response.json({ error: "Try later" }, { status })), 10_000);
    expect((await listOutbox(owner.uid))[0]).toMatchObject({ state: "waiting", error: "Try later" });
  });
  it("keeps a definitive rejection and a correction proposal for explicit review", async () => {
    await enqueueField(url, body, undefined, owner);
    await flushOutbox(owner, vi.fn(async () => Response.json({ error: "Job not found" }, { status: 404 })));
    expect((await listOutbox(owner.uid))[0]).toMatchObject({ state: "rejected", body: expect.objectContaining({ rawText: body.rawText }) });
    const rejected = (await listOutbox(owner.uid))[0];
    await keepOutboxItem(owner.uid, rejected.id);
    expect((await listOutbox(owner.uid))[0].kept).toBe(true);
    await enqueueField(url, body, undefined, owner);
    await flushOutbox(owner, vi.fn(async () => Response.json({ proposedCorrection: { item: "bundles", newValue: 2 } })));
    expect((await listOutbox(owner.uid))[1].state).toBe("confirmation");
  });
  it("does not let a later punch overtake a disconnected earlier punch", async () => {
    await enqueueField("/api/timeclock/punch", { ...body, type: "site_in", jobId: "J-1" }, undefined, owner);
    await enqueueField("/api/timeclock/punch", { ...body, type: "site_out", jobId: "J-1" }, undefined, owner);
    const send = vi.fn().mockRejectedValue(new TypeError("network"));
    const now = Date.now();
    await flushOutbox(owner, send, now); expect(send).toHaveBeenCalledTimes(1);
    await flushOutbox(owner, send, now + 1); expect(send).toHaveBeenCalledTimes(1);
  });
  it("turns a double-tapped correction confirmation into one durable request", async () => {
    const item = await enqueueField(url, body, undefined, owner);
    await flushOutbox(owner, vi.fn(async () => Response.json({ proposedCorrection: { item: "bundles", newValue: 2 } })));
    await Promise.all([confirmOutboxItem(owner.uid, item.id), confirmOutboxItem(owner.uid, item.id)]);
    const entries = await listOutbox(owner.uid);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ state: "waiting", body: { clientRequestId: `${item.id}-confirm`, confirmCorrection: { newValue: 2 } } });
  });
  it.each(["online", "focus", "timer"])("retries on %s with one shared listener set", async event => {
    let tick!: () => void;
    const target = Object.assign(new EventTarget(), {
      setInterval: vi.fn((callback: () => void, delay: number) => { expect(delay).toBe(30_000); tick = callback; return 1; }),
      clearInterval: vi.fn(),
    });
    vi.stubGlobal("window", target); vi.stubGlobal("navigator", { onLine: true });
    let now = Date.now(); vi.spyOn(Date, "now").mockImplementation(() => now);
    await enqueueField(url, body, undefined, owner);
    const send = vi.fn().mockRejectedValueOnce(new TypeError("network")).mockResolvedValue(Response.json({ update: { updateId: "u1" } }));
    vi.stubGlobal("fetch", send);
    const stop = startOutboxRetry(), stopSecond = startOutboxRetry();
    try {
      await vi.waitFor(async () => expect((await listOutbox(owner.uid))[0].attempts).toBe(1));
      // Wait for the failed attempt to finish persisting before triggering a fresh flush.
      await flushOutbox(owner, send, now);
      now += 30_000;
      if (event === "timer") tick(); else target.dispatchEvent(new Event(event));
      await vi.waitFor(async () => expect((await listOutbox(owner.uid))[0].state).toBe("sent"));
      expect(target.setInterval).toHaveBeenCalledOnce(); expect(send).toHaveBeenCalledTimes(2);
    } finally { stop(); stopSecond(); }
    expect(target.clearInterval).toHaveBeenCalledOnce();
  });
});
