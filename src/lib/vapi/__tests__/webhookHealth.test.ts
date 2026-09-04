import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminFirestore: vi.fn(),
}));

vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: mocks.getAdminFirestore,
}));

import { recordVapiAuthFailure, VAPI_AUTH_FAILURE_COUNTER_DOC, VAPI_WEBHOOK_HEALTH_COLLECTION } from "@/lib/vapi/verify";
import {
  AUTH_FAILURE_ALERT_THRESHOLD,
  readAndResetAuthFailureWindow,
  shouldAlertForAuthFailures,
} from "@/lib/vapi/webhookHealth";

// A minimal fake covering exactly the doc-ref surface these functions use:
// .set({..., merge}) with FieldValue.increment support, .get().
function createCounterDb(initial?: { count?: number; lastFailureAt?: Timestamp }) {
  let doc: Record<string, unknown> | undefined = initial
    ? { count: initial.count ?? 0, lastFailureAt: initial.lastFailureAt }
    : undefined;
  const setSpy = vi.fn(async (value: Record<string, unknown>) => {
    const merged: Record<string, unknown> = { ...doc };
    for (const [key, v] of Object.entries(value)) {
      // Emulate FieldValue.increment(1) without pulling in the real admin SDK.
      if (v && typeof v === "object" && "_delta" in (v as Record<string, unknown>)) {
        merged[key] = (typeof merged[key] === "number" ? (merged[key] as number) : 0) + (v as { _delta: number })._delta;
      } else {
        merged[key] = v;
      }
    }
    doc = merged;
  });

  const ref = {
    set: setSpy,
    get: vi.fn(async () => ({
      data: () => doc,
    })),
  };

  const db = {
    collection: vi.fn((name: string) => {
      expect(name).toBe(VAPI_WEBHOOK_HEALTH_COLLECTION);
      return { doc: (id: string) => {
        expect(id).toBe(VAPI_AUTH_FAILURE_COUNTER_DOC);
        return ref;
      } };
    }),
  };

  return { db: db as unknown as Firestore, ref, getDoc: () => doc };
}

vi.mock("firebase-admin/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase-admin/firestore")>();
  return {
    ...actual,
    FieldValue: { increment: (n: number) => ({ _delta: n }) },
  };
});

describe("recordVapiAuthFailure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is a no-op when Firestore is unavailable", async () => {
    mocks.getAdminFirestore.mockReturnValue(null);
    await expect(recordVapiAuthFailure()).resolves.toBeUndefined();
  });

  it("swallows a Firestore write failure instead of throwing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getAdminFirestore.mockReturnValue({
      collection: () => ({
        doc: () => ({
          set: vi.fn().mockRejectedValue(new Error("boom")),
        }),
      }),
    });

    await expect(recordVapiAuthFailure()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to record Vapi webhook auth-failure counter",
      expect.any(Error)
    );
  });

  it("increments the counter and stamps lastFailureAt", async () => {
    const { db, ref, getDoc } = createCounterDb();
    mocks.getAdminFirestore.mockReturnValue(db);

    await recordVapiAuthFailure(1_000);
    await recordVapiAuthFailure(2_000);

    expect(ref.set).toHaveBeenCalledTimes(2);
    expect(getDoc()?.count).toBe(2);
    expect((getDoc()?.lastFailureAt as Timestamp).toMillis()).toBe(2_000);
  });
});

describe("shouldAlertForAuthFailures", () => {
  it("does not alert on a single transient failure", () => {
    expect(shouldAlertForAuthFailures(1)).toBe(false);
  });

  it("does not alert just under the threshold", () => {
    expect(shouldAlertForAuthFailures(AUTH_FAILURE_ALERT_THRESHOLD - 1)).toBe(false);
  });

  it("alerts once the threshold is reached", () => {
    expect(shouldAlertForAuthFailures(AUTH_FAILURE_ALERT_THRESHOLD)).toBe(true);
  });

  it("alerts past the threshold", () => {
    expect(shouldAlertForAuthFailures(AUTH_FAILURE_ALERT_THRESHOLD + 50)).toBe(true);
  });

  it("respects a custom threshold", () => {
    expect(shouldAlertForAuthFailures(3, 3)).toBe(true);
    expect(shouldAlertForAuthFailures(2, 3)).toBe(false);
  });
});

describe("readAndResetAuthFailureWindow", () => {
  it("returns a zero window and skips the reset write when nothing has failed", async () => {
    const { db, ref } = createCounterDb();

    const window = await readAndResetAuthFailureWindow(db);

    expect(window).toEqual({ count: 0, lastFailureAt: null });
    expect(ref.set).not.toHaveBeenCalled();
  });

  it("returns the accumulated count and lastFailureAt, then resets to zero", async () => {
    const { db, ref, getDoc } = createCounterDb({ count: 7, lastFailureAt: Timestamp.fromMillis(5_000) });

    const window = await readAndResetAuthFailureWindow(db);

    expect(window).toEqual({ count: 7, lastFailureAt: 5_000 });
    expect(ref.set).toHaveBeenCalledWith({ count: 0 }, { merge: true });
    expect(getDoc()?.count).toBe(0);
  });

  it("treats a missing counter doc the same as zero", async () => {
    const { db } = createCounterDb(undefined);

    const window = await readAndResetAuthFailureWindow(db);

    expect(window).toEqual({ count: 0, lastFailureAt: null });
  });
});
