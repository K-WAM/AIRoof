import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({
  getAdminFirestore: vi.fn(),
  checkAvailability: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: mocks.getAdminFirestore }));
vi.mock("@/lib/tools/agentTools", () => ({ checkAvailability: mocks.checkAvailability }));
vi.mock("@/lib/comms/send", () => ({ sendEmail: mocks.sendEmail }));

import { GET, PLATFORM_ALERT_TO } from "@/app/api/cron/booking-canary/route";

const NOW = Date.UTC(2026, 8, 28, 11, 0, 0); // Monday 28 Sep 2026, 07:00 America/New_York
const CRON_SECRET = "test-cron-secret";
const HOURS = {
  Monday: "08:00 - 17:00",
  Tuesday: "08:00 - 17:00",
  Wednesday: "08:00 - 17:00",
  Thursday: "08:00 - 17:00",
  Friday: "08:00 - 17:00",
  Saturday: "Closed",
  Sunday: "Closed",
};
const NEXT_DAY_8AM = "2026-09-29T12:00:00.000Z"; // Tuesday 8:00 AM ET (the next business day)

function request(secret?: string) {
  return new NextRequest("http://localhost/api/cron/booking-canary", {
    method: "GET",
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

function seedBusiness(db: FakeDb, id: string, overrides: Record<string, unknown> = {}) {
  db.__seed("businesses", id, {
    businessName: `Business ${id}`,
    timezone: "America/New_York",
    businessHours: HOURS,
    elevenlabs: { agentId: `agent_${id}` },
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  process.env.CRON_SECRET = CRON_SECRET;
  mocks.checkAvailability.mockResolvedValue({ available: true, suggestedSlots: [{ startTime: NEXT_DAY_8AM }], hoursStatus: "ok" });
  mocks.sendEmail.mockResolvedValue({ status: "delivered" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("booking canary auth boundary", () => {
  it("rejects a missing Bearer token before touching Firestore", async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mocks.getAdminFirestore).not.toHaveBeenCalled();
    expect(mocks.checkAvailability).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("rejects a wrong Bearer token", async () => {
    const response = await GET(request("wrong"));
    expect(response.status).toBe(401);
    expect(mocks.getAdminFirestore).not.toHaveBeenCalled();
  });
});

describe("booking canary checks", () => {
  it("passes a healthy tenant, records the check on the business doc, and sends no email", async () => {
    const db = makeFakeDb();
    seedBusiness(db, "demo-roofing");
    mocks.getAdminFirestore.mockReturnValue(db);

    const response = await GET(request(CRON_SECRET));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, checked: 1, failures: [], emailStatus: "not_sent" });
    expect(mocks.checkAvailability).toHaveBeenCalledTimes(2);
    expect(mocks.checkAvailability).toHaveBeenCalledWith({ businessId: "demo-roofing", preferredDate: "2026-09-29" });
    expect(mocks.checkAvailability).toHaveBeenCalledWith({ businessId: "demo-roofing", preferredDate: "2026-09-29", preferredTime: "10:00 AM" });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(db.__peek("businesses", "demo-roofing")?.bookingCheck).toMatchObject({ ok: true, problems: [], nextBusinessDay: "2026-09-29" });
  });

  it("fails when the tenant's hours cannot be read", async () => {
    const db = makeFakeDb();
    seedBusiness(db, "demo-roofing", { businessHours: "whenever we feel like it" });
    mocks.getAdminFirestore.mockReturnValue(db);

    const response = await GET(request(CRON_SECRET));
    const body = await response.json();

    expect(body.ok).toBe(false);
    expect(body.failures[0].problems).toContain("Business hours are missing or could not be read.");
    expect(mocks.checkAvailability).not.toHaveBeenCalled();
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
    expect(mocks.sendEmail.mock.calls[0][0]).toMatchObject({ to: PLATFORM_ALERT_TO, fromName: "Luxor CRM" });
    expect(db.__peek("businesses", "demo-roofing")?.bookingCheck).toMatchObject({ ok: false });
  });

  it("fails on an overnight slot (9 PM–7 AM)", async () => {
    const db = makeFakeDb();
    seedBusiness(db, "demo-roofing");
    mocks.getAdminFirestore.mockReturnValue(db);
    mocks.checkAvailability.mockResolvedValue({
      available: true,
      hoursStatus: "ok",
      suggestedSlots: [{ startTime: NEXT_DAY_8AM }, { startTime: "2026-09-30T01:00:00.000Z" }], // 9:00 PM ET Tue
    });

    const body = await (await GET(request(CRON_SECRET))).json();

    expect(body.ok).toBe(false);
    expect(body.failures[0].problems.join(" ")).toMatch(/overnight time/i);
  });

  it("fails on a slot in the past", async () => {
    const db = makeFakeDb();
    seedBusiness(db, "demo-roofing");
    mocks.getAdminFirestore.mockReturnValue(db);
    mocks.checkAvailability.mockResolvedValue({
      available: true,
      hoursStatus: "ok",
      suggestedSlots: [{ startTime: NEXT_DAY_8AM }, { startTime: "2026-09-28T10:00:00.000Z" }], // 6:00 AM ET, before NOW
    });

    const body = await (await GET(request(CRON_SECRET))).json();

    expect(body.failures[0].problems.join(" ")).toMatch(/in the past/i);
  });

  it("fails on a slot outside business hours", async () => {
    const db = makeFakeDb();
    seedBusiness(db, "demo-roofing");
    mocks.getAdminFirestore.mockReturnValue(db);
    mocks.checkAvailability.mockResolvedValue({
      available: true,
      hoursStatus: "ok",
      suggestedSlots: [{ startTime: NEXT_DAY_8AM }, { startTime: "2026-09-29T22:00:00.000Z" }], // 6:00 PM ET Tue
    });

    const body = await (await GET(request(CRON_SECRET))).json();

    expect(body.failures[0].problems.join(" ")).toMatch(/outside business hours/i);
  });

  it("fails when the next business day has hours but no opening", async () => {
    const db = makeFakeDb();
    seedBusiness(db, "demo-roofing");
    mocks.getAdminFirestore.mockReturnValue(db);
    mocks.checkAvailability.mockResolvedValue({
      available: true,
      hoursStatus: "ok",
      suggestedSlots: [{ startTime: "2026-09-30T12:00:00.000Z" }], // Wednesday, not the next business day
    });

    const body = await (await GET(request(CRON_SECRET))).json();

    expect(body.ok).toBe(false);
    expect(body.failures[0].problems.join(" ")).toMatch(/No opening on the next business day/);
  });

  it("fails when checkAvailability offers nothing", async () => {
    const db = makeFakeDb();
    seedBusiness(db, "demo-roofing");
    mocks.getAdminFirestore.mockReturnValue(db);
    mocks.checkAvailability.mockResolvedValue({ available: false, suggestedSlots: [], hoursStatus: "ok" });

    const body = await (await GET(request(CRON_SECRET))).json();

    expect(body.failures[0].problems.join(" ")).toMatch(/no openings at all/i);
  });

  it("sends exactly one alert for several failing tenants and reports the email status", async () => {
    const db = makeFakeDb();
    seedBusiness(db, "demo-roofing", { businessHours: "whenever we feel like it" });
    db.__seed("businesses", "biz-2", {
      businessName: "Second Co",
      timezone: "UTC",
      businessHours: { Monday: "nope" },
      elevenlabs: { agentId: "agent_2" },
    });
    mocks.getAdminFirestore.mockReturnValue(db);
    mocks.sendEmail.mockResolvedValue({ status: "failed" });

    const body = await (await GET(request(CRON_SECRET))).json();

    expect(body.checked).toBe(2);
    expect(body.failures).toHaveLength(2);
    expect(body.emailStatus).toBe("failed");
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
  });

  it("checks every tenant with a phone line but skips tenants without one", async () => {
    const db = makeFakeDb();
    // No phone line: neither the demo tenant nor an agent id.
    db.__seed("businesses", "biz-noline", { businessName: "No Line", timezone: "UTC", businessHours: HOURS });
    db.__seed("businesses", "biz-vapi", { businessName: "Vapi Co", timezone: "UTC", businessHours: HOURS, vapiAssistantId: "asst_1" });
    seedBusiness(db, "demo-roofing");
    mocks.getAdminFirestore.mockReturnValue(db);

    const body = await (await GET(request(CRON_SECRET))).json();

    expect(body.checked).toBe(2);
    expect(mocks.checkAvailability).toHaveBeenCalledWith(expect.objectContaining({ businessId: "biz-vapi" }));
    expect(db.__peek("businesses", "biz-noline")?.bookingCheck).toBeUndefined();
  });

  it("503s when Firestore is unavailable", async () => {
    mocks.getAdminFirestore.mockReturnValue(null);
    const response = await GET(request(CRON_SECRET));
    expect(response.status).toBe(503);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});

describe("booking canary helpers", () => {
  it("findNextBusinessDay skips closed days", async () => {
    const { findNextBusinessDay } = await import("@/app/api/cron/booking-canary/route");
    const { parseBusinessHours } = await import("@/lib/scheduling/hours");
    // Friday 25 Sep 2026, 12:00 UTC → next open day is Monday 28 Sep (weekend closed).
    const next = findNextBusinessDay(Date.UTC(2026, 8, 25, 12, 0, 0), "UTC", parseBusinessHours(HOURS)!);
    expect(next).toEqual({ date: "2026-09-28", weekday: "Monday" });
  });
});
