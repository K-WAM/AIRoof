// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Regression: the owner's live demo showed "No upcoming appointments" on the Appointments tab while the database held
// 14 future appointments and the appointments API was answering 200. This renders the real page with real-shaped data.
vi.mock("@/hooks/useBusinessId", () => ({ useBusinessId: () => "demo-roofing" }));
vi.mock("@/hooks/useBusinessTimezone", () => ({ useBusinessTimezone: () => "America/New_York" }));
vi.mock("@/hooks/useBusinessModules", () => ({
  useBusinessModules: () => ({ vocab: { jobNoun: "Job", jobNounPlural: "Jobs", customerNoun: "Customer", customerNounPlural: "Customers" }, isEnabled: () => true, ready: true, industry: "roofing" }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("tab=appointments&preview=demo-roofing"),
}));

import PipelinePage from "./page";

const HOUR = 3_600_000;
const now = Date.now();
const appointment = (id: string, startOffsetH: number, over: Record<string, unknown> = {}) => ({
  appointmentId: id, callerName: `Caller ${id}`, callerPhone: "+13055550111", serviceType: "Roof inspection",
  address: "120 NW 7th St, Miami, FL", startTime: now + startOffsetH * HOUR, endTime: now + (startOffsetH + 1) * HOUR,
  status: "confirmed", calendarProvider: "mock", createdAt: now, updatedAt: now, businessId: "demo-roofing", ...over,
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
    if (String(url).includes("/leads")) return json({ leads: [] });
    if (String(url).includes("/appointments")) {
      return json({ appointments: [
        appointment("a1", 12), appointment("a2", 36, { status: "requested" }),
        appointment("a3", 30, { status: "requested", pendingConfirmation: true }),
        appointment("a4", 60, { assignedCrewId: "crew1" }),
      ] });
    }
    return json({});
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Pipeline → Appointments tab", () => {
  it("lists upcoming appointments returned by the API (confirmed, requested, crew-assigned)", async () => {
    render(<PipelinePage />);
    await waitFor(() => expect(screen.queryByText(/No upcoming appointments/)).toBeNull());
    expect(await screen.findByText("Caller a1")).toBeTruthy();
    expect(screen.getByText("Caller a2")).toBeTruthy();
    expect(screen.getByText("Caller a4")).toBeTruthy();
    // the after-hours pending one is pulled up into "Needs Confirmation"
    expect(screen.getByText("Needs Confirmation")).toBeTruthy();
    expect(screen.getByText("Caller a3")).toBeTruthy();
  });
});
