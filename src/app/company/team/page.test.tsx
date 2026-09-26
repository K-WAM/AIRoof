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
let calls: Array<{ url: string; method: string }>;

beforeEach(() => {
  calls = [];
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
  vi.stubGlobal("confirm", vi.fn(() => true));
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET" });
    return new Response(JSON.stringify(url.includes("/api/company/team?") ? { members, seatLimit: 5 } : { ok: true }), { status: 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Team page", () => {
  it("shows the required member fields and locks a member", async () => {
    render(<TeamPage />);
    expect(await screen.findByText("alex@example.com")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByLabelText("Role for alex@example.com")).toBeTruthy();
    expect(screen.getByLabelText("Title for alex@example.com")).toBeTruthy();
    fireEvent.click(screen.getByText("Lock"));
    await waitFor(() => expect(calls).toContainEqual({ url: "/api/company/team/u1", method: "PATCH" }));
  });

  it("confirms before revoking every field QR link", async () => {
    render(<TeamPage />);
    await screen.findByText("alex@example.com");
    fireEvent.click(screen.getByText("Revoke all field QR links"));
    expect(window.confirm).toHaveBeenCalledOnce();
    await waitFor(() => expect(calls).toContainEqual({ url: "/api/company/team/revoke-field-links", method: "POST" }));
  });
});
