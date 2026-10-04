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
              usage: { users: 3, calls: 3, phoneMinutes: 9, voiceNotes: 2, voiceNoteMinutes: 1.5, typedNotes: 1 },
              cost: { phone: 0.9, ai: 0.04, total: 0.94 },
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
              usage: { users: 1, calls: 0, phoneMinutes: 0, voiceNotes: 0, voiceNoteMinutes: 0, typedNotes: 0 },
              cost: { phone: 0, ai: 0, total: 0 },
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
              usage: { users: 2, calls: 1, phoneMinutes: 2, voiceNotes: 0, voiceNoteMinutes: 0, typedNotes: 0 },
              cost: { phone: 0.24, ai: 0, total: 0.24 },
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

describe("Admin Usage & costs", () => {
  it("shows each client's month: calls, minutes, notes and estimated cost, plus a status a person can act on", async () => {
    render(<AdminUsagePage />);
    await waitFor(() => expect(screen.getByText("Second Co")).toBeTruthy());
    expect(screen.getByText("Usage & costs")).toBeTruthy();
    expect(screen.getByText("$1.18")).toBeTruthy(); // total estimated cost across clients
    expect(screen.getByText("3 calls · 9 min · 3 notes · $0.94")).toBeTruthy();
    expect(screen.getByText("Demo")).toBeTruthy();
    expect(screen.getByText("Booking check failed").getAttribute("title")).toMatch(/Offered an overnight time/);
    expect(screen.getByText("Live")).toBeTruthy();
  });
});
