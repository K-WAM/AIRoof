import { createRequire } from "node:module";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearOutbox, enqueueField, flushOutbox, listOutbox } from "./outbox";
import { setOfflineIdentity } from "./identity";

// A separate package path allows a junction-based worktree to test without changing shared node_modules.
const { IDBFactory } = createRequire(import.meta.url)(process.env.FAKE_INDEXEDDB_PATH ?? "fake-indexeddb") as { IDBFactory: new () => IDBFactory };
vi.mock("@/lib/firebase/client", () => ({ getFirebaseAuth: async () => null }));
const owner = { uid: "worker-a", businessId: "biz" };
const url = "/api/jobs/J-1/updates";
const body = { businessId: "biz", rawText: "Used 12 bundles", submittedBy: "Carlos" };
beforeEach(() => { vi.stubGlobal("indexedDB", new IDBFactory()); setOfflineIdentity(owner); });

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
  it("preserves audio, request metadata and one id through network failure and backoff", async () => {
    const audio = new Blob(["voice"], { type: "audio/webm" });
    const item = await enqueueField(url, body, audio, owner);
    const send = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(Response.json({ success: true }));
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
    await enqueueField(url, body, undefined, owner);
    await flushOutbox(owner, vi.fn(async () => Response.json({ proposedCorrection: { item: "bundles", newValue: 2 } })));
    expect((await listOutbox(owner.uid))[1].state).toBe("confirmation");
  });
  it("does not let a later punch overtake a disconnected earlier punch", async () => {
    await enqueueField("/api/timeclock/punch", { ...body, type: "site_in", jobId: "J-1" }, undefined, owner);
    await enqueueField("/api/timeclock/punch", { ...body, type: "site_out", jobId: "J-1" }, undefined, owner);
    const send = vi.fn().mockRejectedValue(new TypeError("network"));
    await flushOutbox(owner, send); expect(send).toHaveBeenCalledTimes(1);
  });
});
