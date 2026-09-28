import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

let db = makeFakeDb();
let gate: { user: { uid: string; role: string } } | { error: Response } = { user: { uid: "owner-1", role: "owner" } };
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyAuthAndRole: async () => gate }));
import { DELETE, GET, POST } from "../route";

const DAY = 24 * 60 * 60 * 1000;
const BASE = Date.parse("2026-10-05T12:00:00Z");
const FROM = BASE;
const TO = BASE + 3_600_000;

const get = (query: string) => GET(new NextRequest(`http://localhost/api/company/time-blocks?${query}`));
const post = (body: Record<string, unknown>) =>
  POST(new NextRequest("http://localhost/api/company/time-blocks", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
const del = (query: string) =>
  DELETE(new NextRequest(`http://localhost/api/company/time-blocks?${query}`, { method: "DELETE" }));

const validBody = () => ({ businessId: "biz", crewId: "c1", startTime: FROM, endTime: TO, label: "  Site visit  " });

beforeEach(() => {
  db = makeFakeDb();
  gate = { user: { uid: "owner-1", role: "owner" } };
  db.__seed("businesses", "biz", { businessName: "Apex", timezone: "America/New_York" });
  db.__seed("businesses/biz/crews", "c1", { name: "Dominic", kind: "inspector", active: true });
  db.__seed("businesses/biz/crews", "c2", { name: "Tyler Crew", active: true });
  db.__seed("businesses/biz/timeBlocks", "blkA", { blockId: "blkA", businessId: "biz", crewId: "c1", startTime: FROM + 1_800_000, endTime: FROM + 5_400_000, label: "Site visit", createdByUid: "u1", createdAt: 1 });
  db.__seed("businesses/biz/timeBlocks", "blkB", { blockId: "blkB", businessId: "biz", crewId: "c1", startTime: FROM - 3_600_000, endTime: FROM - 60_000, label: "Before window", createdByUid: "u1", createdAt: 1 });
  db.__seed("businesses/biz/timeBlocks", "blkC", { blockId: "blkC", businessId: "biz", crewId: "c1", startTime: FROM + 7_200_000, endTime: FROM + 10_800_000, label: "After window", createdByUid: "u1", createdAt: 1 });
  db.__seed("businesses/biz/timeBlocks", "blkD", { blockId: "blkD", businessId: "biz", crewId: "c1", startTime: FROM - 15 * DAY, endTime: FROM - 15 * DAY + 3_600_000, label: "Ancient", createdByUid: "u1", createdAt: 1 });
  db.__seed("businesses/biz/timeBlocks", "blkE", { blockId: "blkE", businessId: "biz", crewId: "c2", startTime: FROM + 1_800_000, endTime: FROM + 5_400_000, label: "Other crew", createdByUid: "u1", createdAt: 1 });
});

describe("GET /api/company/time-blocks", () => {
  it("returns only blocks that overlap [from, to]", async () => {
    const data = await (await get(`businessId=biz&from=${FROM}&to=${TO}`)).json();
    expect(data.blocks.map((block: { blockId: string }) => block.blockId).sort()).toEqual(["blkA", "blkE"]);
  });

  it("filters to one crew when crewId is given", async () => {
    const data = await (await get(`businessId=biz&crewId=c1&from=${FROM}&to=${TO}`)).json();
    expect(data.blocks.map((block: { blockId: string }) => block.blockId)).toEqual(["blkA"]);
  });

  it("validates input and the role gate", async () => {
    expect((await get("businessId=biz")).status).toBe(400);
    expect((await get(`businessId=biz&from=abc&to=${TO}`)).status).toBe(400);
    expect((await get(`businessId=biz&from=${TO}&to=${FROM}`)).status).toBe(400);
    gate = { error: new Response(null, { status: 403 }) };
    expect((await get(`businessId=biz&from=${FROM}&to=${TO}`)).status).toBe(403);
  });
});

describe("POST /api/company/time-blocks", () => {
  it("creates a block with a trimmed label and the caller as creator", async () => {
    const response = await post(validBody());
    expect(response.status).toBe(201);
    const { block } = await response.json();
    expect(block).toMatchObject({ businessId: "biz", crewId: "c1", startTime: FROM, endTime: TO, label: "Site visit", createdByUid: "owner-1" });
    expect(db.__peek("businesses/biz/timeBlocks", block.blockId)?.label).toBe("Site visit");
  });

  it("rejects bad labels, bad ranges and over-long blocks", async () => {
    expect((await post({ ...validBody(), label: "   " })).status).toBe(400);
    expect((await post({ ...validBody(), label: "x".repeat(81) })).status).toBe(400);
    expect((await post({ ...validBody(), endTime: FROM })).status).toBe(400);
    expect((await post({ ...validBody(), endTime: FROM + 15 * DAY })).status).toBe(400);
    expect((await post({ ...validBody(), startTime: "soon" })).status).toBe(400);
  });

  it("404s an unknown crew and refuses viewers", async () => {
    expect((await post({ ...validBody(), crewId: "missing" })).status).toBe(404);
    gate = { error: new Response(null, { status: 403 }) };
    expect((await post(validBody())).status).toBe(403);
  });
});

describe("DELETE /api/company/time-blocks", () => {
  it("deletes an existing block and 404s a missing one", async () => {
    const response = await del("businessId=biz&blockId=blkA");
    expect(await response.json()).toEqual({ ok: true });
    expect(db.__peek("businesses/biz/timeBlocks", "blkA")).toBeUndefined();
    expect((await del("businessId=biz&blockId=missing")).status).toBe(404);
    expect((await del("businessId=biz")).status).toBe(400);
  });

  it("refuses viewers", async () => {
    gate = { error: new Response(null, { status: 403 }) };
    expect((await del("businessId=biz&blockId=blkA")).status).toBe(403);
  });
});
