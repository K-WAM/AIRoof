// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimeClock } from "./TimeClock";
import type { WorkerDay } from "@/types/timeclock";

const at = Date.UTC(2026, 8, 28, 13, 14);
function day(partial: Partial<WorkerDay>): WorkerDay {
  return { workerKey: "uid:u1", workerName: "Dom", dayKey: "2026-09-28", state: "off", officeMs: 0, jobs: {}, anomalies: [], ...partial };
}

let posts: Array<Record<string, unknown>>;
function serve(current: WorkerDay) {
  posts = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") posts.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ day: current, tz: "America/New_York" }), { status: 200 });
  }));
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("TimeClock", () => {
  it("off with no job picked: Clock in at the office is the one to tap, and the job button says what it needs", async () => {
    serve(day({}));
    render(<TimeClock businessId="biz" jobId={null} workerName="" />);
    expect(await screen.findByText("Off the clock")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Pick a job to clock in there/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: /Clock in at the office/ })).toBeTruthy();
    expect(screen.getByText(/paid, not billed to a job/)).toBeTruthy();
  });

  it("at a job: Leave, lunch and Clock out, with the running time", async () => {
    serve(day({ state: "site", openJobId: "J-1003", openSince: Date.now() - 65 * 60_000, lastPunchType: "site_in", lastPunchAt: at, jobs: { "J-1003": { ms: 65 * 60_000 } } }));
    render(<TimeClock businessId="biz" jobId="J-1003" workerName="" />);
    expect(await screen.findByText("At J-1003")).toBeTruthy();
    expect(screen.getByText(/1h 05m · these hours go on the job/)).toBeTruthy();
    expect(screen.getByText(/Today:/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Leave J-1003/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Clock out for the day/ })).toBeTruthy();
  });

  it("Clock out for the day asks once before ending the day", async () => {
    serve(day({ state: "site", openJobId: "J-1003", openSince: at }));
    render(<TimeClock businessId="biz" jobId="J-1003" workerName="" />);
    fireEvent.click(await screen.findByRole("button", { name: /Clock out for the day/ }));
    expect(posts).toHaveLength(0);
    expect(screen.getByText(/this also leaves J-1003/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Yes, clock out/ }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ type: "office_out" });
  });

  it("at one job with another picked: one tap switches", async () => {
    serve(day({ state: "site", openJobId: "J-1003", openSince: at }));
    render(<TimeClock businessId="biz" jobId="J-1004" workerName="" />);
    fireEvent.click(await screen.findByRole("button", { name: /Switch to J-1004/ }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ type: "site_in", jobId: "J-1004", closeOpen: true });
  });

  it("back from a job without going home reads as between jobs, not at the office", async () => {
    serve(day({ state: "office", openSince: at, lastPunchType: "site_out", lastPunchAt: at }));
    const seen: string[] = [];
    render(<TimeClock businessId="biz" jobId="J-1004" workerName="" onDayChange={(d) => seen.push(d.state)} />);
    expect(await screen.findByText(/between jobs/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Clock in at J-1004/ })).toBeTruthy();
    expect(seen).toContain("office");
  });
});
