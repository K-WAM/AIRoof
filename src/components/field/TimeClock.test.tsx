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
  it("off with no job picked: Arrived at office is the one to tap, and says why the job button is off", async () => {
    serve(day({}));
    render(<TimeClock businessId="biz" jobId={null} workerName="" />);
    expect(await screen.findByText("Not clocked in")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Arrived at job/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Pick a job above to clock in at it.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Arrived at office/ })).toBeTruthy();
  });

  it("at a job: Left job, lunch and Done for the day, plus the last tap", async () => {
    serve(day({ state: "site", openJobId: "J-1003", openSince: at, lastPunchType: "site_in", lastPunchAt: at }));
    render(<TimeClock businessId="biz" jobId="J-1003" workerName="" />);
    expect(await screen.findByText(/At J-1003 since 9:14/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Left J-1003/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Done for the day/ })).toBeTruthy();
    expect(screen.getByText(/Last tap: Arrived at job · 9:14/)).toBeTruthy();
  });

  it("at one job with another picked: one tap switches", async () => {
    serve(day({ state: "site", openJobId: "J-1003", openSince: at }));
    render(<TimeClock businessId="biz" jobId="J-1004" workerName="" />);
    fireEvent.click(await screen.findByRole("button", { name: /Arrived at J-1004/ }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ type: "site_in", jobId: "J-1004", closeOpen: true });
  });

  it("back from a job without going home reads as between jobs, not at the office", async () => {
    serve(day({ state: "office", openSince: at, lastPunchType: "site_out", lastPunchAt: at }));
    render(<TimeClock businessId="biz" jobId="J-1004" workerName="" />);
    expect(await screen.findByText(/between jobs/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Arrived at job J-1004/ })).toBeTruthy();
  });
});
