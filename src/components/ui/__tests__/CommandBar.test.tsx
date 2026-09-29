// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const routerPush = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: routerPush }),
}));
vi.mock("@/hooks/useBusinessId", () => ({ useBusinessId: () => "biz-1" }));

import { CommandBar } from "../CommandBar";

function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function stubData(overrides: Partial<{ leads: unknown[]; jobs: unknown[]; appts: unknown[]; customers: unknown[] }> = {}) {
  const fetchMock = vi.fn(async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/leads")) {
      return ok({ leads: overrides.leads ?? [{ leadId: "L1", callerName: "Alice", serviceRequested: "Roof leak", status: "new" }] });
    }
    if (u.includes("/api/jobs")) {
      return ok({ jobs: overrides.jobs ?? [{ jobId: "J-1", title: "Fix roof", clientName: "Bob" }] });
    }
    if (u.includes("/appointments")) {
      return ok({ appointments: overrides.appts ?? [{ appointmentId: "A1", callerName: "Carol", serviceType: "Inspection" }] });
    }
    if (u.includes("/customers")) {
      return ok({ customers: overrides.customers ?? [{ customerId: "C1", name: "Dave", phone: "555", jobCount: 2 }] });
    }
    return ok({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function openBar() {
  render(<CommandBar />);
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  await screen.findByRole("dialog");
  return screen.getByRole("combobox", { name: /Search calls, requests, jobs and customers/ });
}

describe("CommandBar (T-158)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    routerPush.mockReset();
  });

  it("opens on Ctrl+K and focuses the labelled combobox", async () => {
    stubData();
    const input = await openBar();
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls");
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    stubData();
    render(<CommandBar />);
    const trigger = screen.getByRole("button", { name: "Search" });
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByRole("dialog");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps Tab and Shift+Tab inside the dialog", async () => {
    stubData();
    const input = await openBar();
    fireEvent.change(input, { target: { value: "alice" } });
    const clear = screen.getByRole("button", { name: "Clear search" });

    clear.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(input).toHaveFocus();

    input.focus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(clear).toHaveFocus();
  });

  it("moves with ↑/↓ and Enter navigates with router.push", async () => {
    stubData({
      leads: [
        { leadId: "L1", callerName: "Alice", serviceRequested: "A", status: "new" },
        { leadId: "L2", callerName: "Alan", serviceRequested: "B", status: "new" },
      ],
    });
    const input = await openBar();
    fireEvent.change(input, { target: { value: "al" } });

    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(routerPush).toHaveBeenCalledWith("/company/pipeline?tab=leads&lead=L2");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("distinguishes no matches from a failed search", async () => {
    stubData({ leads: [], jobs: [], appts: [], customers: [] });
    const input = await openBar();
    fireEvent.change(input, { target: { value: "zzz" } });
    await waitFor(() => expect(screen.getByText(/No matches for/)).toBeInTheDocument());
    expect(screen.queryByText("Search failed")).not.toBeInTheDocument();
  });

  it("shows Search failed + Retry on a fetch failure and refetches on retry", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    await openBar();

    await waitFor(() => expect(screen.getByText("Search failed")).toBeInTheDocument());
    const retry = screen.getByRole("button", { name: "Retry" });
    const callsBefore = fetchMock.mock.calls.length;

    fireEvent.click(retry);
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore));
  });
});
