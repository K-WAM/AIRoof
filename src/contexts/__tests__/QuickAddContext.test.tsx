// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuickAddButton } from "@/components/ui/QuickAddButton";
import { onQuickAddCreated } from "@/lib/events/quickAdd";
import { QuickAddProvider } from "../QuickAddContext";

const mockUser: { role?: string; superadmin?: boolean } = { role: "owner" };
const mockSearchParams = new URLSearchParams();
const mockIsEnabled = vi.fn(() => true);

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

describe("QuickAdd", () => {
  beforeEach(() => {
    mockUser.role = "owner";
    mockUser.superadmin = undefined;
    mockIsEnabled.mockReturnValue(true);
    mockSearchParams.delete("preview");
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("opens the picker with every kind when jobs are enabled and the user is an owner", () => {
    renderQuickAdd();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New Job/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New Crew/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Invite teammate/ })).toBeInTheDocument();
  });

  it("hides Job when the tenant's industry has the jobs module disabled", () => {
    mockIsEnabled.mockReturnValue(false);
    renderQuickAdd();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.queryByRole("button", { name: /New Job/ })).not.toBeInTheDocument();
    // Crew/resource is universal — every industry needs it for its Calendar.
    expect(screen.getByRole("button", { name: /New Crew/ })).toBeInTheDocument();
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
