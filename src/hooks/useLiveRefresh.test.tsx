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

  it("slows to once a minute on an untouched screen and catches up on the first touch", async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useLiveRefresh(refresh, { intervalMs: 10_000 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(3 * 60_000); });
    const busy = refresh.mock.calls.length;
    expect(busy).toBeGreaterThanOrEqual(17);
    await act(async () => { await vi.advanceTimersByTimeAsync(3 * 60_000); });
    expect(refresh.mock.calls.length - busy).toBeLessThanOrEqual(4);
    const idleCount = refresh.mock.calls.length;
    await act(async () => { window.dispatchEvent(new Event("pointerdown")); await Promise.resolve(); });
    expect(refresh).toHaveBeenCalledTimes(idleCount + 1);
    vi.useRealTimers();
  });
});
