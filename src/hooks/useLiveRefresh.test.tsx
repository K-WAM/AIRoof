// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLiveRefresh } from "./useLiveRefresh";

describe("useLiveRefresh", () => {
  it("pauses while hidden and skips unsaved edits", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn().mockResolvedValue(undefined);
    let visibility: DocumentVisibilityState = "hidden";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
    const { rerender } = renderHook(({ dirty }) => useLiveRefresh(refresh, { intervalMs: 1000, isDirty: dirty }), { initialProps: { dirty: false } });
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(refresh).not.toHaveBeenCalled();
    visibility = "visible";
    rerender({ dirty: true });
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(refresh).not.toHaveBeenCalled();
    rerender({ dirty: false });
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("does not overlap refreshes", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const refresh = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    renderHook(() => useLiveRefresh(refresh, { intervalMs: 1000 }));
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); await Promise.resolve(); vi.advanceTimersByTime(1000); });
    expect(refresh).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
