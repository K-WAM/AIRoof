// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { role: "owner" }, loading: false }) }));
vi.mock("@/hooks/useBusinessId", () => ({ useBusinessId: () => "biz" }));
vi.mock("@/lib/events/quickAdd", () => ({ useQuickAddRefresh: () => undefined }));

import TeamPage from "./page";

const members = [
  { uid: "u1", email: "alex@example.com", displayName: "Alex", role: "staff", trade: "technician", active: true, status: "Active", lastSignInTime: "2026-09-25T12:00:00Z", createdAt: 1000 },
];
let calls: Array<{ url: string; method: string; body?: Record<string, unknown> }>;

beforeEach(() => {
  calls = [];
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
  vi.stubGlobal("confirm", vi.fn(() => true));
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET", ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
    return new Response(JSON.stringify(url.includes("/api/company/team?") ? { members, seatLimit: 5 } : { ok: true }), { status: 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Team page", () => {
  it("shows the required member fields and disables a member", async () => {
    render(<TeamPage />);
    expect(await screen.findByText("alex@example.com")).toBeTruthy();
    const table = screen.getByRole("table");
    expect(table.parentElement?.style.overflowX).toBe("auto");
    expect(parseInt(table.style.minWidth, 10)).toBeGreaterThan(window.innerWidth);
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByLabelText("Type for alex@example.com")).toBeTruthy();
    expect(screen.queryByLabelText("Title for alex@example.com")).toBeNull();
    // "Lock" was renamed (owner, 2026-09-28: "why can't users be disabled from here?") — same PATCH active:false.
    expect(screen.queryByText("Lock")).toBeNull();
    // Signed in already, so no "Resend invite".
    expect(screen.queryByText("Resend invite")).toBeNull();
    fireEvent.click(screen.getByText("Disable"));
    await waitFor(() => expect(calls.some((call) => call.url === "/api/company/team/u1" && call.method === "PATCH")).toBe(true));
  });

  it("offers one Type per person and explains each from the ⓘ (owner, 2026-09-28)", async () => {
    render(<TeamPage />);
    await screen.findByText("alex@example.com");
    const select = screen.getByLabelText("Type for alex@example.com") as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.text)).toEqual(["Admin", "Office staff", "Inspector", "Technician", "View only"]);
    // A Staff member titled Technician is Office staff — what they can do comes from the role.
    expect(select.value).toBe("office");
    fireEvent.click(screen.getAllByLabelText("What each type can do")[0]);
    expect(screen.getByText(/their own schedule/)).toBeTruthy();
    expect(screen.getByText(/QR code instead/)).toBeTruthy();
  });

  it("making someone an Inspector sends the field-only role and the Inspector title together", async () => {
    render(<TeamPage />);
    await screen.findByText("alex@example.com");
    fireEvent.change(screen.getByLabelText("Type for alex@example.com"), { target: { value: "inspector" } });
    await waitFor(() => expect(calls).toContainEqual({ url: "/api/company/team/u1", method: "PATCH", body: { businessId: "biz", role: "crew", trade: "inspector" } }));
  });

  it("confirms before revoking every field QR link", async () => {
    render(<TeamPage />);
    await screen.findByText("alex@example.com");
    fireEvent.click(screen.getByText("Revoke all field QR links"));
    expect(window.confirm).toHaveBeenCalledOnce();
    await waitFor(() => expect(calls.some((call) => call.url === "/api/company/team/revoke-field-links" && call.method === "POST")).toBe(true));
  });
});
