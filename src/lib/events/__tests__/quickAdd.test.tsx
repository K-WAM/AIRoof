// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emitQuickAddCreated, onQuickAddCreated, useQuickAddRefresh } from "../quickAdd";

describe("quickAdd event bus", () => {
  afterEach(() => cleanup());

  it("delivers the emitted detail to a subscriber", () => {
    const handler = vi.fn();
    const unsubscribe = onQuickAddCreated(handler);
    emitQuickAddCreated({ kind: "job", id: "J-0001" });
    expect(handler).toHaveBeenCalledWith({ kind: "job", id: "J-0001" });
    unsubscribe();
  });

  it("stops delivering after unsubscribe", () => {
    const handler = vi.fn();
    const unsubscribe = onQuickAddCreated(handler);
    unsubscribe();
    emitQuickAddCreated({ kind: "crew" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("delivers to every independent subscriber, not just the first", () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = onQuickAddCreated(a);
    const unsubB = onQuickAddCreated(b);
    emitQuickAddCreated({ kind: "teammate" });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    unsubA();
    unsubB();
  });
});

describe("useQuickAddRefresh", () => {
  afterEach(() => cleanup());

  it("only fires onCreated when the emitted kind matches", () => {
    const onCreated = vi.fn();
    renderHook(() => useQuickAddRefresh("crew", onCreated));

    emitQuickAddCreated({ kind: "job" });
    expect(onCreated).not.toHaveBeenCalled();

    emitQuickAddCreated({ kind: "crew" });
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes on unmount", () => {
    const onCreated = vi.fn();
    const { unmount } = renderHook(() => useQuickAddRefresh("crew", onCreated));
    unmount();
    emitQuickAddCreated({ kind: "crew" });
    expect(onCreated).not.toHaveBeenCalled();
  });
});
