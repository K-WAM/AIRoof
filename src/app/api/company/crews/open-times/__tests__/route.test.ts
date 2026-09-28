import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

let db = makeFakeDb();
let allowed = true;
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));
vi.mock("@/lib/auth/verifyRole", () => ({
  verifyAuthAndRole: async () => (allowed ? { user: { uid: "staff-1", role: "staff" } } : { error: new Response(null, { status: 403 }) }),
}));
import { GET } from "../route";

// Mon–Fri 8–5 in New York; Oct 2026 is EDT (UTC-4), so 8:00 AM local = 12:00Z.
const HOURS = { Monday: "8:00 AM - 5:00 PM", Tuesday: "8:00 AM - 5:00 PM", Wednesday: "8:00 AM - 5:00 PM", Thursday: "8:00 AM - 5:00 PM", Friday: "8:00 AM - 5:00 PM", Saturday: "Closed", Sunday: "Closed" };
const at = (iso: string) => Date.parse(iso);
const get = (query: string) => GET(new NextRequest(`http://localhost/api/company/crews/open-times?${query}`));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at("2026-10-01T16:00:00Z")); // Thu Oct 1, noon in New York
  db = makeFakeDb();
  allowed = true;
  db.__seed("businesses", "biz", { timezone: "America/New_York", businessHours: HOURS });
  db.__seed("businesses/biz/crews", "c1", { name: "Tyler Crew", active: true });
  // Mon Oct 5: a 9–10 AM job already on the crew.
  db.__seed("businesses/biz/jobs", "J-1", { assignedCrewId: "c1", scheduledStart: at("2026-10-05T13:00:00Z"), scheduledEnd: at("2026-10-05T14:00:00Z") });
});
afterEach(() => vi.useRealTimers());

describe("GET /api/company/crews/open-times", () => {
  it("lists the crew's open starts around a job already on that day", async () => {
    const data = await (await get("businessId=biz&crewId=c1&day=2026-10-05&durationMin=60")).json();
    expect(data.reason).toBeNull();
    expect(data.starts[0]).toBe(at("2026-10-05T12:00:00Z")); // 8:00 AM
    expect(data.starts).not.toContain(at("2026-10-05T12:30:00Z")); // 8:30–9:30 overlaps the 9 AM job
    expect(data.starts).not.toContain(at("2026-10-05T13:00:00Z"));
    expect(data.starts).toContain(at("2026-10-05T14:00:00Z")); // 10:00 AM
    expect(data.starts.at(-1)).toBe(at("2026-10-05T20:00:00Z")); // 4:00 PM, ends at close
  });

  it("leaves the job being moved out of its own way", async () => {
    const data = await (await get("businessId=biz&crewId=c1&day=2026-10-05&durationMin=60&jobId=J-1")).json();
    expect(data.starts).toContain(at("2026-10-05T13:00:00Z"));
  });

  it("says closed and offers the next opening", async () => {
    const data = await (await get("businessId=biz&crewId=c1&day=2026-10-03&durationMin=60")).json(); // Saturday
    expect(data.starts).toEqual([]);
    expect(data.reason).toBe("closed");
    expect(data.nextOpen).toEqual({ day: "2026-10-05", start: at("2026-10-05T12:00:00Z") });
  });

  it("never offers a time that has passed today", async () => {
    const data = await (await get("businessId=biz&crewId=c1&day=2026-10-01&durationMin=60")).json();
    expect(data.starts[0]).toBe(at("2026-10-01T16:00:00Z")); // noon, not 8 AM
  });

  it("points at Settings when the hours can't be read", async () => {
    db.__seed("businesses", "biz", { timezone: "America/New_York" });
    const data = await (await get("businessId=biz&crewId=c1&day=2026-10-05")).json();
    expect(data.reason).toBe("no_hours");
  });

  it("validates input and the role gate", async () => {
    expect((await get("businessId=biz&crewId=c1&day=10/05/2026")).status).toBe(400);
    expect((await get("businessId=biz&crewId=c1&day=2026-10-05&durationMin=5")).status).toBe(400);
    expect((await get("businessId=biz&crewId=missing&day=2026-10-05")).status).toBe(404);
    allowed = false;
    expect((await get("businessId=biz&crewId=c1&day=2026-10-05")).status).toBe(403);
  });
});
