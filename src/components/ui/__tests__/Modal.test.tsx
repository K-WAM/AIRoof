// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Modal } from "../Modal";

describe("Modal", () => {
  // globals:false in vitest.config.ts means RTL's automatic afterEach
  // cleanup registration doesn't fire — do it explicitly (same pattern as
  // Tooltip.test.tsx, T-066's precedent for this file's jsdom pragma).
  afterEach(() => cleanup());

  it("renders nothing when closed", () => {
    render(
      <Modal open={false} onClose={() => {}} title="Quick add">
        content
      </Modal>
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the title and children when open", () => {
    render(
      <Modal open onClose={() => {}} title="Quick add">
        Hello
      </Modal>
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Quick add")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Quick add">
        Hello
      </Modal>
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the overlay outside the panel is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Quick add">
        Hello
      </Modal>
    );
    fireEvent.click(screen.getByRole("dialog").parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when clicking inside the panel", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Quick add">
        <button>Inner</button>
      </Modal>
    );
    fireEvent.click(screen.getByText("Inner"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Quick add">
        Hello
      </Modal>
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders headerLeft (e.g. a back button) before the title", () => {
    render(
      <Modal open onClose={() => {}} title="New Crew" headerLeft={<button aria-label="Back">←</button>}>
        Hello
      </Modal>
    );
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });
});
