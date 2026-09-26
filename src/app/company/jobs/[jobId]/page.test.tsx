// @vitest-environment jsdom
// Whole-page structure test for the job detail page: the tab bar, the header's one primary action, the newest-first Activity
// tab (Field updates only there), Issues merged into Findings, and the "locked" notes. Everything the page fetches is mocked.
import { Suspense } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/useBusinessId", () => ({ useBusinessId: () => "biz" }));
vi.mock("@/hooks/useLiveRefresh", () => ({ useLiveRefresh: () => undefined }));
vi.mock("@/contexts/QuickAddContext", () => ({ useQuickAdd: () => ({ open: vi.fn() }) }));
vi.mock("@/lib/events/quickAdd", () => ({ useQuickAddRefresh: () => undefined }));
vi.mock("@/hooks/useWorkCatalog", () => ({ useWorkCatalog: () => ({ items: [], loading: false, error: false, remember: () => undefined }) }));
vi.mock("@/hooks/useFormat", () => ({
  useFormat: () => {
    const day = (ms?: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : "");
    const time = (ms?: number | null) => (ms ? new Date(ms).toISOString().slice(11, 16) : "");
    return { tz: "UTC", fmtDay: day, fmtTime: time, fmtDate: day, fmtDayTime: (ms?: number | null) => `${day(ms)} ${time(ms)}`, dayKey: day };
  },
}));

import JobDetailPage from "./page";

const T = Date.UTC(2026, 8, 25, 14, 0);
const finding = { findingId: "f1", category: "Leaks", problem: "Standing water on the low-slope section", solution: "Re-level and re-flash.", includeInReport: true, includeInQuote: true, addedAt: T };
const baseJob = {
  jobId: "J-1", businessId: "biz", title: "Cracked shingle repair", status: "quoted", createdAt: T, updatedAt: T, quoteId: "Q-1000",
  clientName: "Kareem", sourceCallId: "call_1", findings: [finding],
  parsed: {
    timeline: [{ time: "8:00 AM", description: "Arrived at the job site" }, { time: "10:00 AM", description: "Started tear-off" }],
    materials: [], labor: [], invoiceSuggestions: [],
    issues: [{ description: "Ponding water after rain", severity: "high" }],
  },
};
const updates = [
  { updateId: "u1", kind: "normal", rawText: "Arrived, started work", createdAt: T + 1000, submittedBy: "Kevin", parsed: { timeline: [], materials: [], labor: [], issues: [], invoiceSuggestions: [] } },
  { updateId: "u2", kind: "normal", rawText: "Used eleven vacuum cleaners", createdAt: T + 2000, submittedBy: "Kevin", parseError: "schema failed" },
];
const quote = { quoteId: "Q-1000", businessId: "biz", jobId: "J-1", status: "accepted", sentAt: T, answeredAt: T + 5000, lines: [], findings: [], billTo: { name: "Kareem" }, hideMaterials: false, validUntil: T + 1e9, subtotal: 0, total: 0, createdAt: T, updatedAt: T, createdBy: "u" };

let job: Record<string, unknown>;
beforeEach(() => {
  job = { ...baseJob };
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = String(input);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (url.startsWith("/api/jobs/J-1/updates")) return json({ updates });
    if (url.startsWith("/api/jobs/J-1/quote")) return json({ quote });
    if (url.startsWith("/api/jobs/J-1/history")) return json({ events: [] });
    if (url.startsWith("/api/jobs/J-1/invoice")) return json({ invoice: null });
    if (url.startsWith("/api/jobs/J-1?")) return json({ job });
    if (url.startsWith("/api/company/settings")) return json({ businessName: "Roofdoctor South Florida" });
    if (url.startsWith("/api/company/library/logos")) return json({ logos: [] });
    if (url.startsWith("/api/company/library")) return json({ library: { materials: [], laborRates: [] } });
    return new Response("{}", { status: 404 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// React's use() reads an already-fulfilled thenable synchronously, so the page renders without a Suspense round trip.
const params = () => Object.assign(Promise.resolve({ jobId: "J-1" }), { status: "fulfilled", value: { jobId: "J-1" } }) as Promise<{ jobId: string }>;
async function openPage() {
  render(<Suspense fallback={null}><JobDetailPage params={params()} /></Suspense>);
  await screen.findByText("Cracked shingle repair");
}
const tabs = () => Array.from(document.querySelectorAll(".job-tabs .job-tab")).map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim());

describe("job detail page structure", () => {
  it("has plain record tabs on the left and the four numbered workflow tabs on the right — no Issues tab", async () => {
    await openPage();
    await waitFor(() => expect(tabs().some((t) => t.includes("Accepted"))).toBe(true)); // the Quote pill learns its status without opening the tab
    const all = tabs();
    expect(all[0]).toBe("Activity (2)");
    expect(all.slice(1, 4)).toEqual(["Photos", "Materials (0)", "Labor (0)"]);
    expect(all.slice(4).map((t) => t.replace(/\s*✓|\s*Accepted/g, ""))).toEqual(["① Findings", "② Quote", "③ Report", "④ Invoice"]);
    expect(all.some((t) => /^Issues/.test(t))).toBe(false);
    expect(all[4]).toContain("✓"); // findings are done
  });

  it("the header has ONE primary action: Mark work complete (office-only) at the Work step, and no Generate buttons", async () => {
    await openPage();
    expect(screen.getByText("Mark work complete")).toBeTruthy();
    expect(screen.queryByText(/Generate Report/)).toBeNull();
    expect(screen.queryByText(/Generate Invoice/)).toBeNull();
    expect(screen.queryByText(/Every step is done/)).toBeNull();
  });

  it("Activity shows the field updates newest first, and the field updates appear on no other tab", async () => {
    await openPage();
    const text = document.body.textContent ?? "";
    expect(text).toContain("Field updates (2)");
    expect(text.indexOf("Update 2")).toBeLessThan(text.indexOf("Update 1"));
    // The work log is also newest first, and keeps its own numbering.
    expect(text.indexOf("Started tear-off")).toBeLessThan(text.indexOf("Arrived at the job site"));
    fireEvent.click(screen.getByText("Photos"));
    expect(screen.queryByText(/Field updates \(/)).toBeNull();
    fireEvent.click(screen.getByText("Materials (0)"));
    expect(screen.queryByText(/Field updates \(/)).toBeNull();
  });

  it("Findings carries what the crew reported, and the locked-quote note shows on the record tabs", async () => {
    await openPage();
    await waitFor(() => expect(tabs().some((t) => t.includes("Accepted"))).toBe(true));
    fireEvent.click(screen.getByText(/① Findings/));
    const crew = await screen.findByRole("region", { name: /Reported by crew/ });
    expect(within(crew).getByText(/Ponding water after rain/)).toBeTruthy();
    expect(screen.getByRole("article", { name: "Finding 1" })).toBeTruthy();
    expect(screen.getByText(/Quote Q-1000 was accepted on 2026-09-25\. It is locked/)).toBeTruthy();
    fireEvent.click(screen.getByText("Labor (0)"));
    expect(screen.getByText(/Quote Q-1000 was accepted/)).toBeTruthy();
  });

  it("the Invoice tab offers Create invoice (never auto-creates) and Next opens the right tab once work is complete", async () => {
    job = { ...baseJob, status: "complete" };
    await openPage();
    fireEvent.click(screen.getByText("Next: Report", { exact: false }));
    expect(tabs().some((t) => t.startsWith("③ Report"))).toBe(true);
    fireEvent.click(screen.getByText(/④ Invoice/));
    expect(await screen.findByText("Create invoice")).toBeTruthy();
    expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST")).toBe(false);
  });
});
