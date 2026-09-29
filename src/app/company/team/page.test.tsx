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
let roster: typeof members;
let patchError: string | null;
let calls: Array<{ url: string; method: string; body?: Record<string, unknown> }>;

beforeEach(() => {
  roster = members;
  patchError = null;
  calls = [];
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
  vi.stubGlobal("confirm", vi.fn(() => true));
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET", ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
    if (patchError && init?.method === "PATCH") return new Response(JSON.stringify({ error: patchError }), { status: 409 });
    return new Response(JSON.stringify(url.includes("/api/company/team?") ? { members: roster, seatLimit: 5 } : { ok: true }), { status: 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Team page", () => {
  it("shows the required member fields and disables a member", async () => {
    render(<TeamPage />);
    expect(await screen.findByText("alex@example.com")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("region", { name: "Team members" })).toBeTruthy();
    expect(screen.getByText("1 of 5 seats in use")).toBeTruthy();
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    expect(screen.getByText("Role")).toBeTruthy();
    expect(screen.queryByLabelText("Title for alex@example.com")).toBeNull();
    expect(screen.queryByText("Lock")).toBeNull();
    expect(screen.queryByText("Resend invite")).toBeNull();
    fireEvent.click(screen.getByText("Disable access"));
    await waitFor(() => expect(calls).toContainEqual({ url: "/api/company/team/u1", method: "PATCH", body: { businessId: "biz", active: false } }));
  });

  it("offers one Role per person with the server-aligned description in the invite form", async () => {
    render(<TeamPage />);
    await screen.findByText("alex@example.com");
    fireEvent.click(screen.getByText("Invite person"));
    const select = screen.getByLabelText("Invite role") as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.text)).toEqual(["Admin", "Office staff", "Inspector", "Technician", "View only"]);
    expect(select.value).toBe("office");
    fireEvent.change(select, { target: { value: "inspector" } });
    expect(screen.getByText(/their own schedule/)).toBeTruthy();
  });

  it("making someone an Inspector sends the field-only role and the Inspector title together", async () => {
    render(<TeamPage />);
    await screen.findByText("alex@example.com");
    fireEvent.click(screen.getByText("Change role"));
    fireEvent.change(screen.getByLabelText("Role for alex@example.com"), { target: { value: "inspector" } });
    expect(screen.getByText(/Changing Alex from Office staff to Inspector/)).toBeTruthy();
    fireEvent.click(screen.getByText("Save role"));
    await waitFor(() => expect(calls).toContainEqual({ url: "/api/company/team/u1", method: "PATCH", body: { businessId: "biz", role: "crew", trade: "inspector" } }));
  });

  it("confirms before revoking every field QR link", async () => {
    render(<TeamPage />);
    await screen.findByText("alex@example.com");
    fireEvent.click(screen.getByText("Revoke all field QR links"));
    expect(window.confirm).toHaveBeenCalledOnce();
    await waitFor(() => expect(calls.some((call) => call.url === "/api/company/team/revoke-field-links" && call.method === "POST")).toBe(true));
  });

  it("offers invited and disabled actions with state-specific words", async () => {
    roster = [
      { ...members[0], uid: "u2", email: "invited@example.com", active: true, status: "Invited", lastSignInTime: "" },
      { ...members[0], uid: "u3", email: "disabled@example.com", active: false, status: "Locked" },
    ];
    render(<TeamPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Invited 1/ }));
    expect(screen.getByText("invited@example.com")).toBeTruthy();
    fireEvent.click(screen.getByText("Resend invite"));
    await waitFor(() => expect(calls.some((call) => call.url === "/api/company/team/u2/resend")).toBe(true));
    fireEvent.click(screen.getByText("Cancel invite"));
    await waitFor(() => expect(calls).toContainEqual({ url: "/api/company/team/u2", method: "PATCH", body: { businessId: "biz", active: false } }));
    fireEvent.click(screen.getByRole("button", { name: /Disabled 1/ }));
    expect(screen.getByText("disabled@example.com")).toBeTruthy();
    fireEvent.click(screen.getByText("Re-enable"));
    await waitFor(() => expect(calls).toContainEqual({ url: "/api/company/team/u3", method: "PATCH", body: { businessId: "biz", active: true } }));
  });

  it("shows a server refusal beside the member action", async () => {
    patchError = "The last active admin cannot be changed.";
    render(<TeamPage />);
    await screen.findByText("alex@example.com");
    fireEvent.click(screen.getByText("Change role"));
    fireEvent.change(screen.getByLabelText("Role for alex@example.com"), { target: { value: "admin" } });
    fireEvent.click(screen.getByText("Save role"));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", patchError);
  });
});
