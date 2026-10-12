// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "@/types/jobs";
import type { WorkCatalogItem } from "@/types/workCatalog";
import { FindingsPanel, type CatalogState } from "./FindingsPanel";

const item: WorkCatalogItem = { itemId: "starter-roofing-tile", category: "Tile", problem: "Broken or slipped tiles", solution: "Replace the damaged tiles.", severity: "medium", createdAt: 1 };
const catalog: CatalogState = { items: [item], loading: false, error: false, remember: () => undefined };
const job = (over: Partial<Job> = {}): Job => ({
  jobId: "J-1", businessId: "biz", title: "Roof repair", status: "in_progress", createdAt: 1, updatedAt: 1,
  parsed: { timeline: [], materials: [], labor: [], invoiceSuggestions: [], issues: [
    { description: "Six tiles are broken near the ridge", severity: "high" },
    { description: "Gutter is sagging at the back corner", severity: "low", resolution: "Re-hang the gutter." },
  ] },
  ...over,
});

beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("FindingsPanel — Reported by crew", () => {
  it("adds every selected Library finding in one save", async () => {
    const items: WorkCatalogItem[] = [item,
      { ...item, itemId: "flashing", problem: "Failed flashing" },
      { ...item, itemId: "drain", problem: "Blocked drain" }];
    const onSaved = vi.fn();
    render(<FindingsPanel job={job({ parsed: undefined })} businessId="biz" catalog={{ ...catalog, items }} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: /Add from Library/ }));
    const dialog = screen.getByRole("dialog", { name: /Add a finding from the Library/ });
    for (const choice of ["Broken or slipped tiles", "Failed flashing", "Blocked drain"]) {
      fireEvent.click(within(dialog).getByRole("button", { name: new RegExp(choice) }));
    }
    fireEvent.click(within(dialog).getByRole("button", { name: "Add 3 findings" }));
    expect(screen.getByText("On this job (3)")).toBeTruthy();
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.arrayContaining(items.map((catalogItem) => expect.objectContaining({ itemId: catalogItem.itemId })))), { timeout: 2500 });
    expect(JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string).findings).toHaveLength(3);
  });
  it("lists what the crew reported, with a Library match when there is one and a one-off when there isn't", () => {
    render(<FindingsPanel job={job()} businessId="biz" catalog={catalog} onSaved={vi.fn()} />);
    const section = screen.getByRole("region", { name: /Reported by crew/ });
    expect(within(section).getByText("Reported by crew (2)")).toBeTruthy();
    expect(within(section).getByText(/Six tiles are broken near the ridge/)).toBeTruthy();
    expect(within(section).getByText("＋ Add Library fix")).toBeTruthy(); // tile issue matches the Library item
    expect(within(section).getByText("＋ Add as finding")).toBeTruthy();    // gutter issue has no match
  });

  it("adding each issue creates a numbered finding and flips its row to Added", () => {
    const onSaved = vi.fn();
    render(<FindingsPanel job={job()} businessId="biz" catalog={catalog} onSaved={onSaved} />);
    fireEvent.click(screen.getByText("＋ Add Library fix"));
    expect(screen.getByRole("article", { name: "Finding 1" })).toBeTruthy();
    expect(screen.getByText("On this job (1)")).toBeTruthy();
    expect(screen.getAllByText("Added ✓")).toHaveLength(1);

    fireEvent.click(screen.getByText("＋ Add as finding"));
    expect(screen.getByRole("article", { name: "Finding 2" })).toBeTruthy();
    expect(screen.getAllByText("Added ✓")).toHaveLength(2);
    const second = screen.getByRole("article", { name: "Finding 2" });
    expect((within(second).getByLabelText("Finding problem") as HTMLTextAreaElement).value).toBe("Gutter is sagging at the back corner");
    expect((within(second).getByLabelText("Finding solution") as HTMLTextAreaElement).value).toBe("Re-hang the gutter.");
  });

  it("does not add the same issue twice, and shows nothing when the crew reported nothing", () => {
    const { rerender } = render(<FindingsPanel job={job()} businessId="biz" catalog={catalog} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByText("＋ Add as finding"));
    expect(screen.queryByText("＋ Add as finding")).toBeNull();
    expect(screen.getAllByRole("article")).toHaveLength(1);
    rerender(<FindingsPanel job={job({ parsed: undefined })} businessId="biz" catalog={catalog} onSaved={vi.fn()} />);
    expect(screen.queryByRole("region", { name: /Reported by crew/ })).toBeNull();
  });

  it("shows an existing finding as a numbered card even when no issue produced it", () => {
    const existing = { findingId: "f1", category: "Custom", problem: "Skylight lens cracked", solution: "Replace the lens.", includeInReport: true, includeInQuote: true, addedAt: 1 };
    render(<FindingsPanel job={job({ parsed: undefined, findings: [existing] })} businessId="biz" catalog={catalog} onSaved={vi.fn()} />);
    expect(screen.getByRole("article", { name: "Finding 1" })).toBeTruthy();
  });
});
