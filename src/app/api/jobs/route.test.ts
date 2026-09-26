import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({ field: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyFieldAccess: mocks.field }));
let db: FakeDb;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));
import { GET } from "./route";

beforeEach(() => {
  db = makeFakeDb();
  mocks.field.mockReset().mockResolvedValue({ user: { uid: "staff" } });
  for (let i = 1; i <= 205; i++) {
    db.__seed("businesses/biz/jobs", `J-${i}`, { createdAt: i, status: i % 2 ? "complete" : "quoted", title: `Job ${i}` });
  }
});

async function list(query = "") {
  const res = await GET(new NextRequest(`http://localhost/api/jobs?businessId=biz${query}`));
  return { status: res.status, body: await res.json() as { jobs: Array<{ jobId: string; createdAt: number }>; hasMore: boolean; nextBefore: number | null } };
}

describe("GET /api/jobs paging", () => {
  it("pages newest first through all jobs", async () => {
    const first = await list();
    expect(first.body.jobs).toHaveLength(100);
    expect(first.body.jobs[0].jobId).toBe("J-205");
    expect(first.body.hasMore).toBe(true);
    const second = await list(`&before=${first.body.nextBefore}`);
    const third = await list(`&before=${second.body.nextBefore}`);
    expect([...first.body.jobs, ...second.body.jobs, ...third.body.jobs]).toHaveLength(205);
    expect(third.body.hasMore).toBe(false);
  });

  it("applies status on the server before paging", async () => {
    const first = await list("&status=complete");
    expect(first.body.jobs).toHaveLength(100);
    expect(first.body.hasMore).toBe(true);
    const second = await list(`&status=complete&before=${first.body.nextBefore}`);
    expect(second.body.jobs).toHaveLength(3);
  });
});
