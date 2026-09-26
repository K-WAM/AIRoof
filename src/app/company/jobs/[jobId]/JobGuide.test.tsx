// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "@/types/jobs";
import { JobStepper } from "./JobStepper";
import { JobHistory } from "./JobHistory";

vi.mock("@/hooks/useFormat", () => ({
  useFormat: () => ({
    tz: "UTC",
    fmtDay: (ms?: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : ""),
    fmtTime: (ms?: number | null) => (ms ? new Date(ms).toISOString().slice(11, 16) : ""),
  }),
}));

const job = (over: Partial<Job> = {}): Job => ({ jobId: "J-1", businessId: "biz", title: "Roof", status: "inspection", createdAt: 1, updatedAt: 1, ...over });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("JobStepper (next-step line)", () => {
  it("shows ONE next action with its hint — and no second row of step chips duplicating the progress bar", () => {
    const onGo = vi.fn();
    render(<JobStepper job={job()} onGo={onGo} />);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText(/Record what was found/)).toBeTruthy();
    fireEvent.click(screen.getByText("Next: Findings →"));
    expect(onGo).toHaveBeenCalledWith("findings");
  });

  it("moves on as the job progresses (findings -> quote, then work opens the timeline)", () => {
    const finding = { findingId: "f", category: "c", problem: "p", solution: "s", includeInReport: true, includeInQuote: true, addedAt: 1 };
    const onGo = vi.fn();
    const { rerender } = render(<JobStepper job={job({ findings: [finding] })} onGo={onGo} />);
    fireEvent.click(screen.getByText("Next: Quote →"));
    expect(onGo).toHaveBeenLastCalledWith("quote");
    rerender(<JobStepper job={job({ findings: [finding], status: "quoted", quoteId: "Q-1" })} onGo={onGo} />);
    fireEvent.click(screen.getByText("Next: Work →"));
    expect(onGo).toHaveBeenLastCalledWith("timeline");
  });

  it("says so when everything is done and offers no button", () => {
    render(<JobStepper job={job({ status: "invoiced", quoteId: "Q-1", reportNotes: "x", findings: [{ findingId: "f", category: "c", problem: "p", solution: "s", includeInReport: true, includeInQuote: true, addedAt: 1 }] })} onGo={vi.fn()} />);
    expect(screen.getByText(/Every step is done/)).toBeTruthy();
    expect(screen.queryByText(/^Next:/)).toBeNull();
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
