// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JobPicker, likelyJobs } from "./JobPicker";
import type { Job } from "@/types/jobs";

const job = (n: number, extra: Partial<Job> = {}): Job => ({
  jobId: `J-${1000 + n}`, businessId: "biz", title: `Job ${n}`, address: `${n} Palm Ave`, status: "open", createdAt: n, updatedAt: n, ...extra,
} as Job);
const fifty = Array.from({ length: 50 }, (_, i) => job(i, i === 7 ? { status: "invoiced" } : {}));
afterEach(cleanup);

describe("JobPicker", () => {
  it("fifty jobs: a search box, five likely jobs, and Show all — not fifty rows", () => {
    render(<JobPicker jobs={fifty} loading={false} selectedId="" onSelect={vi.fn()} />);
    expect(screen.getByText("Which job are you at?")).toBeTruthy();
    expect(screen.getAllByTestId("job-option")).toHaveLength(5);
    expect(screen.getByRole("button", { name: /Show all 50 jobs/ })).toBeTruthy();
    expect(screen.getByLabelText("Search jobs")).toBeTruthy();
  });

  it("typing finds a job by number, name or address — including a finished one", () => {
    const onSelect = vi.fn();
    render(<JobPicker jobs={fifty} loading={false} selectedId="" onSelect={onSelect} />);
    fireEvent.change(screen.getByLabelText("Search jobs"), { target: { value: "1007" } });
    const rows = screen.getAllByTestId("job-option");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("J-1007");
    expect(rows[0].textContent).toContain("Done");
    fireEvent.click(rows[0]);
    expect(onSelect).toHaveBeenCalledWith("J-1007");
    fireEvent.change(screen.getByLabelText("Search jobs"), { target: { value: "12 palm" } });
    expect(screen.getAllByTestId("job-option")[0].textContent).toContain("J-1012");
  });

  it("the likely list leads with the clocked-in job, then the last one used, then the crew's, never a finished one", () => {
    const jobs = [job(1, { status: "complete" }), job(2), job(3, { assignedCrewId: "c1" }), job(4), job(5)];
    const ids = likelyJobs(jobs, { clockedInJobId: "J-1005", recentJobId: "J-1004", myCrewId: "c1" }).map((j) => j.jobId);
    expect(ids.slice(0, 3)).toEqual(["J-1005", "J-1004", "J-1003"]);
    expect(ids).not.toContain("J-1001");
  });

  it("a picked job collapses to one card; tapping it reopens the picker with a way back", () => {
    render(<JobPicker jobs={fifty} loading={false} selectedId="J-1003" onSelect={vi.fn()} />);
    const card = screen.getByTestId("job-selected");
    expect(card.textContent).toContain("J-1003");
    fireEvent.click(card);
    expect(screen.getByText("Change job")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep J-1003" }));
    expect(screen.getByTestId("job-selected")).toBeTruthy();
  });
});
