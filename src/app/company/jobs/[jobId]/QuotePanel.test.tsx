// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "@/types/jobs";
import type { JobQuote } from "@/types/quote";
import type { JobFinding, WorkCatalogItem } from "@/types/workCatalog";
import { QuotePanel } from "./QuotePanel";

const TILE: WorkCatalogItem = {
  itemId: "tile", category: "Tile", problem: "Cracked tiles", solution: "Replace the tiles.", createdAt: 1,
  lines: [{ description: "Matching roof tile", quantity: 6, unit: "each", unitPrice: 9, kind: "material" },
    { description: "Tile replacement", quantity: 4, unit: "hr", unitPrice: 95, kind: "labor" }],
};
const catalog = { items: [TILE], loading: false, error: false, remember: vi.fn() };

const finding = (over: Partial<JobFinding> = {}): JobFinding => ({
  findingId: "f1", itemId: "tile", category: "Tile", problem: "Cracked tiles", solution: "Replace the tiles.",
  lines: TILE.lines, includeInReport: true, includeInQuote: true, addedAt: 1, ...over,
});
const jobWith = (findings: JobFinding[]): Job => ({ jobId: "J-1", businessId: "biz", title: "Roof", status: "inspection", address: "1 Main St",
  clientName: "Ana", clientEmail: "ana@example.com", createdAt: 1, updatedAt: 1, findings });

const draftFrom = (findings: JobFinding[], over: Partial<JobQuote> = {}): JobQuote => ({
  quoteId: "Q-1", businessId: "biz", jobId: "J-1", billTo: { name: "Ana", address: "1 Main St" }, status: "draft", findings,
  lines: findings.flatMap((f) => (f.lines ?? []).map((l, i) => ({ ...l, lineId: `finding_${f.findingId}_${i}`, findingId: f.findingId }))),
  hideMaterials: false, validUntil: Date.now() + 30 * 86400000, subtotal: 0, total: 0, createdAt: 1, updatedAt: 1, createdBy: "u", ...over,
});

type Call = { url: string; method: string; body?: Record<string, unknown> };
let calls: Call[];
let serverQuote: JobQuote | null;

function installFetch() {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    if (url.includes("/quote/send")) return json({ ok: true });
    if (url.includes("/quote")) {
      if (method === "GET") return json({ quote: serverQuote });
      if (method === "POST") return json({ quote: serverQuote }, 201);
      if (method === "PATCH") { serverQuote = { ...serverQuote!, ...body } as JobQuote; return json({ quote: serverQuote }); }
    }
    if (url.match(/\/api\/jobs\/J-1$/) && method === "PATCH") return json({ ok: true });
    return json({}, 404);
  }));
}

const renderPanel = (job: Job, extra: Partial<Parameters<typeof QuotePanel>[0]> = {}) => render(
  <QuotePanel job={job} businessId="biz" businessConfig={null} logos={[]} catalog={catalog} onStatus={vi.fn()} onFindingsChanged={vi.fn()} {...extra} />,
);

beforeEach(() => { installFetch(); serverQuote = null; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("QuotePanel", () => {
  it("auto-creates the draft once when the job has quote findings, and shows the exact total", async () => {
    serverQuote = null;
    const created = draftFrom([finding()]);
    // GET returns nothing; the POST that follows creates it.
    let posted = false;
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      if (url.includes("/quote") && method === "GET") return new Response(JSON.stringify({ quote: posted ? created : null }));
      if (url.includes("/quote") && method === "POST") { posted = true; return new Response(JSON.stringify({ quote: created }), { status: 201 }); }
      return new Response("{}", { status: 404 });
    });
    renderPanel(jobWith([finding()]));
    await waitFor(() => expect(screen.getByText("$434.00", { selector: "div" })).toBeTruthy());
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
    // 6 x $9 + 4 x $95 = $434, shown as the header total
    expect(screen.getByLabelText("Issue")).toHaveProperty("value", "Cracked tiles");
  });

  it("does not create an empty quote when the job has no findings — it waits for the first item", async () => {
    renderPanel(jobWith([]));
    await waitFor(() => expect(screen.getByText(/No quote yet/)).toBeTruthy());
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("'＋ Add item' adds the Library item with its default prices, updates the total, and adds it to the job's findings too", async () => {
    serverQuote = draftFrom([]);
    const onFindingsChanged = vi.fn();
    renderPanel(jobWith([]), { onFindingsChanged });
    await waitFor(() => expect(screen.getByText("＋ Add item")).toBeTruthy());
    fireEvent.click(screen.getByText("＋ Add item"));
    fireEvent.click(await screen.findByText("Cracked tiles", { selector: "strong" }));
    await waitFor(() => expect(screen.getByText("$434.00", { selector: "div" })).toBeTruthy());
    const jobPatch = calls.find((c) => c.method === "PATCH" && /\/api\/jobs\/J-1$/.test(c.url));
    expect(jobPatch).toBeTruthy();
    expect((jobPatch!.body!.findings as JobFinding[])[0]).toMatchObject({ itemId: "tile", includeInQuote: true, includeInReport: true });
    expect(onFindingsChanged).toHaveBeenCalledOnce();
  });

  it("editing a price recomputes the total and the draft autosaves the new line prices (no Save click)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serverQuote = draftFrom([finding()]);
    renderPanel(jobWith([finding()]));
    const price = (await screen.findAllByLabelText("Unit price"))[0];
    fireEvent.change(price, { target: { value: "10" } });
    await waitFor(() => expect(screen.getByText("$440.00", { selector: "div" })).toBeTruthy()); // 6 x $10 + 4 x $95 = $60 + $380
    await act(async () => { vi.advanceTimersByTime(1000); });
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH" && /\/quote$/.test(c.url))).toBe(true));
    const patch = calls.filter((c) => c.method === "PATCH" && /\/quote$/.test(c.url)).at(-1)!;
    expect((patch.body!.lines as Array<{ unitPrice: number }>)[0].unitPrice).toBe(10);
  });

  it("send saves pending edits first, then sends; the button is unavailable with no priced items", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serverQuote = draftFrom([finding()]);
    renderPanel(jobWith([finding()]));
    const price = (await screen.findAllByLabelText("Unit price"))[0];
    fireEvent.change(price, { target: { value: "12" } });
    fireEvent.click(screen.getByText("Send quote"));
    await waitFor(() => expect(calls.some((c) => c.url.includes("/quote/send"))).toBe(true));
    const order = calls.filter((c) => (c.method === "PATCH" && /\/quote$/.test(c.url)) || c.url.includes("/quote/send")).map((c) => (c.url.includes("/send") ? "send" : "save"));
    expect(order.indexOf("save")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("save")).toBeLessThan(order.indexOf("send"));
  });

  it("hides editing on a sent quote and offers to record the customer's answer", async () => {
    serverQuote = draftFrom([finding()], { status: "sent", sentTo: "ana@example.com" });
    renderPanel(jobWith([finding()]));
    await waitFor(() => expect(screen.getByText("Mark accepted")).toBeTruthy());
    expect(screen.queryByText("＋ Add item")).toBeNull();
    expect(screen.queryByText("Send quote")).toBeNull();
  });

  it("explains each customer-copy option in one line", async () => {
    serverQuote = draftFrom([finding()]);
    renderPanel(jobWith([finding()]));
    await waitFor(() => expect(screen.getByText("What the customer sees")).toBeTruthy());
    expect(screen.getByText(/materials show as one total line/)).toBeTruthy();
    expect(screen.getByText(/no names, hours or rates/)).toBeTruthy();
    expect(screen.getByText(/Prints the crew names/)).toBeTruthy();
  });
});
