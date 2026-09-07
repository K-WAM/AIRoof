// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuickAddButton } from "@/components/ui/QuickAddButton";
import { onQuickAddCreated } from "@/lib/events/quickAdd";
import { QuickAddProvider, useQuickAdd } from "../QuickAddContext";

const mockUser: { role?: string; superadmin?: boolean } = { role: "owner" };
const mockSearchParams = new URLSearchParams();
const disabledModules = new Set<string>();
const mockIsEnabled = vi.fn((module: string) => !disabledModules.has(module));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock("@/hooks/useBusinessId", () => ({
  useBusinessId: () => "demo-roofing",
}));

vi.mock("@/hooks/useBusinessModules", () => ({
  useBusinessModules: () => ({
    industry: "roofing",
    vocab: {
      jobNoun: "Job",
      jobNounPlural: "Jobs",
      customerNoun: "Customer",
      customerNounPlural: "Customers",
      resourceNoun: "Crew",
      resourceNounPlural: "Crews",
      voiceExample: "",
      jobTitlePlaceholder: "Shingle replacement",
      serviceTypePlaceholder: "Roof repair",
      resourcePlaceholder: "Crew A",
      materialPlaceholder: "Shingles",
      documentPlaceholder: "Warranty",
    },
    calendarMode: "jobs",
    family: null,
    disabledModules: [],
    ready: true,
    isEnabled: mockIsEnabled,
  }),
}));

function renderQuickAdd() {
  return render(
    <QuickAddProvider>
      <QuickAddButton />
    </QuickAddProvider>
  );
}

// Stands in for a BlockedAction card: calls open(kind, prefillName) directly,
// skipping the picker, the same way a "no price on file" tooltip would.
function OpenDirectly({ kind, prefillName }: { kind: "material"; prefillName?: string }) {
  const { open } = useQuickAdd();
  return <button type="button" onClick={() => open(kind, prefillName)}>Open directly</button>;
}

describe("QuickAdd", () => {
  beforeEach(() => {
    mockUser.role = "owner";
    mockUser.superadmin = undefined;
    disabledModules.clear();
    mockSearchParams.delete("preview");
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("opens the picker with every kind when jobs/pricing are enabled and the user is an owner", () => {
    renderQuickAdd();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New Job/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New Crew/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New material price/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Invite teammate/ })).toBeInTheDocument();
  });

  it("hides Job when the tenant's industry has the jobs module disabled", () => {
    disabledModules.add("jobs");
    renderQuickAdd();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.queryByRole("button", { name: /New Job/ })).not.toBeInTheDocument();
    // Crew/resource is universal — every industry needs it for its Calendar.
    expect(screen.getByRole("button", { name: /New Crew/ })).toBeInTheDocument();
    // pricing is a separate module — untouched by disabling jobs alone.
    expect(screen.getByRole("button", { name: /New material price/ })).toBeInTheDocument();
  });

  it("hides New material price when the tenant's industry has the pricing module disabled, independent of jobs", () => {
    disabledModules.add("pricing");
    renderQuickAdd();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.queryByRole("button", { name: /New material price/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New Job/ })).toBeInTheDocument();
  });

  it("hides Invite teammate for a non-owner, non-superadmin role", () => {
    mockUser.role = "staff";
    renderQuickAdd();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.queryByRole("button", { name: /Invite teammate/ })).not.toBeInTheDocument();
  });

  it("drills into the Crew form, submits, and shows a success state", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ crew: { crewId: "c1", name: "Crew A", color: "#000", active: true, createdAt: 0 } }),
    });
    const created = vi.fn();
    const unsubscribe = onQuickAddCreated(created);

    renderQuickAdd();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("button", { name: /New Crew/ }));

    expect(screen.getByRole("heading", { name: "New Crew" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Crew name/), { target: { value: "Crew A" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Crew" }));

    await waitFor(() => expect(screen.getByText(/added to your crews/i)).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/company/crews",
      expect.objectContaining({ method: "POST" })
    );
    expect(created).toHaveBeenCalledWith({ kind: "crew", id: "c1" });
    unsubscribe();
  });

  it("drills into the Material form, reads the current catalog, appends, and shows a success state", async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ library: { materials: [{ name: "Ridge cap", unit: "piece", unitPrice: 8.5 }] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    const created = vi.fn();
    const unsubscribe = onQuickAddCreated(created);

    renderQuickAdd();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("button", { name: /New material price/ }));

    expect(screen.getByRole("heading", { name: "New material price" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Material name/), { target: { value: "Architectural shingles" } });
    fireEvent.change(screen.getByLabelText(/Unit price/), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Add material" }));

    await waitFor(() => expect(screen.getByText(/added to your pricing catalog/i)).toBeInTheDocument());
    expect(global.fetch).toHaveBeenNthCalledWith(1, "/api/company/library?businessId=demo-roofing");
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/company/library",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          businessId: "demo-roofing",
          materials: [
            { name: "Ridge cap", unit: "piece", unitPrice: 8.5 },
            { name: "Architectural shingles", unit: "", unitPrice: 120 },
          ],
        }),
      })
    );
    expect(created).toHaveBeenCalledWith({ kind: "material" });
    unsubscribe();
  });

  it("prefills the Material form's name when opened directly (BlockedAction-style), skipping the picker", () => {
    render(
      <QuickAddProvider>
        <OpenDirectly kind="material" prefillName="2x4 lumber" />
      </QuickAddProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Open directly" }));

    expect(screen.getByRole("heading", { name: "New material price" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Material name/)).toHaveValue("2x4 lumber");
  });

  it("goes back to the menu from a form via the back button", () => {
    renderQuickAdd();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("button", { name: /New Crew/ }));
    expect(screen.getByRole("heading", { name: "New Crew" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to quick add menu" }));
    expect(screen.getByRole("heading", { name: "Quick add" })).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    renderQuickAdd();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
