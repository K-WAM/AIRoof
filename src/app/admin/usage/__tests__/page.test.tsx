// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AdminUsagePage from "../page";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          businesses: [
            {
              businessId: "demo-roofing",
              businessName: "Demo Roofing",
              industry: "roofing",
              active: true,
              vapiAssistantId: null,
              voiceProvider: "elevenlabs",
              elevenLabsAgentId: "agent_1",
              isDemo: true,
              calls: 3,
              leads: 1,
              appointments: 4,
              bookingCheck: { ok: true, checkedAt: Date.now(), problems: [], nextBusinessDay: "2026-09-29" },
            },
            {
              businessId: "biz-2",
              businessName: "Second Co",
              industry: "roofing",
              active: true,
              vapiAssistantId: null,
              voiceProvider: "elevenlabs",
              elevenLabsAgentId: "agent_2",
              isDemo: false,
              calls: 0,
              leads: 0,
              appointments: 0,
              bookingCheck: { ok: false, checkedAt: Date.now(), problems: ["Offered an overnight time (9 PM–7 AM): Tue, Sep 29 at 9:00 PM."], nextBusinessDay: "2026-09-29" },
            },
            {
              businessId: "biz-3",
              businessName: "Never Checked",
              industry: "roofing",
              active: true,
              vapiAssistantId: "asst_3",
              voiceProvider: "vapi",
              elevenLabsAgentId: null,
              isDemo: false,
              calls: 1,
              leads: 0,
              appointments: 0,
              bookingCheck: null,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
  ));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Admin Usage → Booking column", () => {
  it("renders the canary outcome per tenant, with the problem text inline", async () => {
    render(<AdminUsagePage />);

    await waitFor(() => expect(screen.getByText("Second Co")).toBeTruthy());

    expect(screen.getByText("Booking")).toBeTruthy();
    expect(screen.getByText("OK")).toBeTruthy();
    expect(screen.getByText("Check failed")).toBeTruthy();
    expect(screen.getByText(/Offered an overnight time/)).toBeTruthy();
    expect(screen.getByText("Not checked")).toBeTruthy();
  });
});
