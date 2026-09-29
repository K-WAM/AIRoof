// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockedAction } from "../BlockedAction";

describe("BlockedAction", () => {
  afterEach(() => cleanup());

  it("renders the message and action label", () => {
    render(<BlockedAction message="No crews yet." actionLabel="+ Add crew" onAction={() => {}} />);
    expect(screen.getByText("No crews yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add crew" })).toBeInTheDocument();
  });

  it("calls onAction when the button is clicked", () => {
    const onAction = vi.fn();
    render(<BlockedAction message="No crews yet." actionLabel="+ Add crew" onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add crew" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("uses a direct link when href is supplied", () => {
    render(<BlockedAction message="Add a crew first." actionLabel="Add crew" href="/company/library?section=crews" />);
    expect(screen.getByRole("link", { name: "Add crew" })).toHaveAttribute("href", "/company/library?section=crews");
  });

  // T-163: a blocked action must show why, as visible text — never a tooltip alone.
  it("renders the reason as visible text", () => {
    render(
      <BlockedAction
        message="You can't schedule yet."
        reason="No crews have been added to this company."
        actionLabel="+ Add crew"
        onAction={() => {}}
      />
    );
    expect(screen.getByText("No crews have been added to this company.")).toBeVisible();
  });
});
