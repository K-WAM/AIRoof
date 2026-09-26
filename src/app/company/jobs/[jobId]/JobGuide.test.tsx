// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "@/types/jobs";
import { NextStepButton } from "./NextStepButton";
import { LockNote } from "./LockNote";
import { JobHistory } from "./JobHistory";

vi.mock("@/hooks/useFormat", () => ({
  useFormat: () => ({
    tz: "UTC",
    fmtDay: (ms?: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : ""),
    fmtTime: (ms?: number | null) => (ms ? new Date(ms).toISOString().slice(11, 16) : ""),
    fmtDate: (ms?: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : ""),
  }),
}));

const job = (over: Partial<Job> = {}): Job => ({ jobId: "J-1", businessId: "biz", title: "Roof", status: "inspection", createdAt: 1, updatedAt: 1, ...over });
const finding = { findingId: "f", category: "c", problem: "p", solution: "s", includeInReport: true, includeInQuote: true, addedAt: 1 };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("NextStepButton (the header's one primary action)", () => {
  it("points at the next unfinished step and opens its tab", () => {
    const onGo = vi.fn();
    const { rerender } = render(<NextStepButton job={job()} onGo={onGo} onCompleteWork={vi.fn()} />);
    fireEvent.click(screen.getByText(/Next: Findings/));
    expect(onGo).toHaveBeenLastCalledWith("findings");
    rerender(<NextStepButton job={job({ findings: [finding] })} onGo={onGo} onCompleteWork={vi.fn()} />);
    fireEvent.click(screen.getByText(/Next: Quote/));
    expect(onGo).toHaveBeenLastCalledWith("quote");
  });

  it("at the Work step it marks the work complete itself (office-only) instead of opening a tab", () => {
    const onGo = vi.fn();
    const onCompleteWork = vi.fn();
    render(<NextStepButton job={job({ findings: [finding], status: "quoted", quoteId: "Q-1" })} onGo={onGo} onCompleteWork={onCompleteWork} />);
    fireEvent.click(screen.getByText("Mark work complete"));
    expect(onCompleteWork).toHaveBeenCalledOnce();
    expect(onGo).not.toHaveBeenCalled();
  });

  it("is disabled while saving, and renders nothing once every step is done", () => {
    const { container, rerender } = render(<NextStepButton job={job({ findings: [finding], status: "quoted", quoteId: "Q-1" })} busy onGo={vi.fn()} onCompleteWork={vi.fn()} />);
    expect((screen.getByText("Saving…").closest("button") as HTMLButtonElement).disabled).toBe(true);
    rerender(<NextStepButton job={job({ status: "invoiced", quoteId: "Q-1", reportNotes: "x", findings: [finding] })} onGo={vi.fn()} onCompleteWork={vi.fn()} />);
    expect(container.textContent).toBe("");
  });
});

describe("LockNote", () => {
  it("says a sent or accepted quote and a sent invoice are locked, with the date", () => {
    render(<LockNote quote={{ quoteId: "Q-1000", status: "accepted", answeredAt: Date.UTC(2026, 8, 25) }} invoice={{ invoiceId: "INV-1002", status: "sent", sentAt: Date.UTC(2026, 8, 26) }} />);
    expect(screen.getByText(/Invoice INV-1002 was sent on 2026-09-26\. It is locked/)).toBeTruthy();
    expect(screen.getByText(/Quote Q-1000 was accepted on 2026-09-25\. It is locked/)).toBeTruthy();
  });

  it("says nothing for a draft, and nothing when there is no quote or invoice", () => {
    const { container, rerender } = render(<LockNote quote={{ quoteId: "Q-1", status: "draft" }} invoice={{ invoiceId: "INV-1", status: "draft" }} />);
    expect(container.textContent).toBe("");
    rerender(<LockNote quote={null} invoice={null} />);
    expect(container.textContent).toBe("");
  });

  it("a paid invoice reads as paid", () => {
    render(<LockNote invoice={{ invoiceId: "INV-1", status: "paid", paidAt: Date.UTC(2026, 8, 27) }} />);
    expect(screen.getByText(/Invoice INV-1 was paid on 2026-09-27/)).toBeTruthy();
  });
});

describe("JobHistory", () => {
  let calls: string[];
  let events: Array<{ id: string; at: number; kind: string; title: string; by?: string; detail?: string }>;
  beforeEach(() => {
    calls = [];
    events = [
      { id: "1", at: Date.UTC(2026, 8, 25, 14, 0), kind: "call", title: "Call received", by: "Maria", detail: "Cracked tiles." },
      { id: "2", at: Date.UTC(2026, 8, 25, 14, 5), kind: "job", title: "Job created" },
      { id: "3", at: Date.UTC(2026, 8, 26, 8, 0), kind: "arrive", title: "Arrived at the job", by: "Marco" },
    ];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { calls.push(url); return new Response(JSON.stringify({ events })); }));
  });

  it("lists the trail grouped by day with time, title, who and detail", async () => {
    render(<JobHistory businessId="biz" jobId="J-1" version={1} />);
    await waitFor(() => expect(screen.getByText("Call received")).toBeTruthy());
    expect(screen.getByText("2026-09-25")).toBeTruthy();
    expect(screen.getByText("2026-09-26")).toBeTruthy();
    expect(screen.getByText("14:00")).toBeTruthy();
    expect(screen.getByText(/Maria/)).toBeTruthy();
    expect(screen.getByText("Cracked tiles.")).toBeTruthy();
    expect(screen.getByText("Arrived at the job")).toBeTruthy();
    expect(calls[0]).toBe("/api/jobs/J-1/history?businessId=biz");
  });

  it("shows the newest first: the latest day on top, and the latest event first within a day", async () => {
    render(<JobHistory businessId="biz" jobId="J-1" version={1} />);
    await waitFor(() => expect(screen.getByText("Call received")).toBeTruthy());
    const text = document.body.textContent ?? "";
    expect(text.indexOf("2026-09-26")).toBeLessThan(text.indexOf("2026-09-25"));
    expect(text.indexOf("Job created")).toBeLessThan(text.indexOf("Call received"));
  });

  it("shows the latest 5 events and expands to all of them on request", async () => {
    events = Array.from({ length: 8 }, (_, i) => ({ id: String(i), at: Date.UTC(2026, 8, 25, 8 + i), kind: "field", title: `Event ${i + 1}` }));
    render(<JobHistory businessId="biz" jobId="J-1" version={1} />);
    await waitFor(() => expect(screen.getByText("Event 8")).toBeTruthy());
    expect(screen.queryByText("Event 3")).toBeNull();
    expect(screen.getByText("Event 4")).toBeTruthy();
    fireEvent.click(screen.getByText(/Show all 8/));
    expect(screen.getByText("Event 1")).toBeTruthy();
  });

  it("refetches only when the job version changes, and keeps the list if a refresh fails", async () => {
    const { rerender } = render(<JobHistory businessId="biz" jobId="J-1" version={1} />);
    await waitFor(() => expect(screen.getByText("Job created")).toBeTruthy());
    rerender(<JobHistory businessId="biz" jobId="J-1" version={1} />);
    expect(calls).toHaveLength(1);
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async (url: string) => { calls.push(url); return new Response("{}", { status: 500 }); });
    rerender(<JobHistory businessId="biz" jobId="J-1" version={2} />);
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(screen.getByText("Job created")).toBeTruthy(); // still on screen
  });

  it("says so when nothing has happened yet", async () => {
    events = [];
    render(<JobHistory businessId="biz" jobId="J-1" version={1} />);
    await waitFor(() => expect(screen.getByText(/Nothing has happened/)).toBeTruthy());
  });
});
