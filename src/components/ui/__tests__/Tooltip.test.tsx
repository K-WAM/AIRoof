// @vitest-environment jsdom
//
// The only component/DOM test in this repo (T-066) — everything else here is
// logic/route-level (environment: "node" in vitest.config.ts). Scoped to jsdom
// via this per-file pragma rather than changing the global environment, so the
// other 308 tests are completely unaffected.
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tooltip } from "../Tooltip";

// setTimeout fires outside a React event handler, so its resulting state
// update needs an explicit act() to flush synchronously before assertions —
// without it, some advances leave the DOM one render behind (React 18 +
// fake timers), which is exactly the flake this wrapper avoids.
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("Tooltip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    // globals:false in vitest.config.ts means RTL's automatic afterEach
    // cleanup registration doesn't fire — do it explicitly, or elements from
    // one test's render() leak into the next test's queries.
    cleanup();
    vi.useRealTimers();
  });

  it("does not show immediately on hover, then shows after the delay", () => {
    render(
      <Tooltip content="Search" delay={500}>
        <button>🔍</button>
      </Tooltip>
    );
    const bubble = screen.getByRole("tooltip", { hidden: true });
    expect(bubble).not.toHaveClass("tooltip-visible");

    fireEvent.mouseEnter(screen.getByRole("button"));
    expect(bubble).not.toHaveClass("tooltip-visible");

    advance(499);
    expect(bubble).not.toHaveClass("tooltip-visible");

    advance(1);
    expect(bubble).toHaveClass("tooltip-visible");
  });

  it("shows on keyboard focus after the delay, same as hover", () => {
    render(
      <Tooltip content="Search" delay={500}>
        <button>🔍</button>
      </Tooltip>
    );
    const bubble = screen.getByRole("tooltip", { hidden: true });

    // focusIn/focusOut, not focus/blur: React's onFocus/onBlur on the
    // wrapping <span> relies on bubbling from the child button, and native
    // focus/blur don't bubble (focusin/focusout — what focusIn/focusOut fire
    // — do; this matches real browser behavior, not a test-only workaround).
    fireEvent.focusIn(screen.getByRole("button"));
    advance(500);
    expect(bubble).toHaveClass("tooltip-visible");
  });

  it("hides instantly on mouse-leave, with no delay", () => {
    render(
      <Tooltip content="Search" delay={500}>
        <button>🔍</button>
      </Tooltip>
    );
    const button = screen.getByRole("button");
    const bubble = screen.getByRole("tooltip", { hidden: true });

    fireEvent.mouseEnter(button);
    advance(500);
    expect(bubble).toHaveClass("tooltip-visible");

    fireEvent.mouseLeave(button);
    expect(bubble).not.toHaveClass("tooltip-visible");
  });

  it("hides instantly on blur, with no delay", () => {
    render(
      <Tooltip content="Search" delay={500}>
        <button>🔍</button>
      </Tooltip>
    );
    const button = screen.getByRole("button");
    const bubble = screen.getByRole("tooltip", { hidden: true });

    fireEvent.focusIn(button);
    advance(500);
    expect(bubble).toHaveClass("tooltip-visible");

    fireEvent.focusOut(button);
    expect(bubble).not.toHaveClass("tooltip-visible");
  });

  it("cancels a pending show if the pointer leaves before the delay elapses", () => {
    render(
      <Tooltip content="Search" delay={500}>
        <button>🔍</button>
      </Tooltip>
    );
    const button = screen.getByRole("button");
    const bubble = screen.getByRole("tooltip", { hidden: true });

    fireEvent.mouseEnter(button);
    advance(200);
    fireEvent.mouseLeave(button);
    advance(500);
    expect(bubble).not.toHaveClass("tooltip-visible");
  });

  it("sets aria-describedby on the actual trigger element, not just a floating div", () => {
    render(
      <Tooltip content="Search">
        <button>🔍</button>
      </Tooltip>
    );
    const button = screen.getByRole("button");
    const bubble = screen.getByRole("tooltip", { hidden: true });
    expect(button).toHaveAttribute("aria-describedby", bubble.id);
  });
});
