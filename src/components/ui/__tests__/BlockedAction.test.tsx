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
});
