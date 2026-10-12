import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { quoteResponseTokenHash, quoteResponseUrl } from "@/lib/billing/quoteResponse";

const mocks = vi.hoisted(() => ({ firestore: vi.fn() }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: mocks.firestore }));
import { GET, POST } from "./route";

const token = "a".repeat(64);
let db: ReturnType<typeof makeFakeDb>;
const url = (decision: "accepted" | "declined", value = token) => quoteResponseUrl("http://localhost", "biz", "job", value, decision);
const get = (decision: "accepted" | "declined", value = token) => GET(new NextRequest(url(decision, value)));
const post = (decision: "accepted" | "declined", value = token) => POST(new NextRequest(url(decision, value), {
  method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URL(url(decision, value)).searchParams.toString(),
}));

beforeEach(() => {
  db = makeFakeDb();
  db.__seed("businesses/biz/jobs", "job", { quoteId: "Q-1", status: "quoted" });
  db.__seed("businesses/biz/quotes", "Q-1", { quoteId: "Q-1", businessId: "biz", jobId: "job", status: "sent", validUntil: Date.now() + 86400000, responseTokenHash: quoteResponseTokenHash(token) });
  mocks.firestore.mockReturnValue(db);
});

describe("customer quote response", () => {
  it("requires the emailed token and a matching job, without exposing the quote to strangers", async () => {
    expect((await get("accepted", "b".repeat(64))).status).toBe(404);
    expect((await post("accepted", "b".repeat(64))).status).toBe(404);
    expect((await GET(new NextRequest("http://localhost/api/quote-response?businessId=other&jobId=job&token=" + token + "&decision=accepted"))).status).toBe(404);
    expect(db.__peek("businesses/biz/quotes", "Q-1")?.status).toBe("sent");
  });

  it("only records acceptance after the customer confirms, then consumes the token", async () => {
    const preview = await get("accepted");
    expect(preview.status).toBe(200);
    expect(await preview.text()).toContain("Confirm accept");
    expect(db.__peek("businesses/biz/quotes", "Q-1")?.status).toBe("sent");
    const answer = await post("accepted");
    expect(answer.status).toBe(200);
    expect(db.__peek("businesses/biz/quotes", "Q-1")).toMatchObject({ status: "accepted", answeredAt: expect.any(Number) });
    expect(db.__peek("businesses/biz/quotes", "Q-1")?.responseTokenHash).toBeUndefined();
    expect((await post("declined")).status).toBe(404);
  });

  it("records rejection and refuses an expired or already answered quote", async () => {
    expect((await post("declined")).status).toBe(200);
    expect(db.__peek("businesses/biz/quotes", "Q-1")?.status).toBe("declined");
    db.__seed("businesses/biz/quotes", "Q-1", { quoteId: "Q-1", businessId: "biz", jobId: "job", status: "sent", validUntil: Date.now() - 1, responseTokenHash: quoteResponseTokenHash(token) });
    expect((await post("accepted")).status).toBe(409);
    expect(db.__peek("businesses/biz/quotes", "Q-1")?.status).toBe("sent");
  });
});
