// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sheet } from "../Sheet";

describe("Sheet (T-158 dialog contract)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders a labelled dialog with a 44px named close button", () => {
    render(
      <Sheet open onClose={() => {}} title="Add a finding">
        content
      </Sheet>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Add a finding")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-labelledby", screen.getByText("Add a finding").id);
  });

  it("focuses the first field, else the close button", () => {
    const { unmount } = render(
      <Sheet open onClose={() => {}} title="Add a finding">
        <input aria-label="Finding" />
      </Sheet>
    );
    expect(screen.getByLabelText("Finding")).toHaveFocus();
    unmount();

    render(
      <Sheet open onClose={() => {}} title="Add a finding">
        <p>No fields here</p>
      </Sheet>
    );
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("closes on Escape and on the close button", () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="Add a finding">
        content
      </Sheet>
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("asks before discarding when dirty is set", () => {
    const onClose = vi.fn();
    vi.stubGlobal("confirm", vi.fn(() => false));
    render(
      <Sheet open onClose={onClose} title="Add a finding" dirty>
        <input aria-label="Finding" defaultValue="typed" />
      </Sheet>
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(window.confirm).toHaveBeenCalledWith("Discard changes?");
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("dialog").parentElement as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("returns focus to the trigger on close", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open sheet";
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(
      <Sheet open onClose={() => {}} title="Add a finding">
        content
      </Sheet>
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
