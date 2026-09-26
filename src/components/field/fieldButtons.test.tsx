// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FieldFindingsButton } from "./FindingPickerSheet";

type Call = { url: string; method: string; body?: Record<string, unknown> };
let calls: Call[];

beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    if (url.includes("/findings") && method === "GET") {
      return json({ items: [{ itemId: "tile", category: "Tile", problem: "Cracked tiles", solution: "Replace them." },
        { itemId: "boot", category: "Flashing", problem: "Split pipe boot", solution: "Replace the boot." }],
        findings: [{ findingId: "f1", itemId: "boot", problem: "Split pipe boot" }] });
    }
    if (url.includes("/findings") && method === "POST") return json({ finding: { findingId: "f2", itemId: "tile" }, added: true }, 201);
    return json({}, 404);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("FieldFindingsButton", () => {
  it("lists Library items by name, marks what is already on the job, and adds one with a single tap", async () => {
    const onAdded = vi.fn();
    render(<FieldFindingsButton businessId="biz" jobId="J-1" onAdded={onAdded} />);
    fireEvent.click(screen.getByText("＋ Finding"));
    expect(await screen.findByText("Cracked tiles")).toBeTruthy();
    expect(screen.getByText("✓ Added")).toBeTruthy(); // Split pipe boot is already on the job
    fireEvent.click(screen.getByText("Cracked tiles"));
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith("Cracked tiles"));
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("/api/jobs/J-1/findings");
    expect(post.body).toEqual({ businessId: "biz", itemId: "tile" });
  });

  it("filters by search text and is disabled without a job", async () => {
    render(<FieldFindingsButton businessId="biz" jobId="J-1" />);
    fireEvent.click(screen.getByText("＋ Finding"));
    await screen.findByText("Cracked tiles");
    fireEvent.change(screen.getByLabelText("Search the Library"), { target: { value: "boot" } });
    expect(screen.queryByText("Cracked tiles")).toBeNull();
    expect(screen.getByText("Split pipe boot")).toBeTruthy();
    cleanup();
    render(<FieldFindingsButton businessId="biz" jobId={null} />);
    expect((screen.getByText("＋ Finding") as HTMLButtonElement).disabled).toBe(true);
  });
});
