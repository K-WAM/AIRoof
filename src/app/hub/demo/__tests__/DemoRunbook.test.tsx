// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DemoRunbook, ELEVENLABS_DEMO, VAPI_DEMO, previewHref } from "../DemoRunbook";

describe("DemoRunbook", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => cleanup());

  it("shows all six steps and both demo lines with dialable numbers", () => {
    render(<DemoRunbook />);
    for (const title of [
      "Before they arrive (2 min)",
      "Pick the line",
      "Have them call — say this",
      "Show what the call produced (about 1 minute each)",
      "Field, invoice, quote, report",
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(screen.getByText(/Wrap up/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /\+1 \(689\) 204-2643/ })).toHaveAttribute("href", `tel:${ELEVENLABS_DEMO.tel}`);
    expect(screen.getByRole("link", { name: /\+1 \(754\) 283-7658/ })).toHaveAttribute("href", `tel:${VAPI_DEMO.tel}`);
  });

  it("links each line's result pages to the right business via ?preview=", () => {
    render(<DemoRunbook />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(previewHref("pipeline", "carlita-elevenlabs-test"));
    expect(hrefs).toContain(previewHref("calendar", "demo-roofing"));
    expect(previewHref("jobs", "a b")).toBe("/company/jobs?preview=a%20b");
  });

  it("remembers ticked pre-flight items across reloads and can be collapsed", () => {
    const { unmount } = render(<DemoRunbook />);
    const sync = screen.getByLabelText(/Recording notice applied/);
    expect(sync).not.toBeChecked();
    fireEvent.click(sync);
    expect(sync).toBeChecked();
    unmount();
    render(<DemoRunbook />);
    expect(screen.getByLabelText(/Recording notice applied/)).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByText("Pick the line")).not.toBeInTheDocument();
  });
});
