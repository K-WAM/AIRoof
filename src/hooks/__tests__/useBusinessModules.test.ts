// @vitest-environment jsdom
//
// T-056 — the hook's new `family` field. Mocks the Firestore read and
// useBusinessId the same way the real component tree does, so this exercises
// the actual resolve → cache → derive path, not just templates.ts in isolation.
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useBusinessId: vi.fn(),
  getDoc: vi.fn(),
}));

vi.mock("@/hooks/useBusinessId", () => ({
  useBusinessId: mocks.useBusinessId,
}));

vi.mock("@/lib/firebase/client", () => ({
  getFirebaseDb: () => Promise.resolve({}),
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({})),
  getDoc: mocks.getDoc,
}));

import { useBusinessModules } from "@/hooks/useBusinessModules";

describe("useBusinessModules — family (T-056)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.useBusinessId.mockReturnValue("biz-1");
  });

  afterEach(async () => {
    // The hook now resolves `db`/`firebase/firestore` via dynamic import (T-070),
    // adding a couple of microtask hops before an in-flight fetch reaches its
    // getDoc() call. Flush one macrotask so a dangling promise from a test like
    // "hasn't resolved yet" (which never resolves getDoc) still lands *before*
    // clearAllMocks(), instead of bleeding its call count into the next test.
    await new Promise((r) => setTimeout(r, 0));
    cleanup();
    vi.clearAllMocks();
  });

  it("exposes the resolved industry's visual family", async () => {
    mocks.getDoc.mockResolvedValue({ data: () => ({ industry: "dental" }) });
    const { result } = renderHook(() => useBusinessModules());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.family).toBe("care");
  });

  it("groups a field-service vertical under the field family", async () => {
    mocks.getDoc.mockResolvedValue({ data: () => ({ industry: "electricians" }) });
    const { result } = renderHook(() => useBusinessModules());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.family).toBe("field");
  });

  it("fails open to null (default teal) for an unrecognized industry", async () => {
    mocks.getDoc.mockResolvedValue({ data: () => ({ industry: "not-a-real-vertical" }) });
    const { result } = renderHook(() => useBusinessModules());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.family).toBeNull();
  });

  it("fails open to null while the business doc hasn't resolved yet", () => {
    mocks.getDoc.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useBusinessModules());
    expect(result.current.ready).toBe(false);
    expect(result.current.family).toBeNull();
  });

  it("reads a cached industry from sessionStorage without waiting on getDoc", () => {
    sessionStorage.setItem("industry_biz-1", "property-management");
    const { result } = renderHook(() => useBusinessModules());
    expect(result.current.ready).toBe(true);
    expect(result.current.family).toBe("ops");
    expect(mocks.getDoc).not.toHaveBeenCalled();
  });
});
