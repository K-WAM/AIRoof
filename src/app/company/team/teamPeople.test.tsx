// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let viewAs = false;
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "me", role: "owner", ...(viewAs ? { viewAs: {} } : {}) }, loading: false }) }));
vi.mock("@/hooks/useBusinessId", () => ({ useBusinessId: () => "biz" }));
vi.mock("@/lib/events/quickAdd", () => ({ useQuickAddRefresh: () => undefined }));

import TeamPage from "./page";

const prov = { origin: "client", source: "jobba", addedAt: 1 };
const members = [{ uid: "me", email: "owner@example.com", displayName: "Olive Owner", role: "owner", active: true, status: "Active", lastSignInTime: "2026-09-25T12:00:00Z", createdAt: 1000 }];
const staff = [
  { staffId: "s1", name: "Tyler Foreman", position: "Foreman", email: "tyler@example.com", userType: "foreman", crewId: "c1", crewLead: true, crewProvenance: { origin: "luxor-sample", source: "x", addedAt: 1 }, active: true, provenance: prov },
  { staffId: "s2", name: "Olive Owner", position: "Owner", active: true, provenance: prov },
];
const crews = [{ crewId: "c1", name: "Tyler Crew", color: "#111", active: true, createdAt: 1 }];
let calls: Array<{ url: string; method: string }>;

beforeEach(() => {
  viewAs = false;
  calls = [];
  vi.stubGlobal("confirm", vi.fn(() => true));
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET" });
    const body = url.includes("/api/company/team?") ? { members, seatLimit: 5 }
      : url.includes("/api/company/staff?") ? { staff }
      : url.includes("/api/company/crews") ? { crews } : { ok: true };
    return new Response(JSON.stringify(body), { status: 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Team page: Your team", () => {
  it("merges the login and the staff record of the same person and tags a sample crew", async () => {
    render(<TeamPage />);
    const region = await screen.findByRole("region", { name: "Your team" });
    expect(within(region).getByText("Your team (2)")).toBeTruthy();
    expect(within(region).getAllByText("Olive Owner")).toHaveLength(1);
    expect(within(region).getByText("Not invited yet")).toBeTruthy();
    expect(within(region).getByText("Lead")).toBeTruthy();
    expect(within(region).getByText("Example")).toBeTruthy();
  });

  it("Invite to the app opens the invite form filled in and sends nothing", async () => {
    render(<TeamPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Tyler Foreman" }));
    fireEvent.click(await screen.findByRole("button", { name: "Invite to the app" }));
    await waitFor(() => expect((screen.getByLabelText("Invite email") as HTMLInputElement).value).toBe("tyler@example.com"));
    expect((screen.getByLabelText("Invite name") as HTMLInputElement).value).toBe("Tyler Foreman");
    expect((screen.getByLabelText("Invite role") as HTMLSelectElement).value).toBe("foreman");
    expect(calls.filter((call) => call.method !== "GET")).toEqual([]);
  });

  it("opens read-only in View as", async () => {
    viewAs = true;
    render(<TeamPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Tyler Foreman" }));
    expect(await screen.findByText(/Changes are turned off/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Invite to the app" })).toBeNull();
  });
});
