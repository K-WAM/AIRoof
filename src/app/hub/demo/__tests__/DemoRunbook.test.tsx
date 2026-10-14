// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DemoRunbook, previewHref } from "../DemoRunbook";

describe("DemoRunbook", () => {
  afterEach(cleanup);

  it("includes crew scheduling and distinguishes the sample link from live calls", () => {
    render(<DemoRunbook />);
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(screen.getByText(/Hand them the number/)).toBeInTheDocument();
    expect(screen.getByText(/Your real call is in the guided demo/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute("href", previewHref("calendar"));
    expect(screen.getByRole("link", { name: "J-1001" })).toHaveAttribute("href", previewHref("jobs/J-1001"));
    expect(screen.getByRole("link", { name: "Calls" })).toHaveAttribute("href", previewHref("calls"));
  });

  it("encodes the preview tenant", () => {
    expect(previewHref("jobs", "a b")).toBe("/company/jobs?preview=a%20b");
  });
});
