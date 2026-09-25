// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkCompleteButton } from "./WorkCompleteButton";
import { FieldFindingsButton } from "./FindingPickerSheet";

type Call = { url: string; method: string; body?: Record<string, unknown> };
let calls: Call[];
let completeStatus = 200;

beforeEach(() => {
  calls = [];
  completeStatus = 200;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    if (url.endsWith("/complete")) return json({ ok: true }, completeStatus);
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

describe("WorkCompleteButton", () => {
  it("needs two taps: the first only arms it, the second saves", async () => {
    const onCompleted = vi.fn();
    render(<WorkCompleteButton businessId="biz" jobId="J-1" workerName="Marco" onCompleted={onCompleted} />);
    fireEvent.click(screen.getByText("✔ Work complete"));
    expect(calls).toHaveLength(0);
    fireEvent.click(screen.getByText("Tap again to mark this job complete"));
    await waitFor(() => expect(screen.getByText("✓ Job marked complete")).toBeTruthy());
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: "/api/jobs/J-1/complete", method: "POST", body: { businessId: "biz", completedBy: "Marco" } });
    expect(onCompleted).toHaveBeenCalledOnce();
  });

  it("disarms by itself after a few seconds so a stray tap can't linger", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<WorkCompleteButton businessId="biz" jobId="J-1" />);
    fireEvent.click(screen.getByText("✔ Work complete"));
    expect(screen.getByText("Tap again to mark this job complete")).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(5200); });
    expect(screen.getByText("✔ Work complete")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it("says so and lets you retry when saving fails", async () => {
    completeStatus = 500;
    render(<WorkCompleteButton businessId="biz" jobId="J-1" />);
    fireEvent.click(screen.getByText("✔ Work complete"));
    fireEvent.click(screen.getByText("Tap again to mark this job complete"));
    await waitFor(() => expect(screen.getByText("Couldn't save — tap to try again")).toBeTruthy());
  });

  it("is disabled with no job selected and resets when the job changes", async () => {
    const { rerender } = render(<WorkCompleteButton businessId="biz" jobId={null} />);
    expect((screen.getByText("✔ Work complete") as HTMLButtonElement).disabled).toBe(true);
    rerender(<WorkCompleteButton businessId="biz" jobId="J-1" />);
    fireEvent.click(screen.getByText("✔ Work complete"));
    fireEvent.click(screen.getByText("Tap again to mark this job complete"));
    await waitFor(() => expect(screen.getByText("✓ Job marked complete")).toBeTruthy());
    rerender(<WorkCompleteButton businessId="biz" jobId="J-2" />);
    expect(screen.getByText("✔ Work complete")).toBeTruthy();
  });
});

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
