import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { idempotentFieldRequest } from "./idempotency";

// Serialized, persistent transaction double: competing requests see the committed claim.
function database() {
  const docs = new Map<string, unknown>();
  let tail = Promise.resolve();
  const db = {
    collection: (path: string) => ({ doc: (id: string) => ({ path: `${path}/${id}`, delete: async () => { docs.delete(`${path}/${id}`); } }) }),
    runTransaction: (run: (tx: unknown) => Promise<unknown>) => {
      const result = tail.then(() => run({
        get: async (ref: { path: string }) => ({ exists: docs.has(ref.path), data: () => docs.get(ref.path) }),
        set: (ref: { path: string }, value: unknown) => docs.set(ref.path, value),
      }));
      tail = result.then(() => undefined, () => undefined);
      return result;
    },
  } as unknown as FirebaseFirestore.Firestore;
  return { db, docs };
}
let fixture: ReturnType<typeof database>;
beforeEach(() => { fixture = database(); });
const body = { clientRequestId: "request-123", rawText: "Used 12 bundles" };

describe("transactional field request idempotency", () => {
  it("rejects malformed IDs and timestamps before invoking paid work", async () => {
    const work = vi.fn();
    for (const patch of [{ clientRequestId: "../../escape" }, { clientCreatedAt: 0 }, { clientCreatedAt: Date.now() + 120_000 }]) {
      const res = await idempotentFieldRequest(fixture.db, "biz", "job-1:user", { ...body, ...patch }, work);
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
    expect(work).not.toHaveBeenCalled(); expect(fixture.docs.size).toBe(0);
  });
  it("rejects changed payloads for the same key", async () => {
    const work = vi.fn(async () => NextResponse.json({ ok: true }));
    await idempotentFieldRequest(fixture.db, "biz", "job-1:user", body, work);
    const res = await idempotentFieldRequest(fixture.db, "biz", "job-1:user", { ...body, rawText: "Different" }, work);
    expect(res.status).toBe(409); expect(work).toHaveBeenCalledTimes(1);
  });
  it.each(["updates", "audio", "photos", "punch"])("%s: duplicate submit creates one record and returns the original response", async kind => {
    const records: string[] = [];
    const parse = vi.fn(async () => "parsed");
    const work = vi.fn(async () => { await parse(); records.push("one record"); return NextResponse.json({ id: "original", parsed: "parsed" }, { status: 201 }); });
    const submit = (payload = body) => idempotentFieldRequest(fixture.db, "biz", `${kind}:job-1:user`, payload, work);
    const first = await submit(), repeat = await submit();
    expect(first.status).toBe(201); expect(repeat.status).toBe(201);
    expect(await repeat.json()).toEqual(await first.json());
    expect(records).toHaveLength(1); expect(parse).toHaveBeenCalledTimes(1);
    await submit({ ...body, clientRequestId: "request-456" });
    expect(records).toHaveLength(2); expect(parse).toHaveBeenCalledTimes(2);
    expect([...fixture.docs.values()]).toEqual(expect.arrayContaining([expect.objectContaining({ expiresAt: expect.any(Date) })]));
  });
  it("never executes a concurrent duplicate while the first parse is in flight", async () => {
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    const work = vi.fn(async () => { await wait; return NextResponse.json({ ok: true }); });
    const first = idempotentFieldRequest(fixture.db, "biz", "job-1:user", body, work);
    await vi.waitFor(() => expect(work).toHaveBeenCalledTimes(1));
    const duplicate = await idempotentFieldRequest(fixture.db, "biz", "job-1:user", body, work);
    expect(duplicate.status).toBe(425); release(); await first;
    expect(work).toHaveBeenCalledTimes(1);
  });
  it("keeps an ambiguous crash claimed so retry cannot double-charge or double-apply", async () => {
    const work = vi.fn(async () => { throw new Error("Connection lost after provider/write"); });
    expect((await idempotentFieldRequest(fixture.db, "biz", "job-1:user", body, work)).status).toBe(425);
    expect((await idempotentFieldRequest(fixture.db, "biz", "job-1:user", body, work)).status).toBe(425);
    expect(work).toHaveBeenCalledTimes(1);
    expect([...fixture.docs.values()][0]).not.toHaveProperty("expiresAt");
  });
  it("isolates tenant, job, operation and author scopes", async () => {
    const work = vi.fn(async () => NextResponse.json({ ok: true }));
    for (const [biz, scope] of [["a", "notes:j1:u1"], ["b", "notes:j1:u1"], ["a", "notes:j2:u1"], ["a", "photos:j1:u1"], ["a", "notes:j1:u2"]]) await idempotentFieldRequest(fixture.db, biz, scope, body, work);
    expect(work).toHaveBeenCalledTimes(5);
  });

  it("releases the claim on a server error so the phone's retry runs the work again", async () => {
    const work = vi.fn()
      .mockResolvedValueOnce(NextResponse.json({ error: "Transcription failed" }, { status: 502 }))
      .mockResolvedValueOnce(NextResponse.json({ success: true }, { status: 201 }));
    const first = await idempotentFieldRequest(fixture.db, "biz", "job-1:user", body, work);
    expect(first.status).toBe(502);
    expect(first.headers.get("x-idempotency-final")).toBeNull();
    const second = await idempotentFieldRequest(fixture.db, "biz", "job-1:user", body, work);
    expect(second.status).toBe(201);
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("takes over a pending claim left by a run that died, but not a fresh one", async () => {
    const work = vi.fn(async () => NextResponse.json({ success: true }, { status: 201 }));
    const hang = idempotentFieldRequest(fixture.db, "biz", "job-1:user", body, () => new Promise<NextResponse>(() => {}));
    await new Promise((r) => setTimeout(r, 0));
    void hang;
    expect((await idempotentFieldRequest(fixture.db, "biz", "job-1:user", body, work)).status).toBe(425);
    const [key] = [...fixture.docs.keys()];
    const claim = fixture.docs.get(key) as { createdAt: Date };
    claim.createdAt = new Date(Date.now() - 11 * 60_000);
    expect((await idempotentFieldRequest(fixture.db, "biz", "job-1:user", body, work)).status).toBe(201);
    expect(work).toHaveBeenCalledTimes(1);
  });
});
