import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

const sent = vi.hoisted(() => [] as Array<{ to: string; entityId: string; html: string }>);
let db = makeFakeDb();
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyAuthAndRole: async () => ({ user: { uid: "owner-1", role: "owner" } }) }));
vi.mock("@/lib/tools/agentTools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tools/agentTools")>();
  return {
    ...actual,
    runLedgeredEmail: vi.fn(async (options: { to: string; entityId: string; html: string }) => {
      sent.push(options);
      return "delivered";
    }),
  };
});
import { POST } from "../route";

const HOURS = { Monday: "8:00 AM - 5:00 PM", Tuesday: "8:00 AM - 5:00 PM", Wednesday: "8:00 AM - 5:00 PM", Thursday: "8:00 AM - 5:00 PM", Friday: "8:00 AM - 5:00 PM", Saturday: "Closed", Sunday: "Closed" };
const START = Date.parse("2026-10-05T14:00:00Z"); // Mon 10:00 AM in New York
const context = { params: Promise.resolve({ jobId: "J-1" }) };
const confirm = () => POST(new NextRequest("http://localhost/api/jobs/J-1/assign", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ businessId: "biz", crewId: "c1", scheduledStart: START, scheduledEnd: START + 3_600_000 }),
}), context);

beforeEach(() => {
  sent.length = 0;
  db = makeFakeDb();
  db.__seed("businesses", "biz", { businessName: "Apex Roofing", timezone: "America/New_York", businessHours: HOURS });
  db.__seed("businesses/biz/jobs", "J-1", { jobId: "J-1", title: "Roof repair — 1 Main", status: "open" });
  db.__seed("businesses/biz/crews", "c1", { name: "Tyler Crew", email: "tyler@crew.test", color: "#16a34a", active: true });
  db.__seed("businessUsers", "u1", { businessId: "biz", crewId: "c1", role: "crew", email: "carlos@biz.test", displayName: "Carlos", active: true });
  db.__seed("businessUsers", "u2", { businessId: "biz", crewId: "c1", role: "staff", email: "TYLER@crew.test", active: true }); // same inbox as the crew
  db.__seed("businessUsers", "u3", { businessId: "biz", crewId: "c1", role: "staff", email: "gone@biz.test", active: false });
  db.__seed("businessUsers", "u4", { businessId: "biz", crewId: "c1", role: "viewer", email: "vera@biz.test", active: true });
  db.__seed("businessUsers", "u5", { businessId: "biz", crewId: "c2", role: "crew", email: "other@biz.test", active: true });
});

describe("POST /api/jobs/[jobId]/assign — who gets the crew email (T-148)", () => {
  it("emails the crew's address and each active member with an email, once each", async () => {
    const response = await confirm();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, emailed: true, emailedCount: 2 });
    expect(sent.map((email) => email.to)).toEqual(["tyler@crew.test", "carlos@biz.test"]);
    // The crew address keeps its original ledger key; each member gets its own so one never blocks another.
    expect(sent.map((email) => email.entityId)).toEqual([`J-1:${START}`, `J-1:${START}:u1`]);
    expect(sent[1].html).toContain("Hi Carlos");
    expect(sent[1].html).toContain("Tyler Crew");
  });

  it("still emails the members when the crew itself has no address", async () => {
    db.__seed("businesses/biz/crews", "c1", { name: "Tyler Crew", color: "#16a34a", active: true });
    const data = await (await confirm()).json();
    expect(sent.map((email) => email.to)).toEqual(["carlos@biz.test", "TYLER@crew.test"]);
    expect(data.emailedCount).toBe(2);
  });
});
