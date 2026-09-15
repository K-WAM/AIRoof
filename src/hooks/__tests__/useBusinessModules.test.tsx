// @vitest-environment jsdom
//
// T-056's `family` field, now resolved via BootstrapContext (Phase 1 of the
// speed/foundation work) instead of a per-hook client-Firestore read. This
// wraps renderHook in the real BootstrapProvider and mocks fetch, so it
// exercises the actual resolve → cache → derive path end to end.
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { BootstrapProvider } from "@/contexts/BootstrapContext";
import type { CompanyBootstrap } from "@/types/bootstrap";

const mocks = vi.hoisted(() => ({
  useBusinessId: vi.fn(),
}));

vi.mock("@/hooks/useBusinessId", () => ({
  useBusinessId: mocks.useBusinessId,
}));

import { useBusinessModules } from "@/hooks/useBusinessModules";

function bootstrapFor(industry: string | null, subscriptionStatus: CompanyBootstrap["business"]["subscriptionStatus"] = null): CompanyBootstrap {
  return {
    business: {
      businessId: "biz-1",
      businessName: "Test Co",
      industry: industry as CompanyBootstrap["business"]["industry"],
      timezone: "America/New_York",
      subscriptionStatus,
      brandColor: null,
      logoUrl: null,
    },
    modules: { disabled: [], calendarMode: "jobs", family: null },
    serverNow: Date.now(),
  };
}

function mockFetchOnce(body: unknown, ok = true) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(body),
  }));
}

const wrapper = ({ children }: { children: ReactNode }) => <BootstrapProvider>{children}</BootstrapProvider>;

describe("useBusinessModules — family (T-056)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.useBusinessId.mockReturnValue("biz-1");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("exposes the resolved industry's visual family", async () => {
    mockFetchOnce(bootstrapFor("dental"));
    const { result } = renderHook(() => useBusinessModules(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.family).toBe("care");
  });

  it("groups a field-service vertical under the field family", async () => {
    mockFetchOnce(bootstrapFor("electricians"));
    const { result } = renderHook(() => useBusinessModules(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.family).toBe("field");
  });

  it("fails open to null (default teal) for an unrecognized industry", async () => {
    mockFetchOnce(bootstrapFor(null));
    const { result } = renderHook(() => useBusinessModules(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.family).toBeNull();
  });

  it("fails open to null while the bootstrap fetch hasn't resolved yet", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))); // never resolves
    const { result } = renderHook(() => useBusinessModules(), { wrapper });
    expect(result.current.ready).toBe(false);
    expect(result.current.family).toBeNull();
  });

  it("reads a cached bootstrap from sessionStorage without waiting on fetch", () => {
    sessionStorage.setItem("lx:bootstrap:biz-1", JSON.stringify({ v: 2, at: Date.now(), data: bootstrapFor("property-management") }));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useBusinessModules(), { wrapper });
    expect(result.current.ready).toBe(true);
    expect(result.current.family).toBe("ops");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls through to a fresh fetch instead of crashing on a legacy cache shape", async () => {
    sessionStorage.setItem("businessModules_biz-1", JSON.stringify({ industry: "roofing" })); // pre-bootstrap key
    mockFetchOnce(bootstrapFor("dental", "active"));
    const { result } = renderHook(() => useBusinessModules(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.industry).toBe("dental");
  });
});

describe("useBusinessModules — subscriptionStatus (paused-dashboard gate)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.useBusinessId.mockReturnValue("biz-1");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("resolves a paused business's subscriptionStatus", async () => {
    mockFetchOnce(bootstrapFor("roofing", "paused"));
    const { result } = renderHook(() => useBusinessModules(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.subscriptionStatus).toBe("paused");
  });

  it("fails open to null for an unset subscriptionStatus", async () => {
    mockFetchOnce(bootstrapFor("roofing", null));
    const { result } = renderHook(() => useBusinessModules(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.subscriptionStatus).toBeNull();
  });

  it("reads a cached subscriptionStatus without waiting on fetch", () => {
    sessionStorage.setItem("lx:bootstrap:biz-1", JSON.stringify({ v: 2, at: Date.now(), data: bootstrapFor("roofing", "paused") }));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useBusinessModules(), { wrapper });
    expect(result.current.ready).toBe(true);
    expect(result.current.subscriptionStatus).toBe("paused");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
