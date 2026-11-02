import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { collectionPoll } from "./collectionPoll";

const reader = { uid: "office", role: "owner" as const };
const req = (version?: string) => new NextRequest(`http://localhost/api/list${version === undefined ? "" : `?pollVersion=${version}`}`);

describe("collectionPoll", () => {
  it("does no extra queries for non-poll callers", async () => {
    const db = makeFakeDb();
    const ref = db.collection("items");
    const count = vi.spyOn(ref, "count");
    const order = vi.spyOn(ref, "orderBy");
    expect(await collectionPoll(req(), ref as unknown as FirebaseFirestore.CollectionReference, reader)).toEqual({ version: undefined, unchanged: false });
    expect(count).not.toHaveBeenCalled(); expect(order).not.toHaveBeenCalled();
  });
  it("skips unchanged lists, but detects creation, edits to older rows and deletions", async () => {
    const db = makeFakeDb();
    const ref = db.collection("items") as unknown as FirebaseFirestore.CollectionReference;
    db.__seed("items", "old", { createdAt: 1, updatedAt: 1 });
    db.__seed("items", "new", { createdAt: 2, updatedAt: 2 });
    let poll = await collectionPoll(req(""), ref, reader);
    expect(poll.unchanged).toBe(false);
    expect((await collectionPoll(req(poll.version), ref, reader)).unchanged).toBe(true);
    expect((await collectionPoll(req(poll.version), ref, { uid: "office", role: "crew", crewId: "crew-a" })).unchanged).toBe(false);
    expect((await collectionPoll(req(poll.version), ref, { uid: "different", role: "owner" })).unchanged).toBe(false);
    const differentFilter = new NextRequest(`http://localhost/api/list?status=complete&pollVersion=${poll.version}`);
    expect((await collectionPoll(differentFilter, ref, reader)).unchanged).toBe(false);
    db.__seed("items", "old", { createdAt: 1, updatedAt: 3 });
    let changed = await collectionPoll(req(poll.version), ref, reader);
    expect(changed.unchanged).toBe(false); poll = changed;
    db.__seed("items", "added", { createdAt: 4, updatedAt: 4 });
    changed = await collectionPoll(req(poll.version), ref, reader);
    expect(changed.unchanged).toBe(false); poll = changed;
    await db.collection("items").doc("old").delete(); // deleting a non-latest row still changes the count
    expect((await collectionPoll(req(poll.version), ref, reader)).unchanged).toBe(false);
  });
});
