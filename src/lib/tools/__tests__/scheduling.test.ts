import { beforeEach, describe, expect, it, vi } from "vitest";

const resendMocks = vi.hoisted(() => {
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.RESEND_FROM = "Luxor AI <no-reply@luxordev.com>";
  return { send: vi.fn() };
});

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendMocks.send };
  },
}));

import { getAdminFirestore } from "@/lib/firebase/admin";
import {
  SchedulingConflictError,
  bookAppointment,
  buildAvailableSlots,
  escalateCall,
  isScheduleWithinBusinessHours,
  scheduleRangesOverlap,
  zonedDateTimeToUtc,
} from "@/lib/tools/agentTools";

type StoredDocument = Record<string, unknown>;
type Operator = "==" | "<" | ">=";

class FakeDocumentSnapshot {
  constructor(
    readonly ref: FakeDocumentReference,
    private readonly value: StoredDocument | undefined
  ) {}

  get id() {
    return this.ref.id;
  }

  get exists() {
    return this.value !== undefined;
  }

  data() {
    return this.value ? { ...this.value } : undefined;
  }
}

class FakeQuery {
  readonly filters: Array<[string, Operator, unknown]> = [];

  constructor(
    protected readonly firestore: FakeFirestore,
    readonly path: string
  ) {}

  where(field: string, operator: Operator, value: unknown) {
    this.filters.push([field, operator, value]);
    return this;
  }

  async get() {
    const expectedSegments = this.path.split("/").length + 1;
    const docs = [...this.firestore.documents.entries()]
      .filter(
        ([path]) =>
          path.startsWith(`${this.path}/`) && path.split("/").length === expectedSegments
      )
      .filter(([, data]) =>
        this.filters.every(([field, operator, expected]) => {
          const actual = data[field];
          if (operator === "==") return actual === expected;
          if (typeof actual !== "number" || typeof expected !== "number") return false;
          return operator === "<" ? actual < expected : actual >= expected;
        })
      )
      .map(
        ([path, data]) =>
          new FakeDocumentSnapshot(new FakeDocumentReference(this.firestore, path), data)
      );
    return { docs, empty: docs.length === 0 };
  }
}

class FakeCollectionReference extends FakeQuery {
  doc(id?: string) {
    return new FakeDocumentReference(
      this.firestore,
      `${this.path}/${id ?? `auto-${this.firestore.nextId++}`}`
    );
  }
}

class FakeDocumentReference {
  readonly id: string;

  constructor(
    private readonly firestore: FakeFirestore,
    readonly path: string
  ) {
    this.id = path.split("/").at(-1) ?? "";
  }

  collection(name: string) {
    return new FakeCollectionReference(this.firestore, `${this.path}/${name}`);
  }

  async get() {
    return new FakeDocumentSnapshot(this, this.firestore.documents.get(this.path));
  }
}

class FakeTransaction {
  private readonly writes: Array<() => void> = [];

  constructor(private readonly firestore: FakeFirestore) {}

  get(reference: FakeDocumentReference | FakeQuery) {
    return reference.get();
  }

  create(reference: FakeDocumentReference, value: StoredDocument) {
    if (this.firestore.documents.has(reference.path)) {
      throw new Error(`Document already exists: ${reference.path}`);
    }
    this.writes.push(() => this.firestore.documents.set(reference.path, { ...value }));
  }

  update(reference: FakeDocumentReference, value: StoredDocument) {
    if (!this.firestore.documents.has(reference.path)) {
      throw new Error(`Document does not exist: ${reference.path}`);
    }
    this.writes.push(() => {
      const current = this.firestore.documents.get(reference.path) ?? {};
      this.firestore.documents.set(reference.path, { ...current, ...value });
    });
  }

  set(reference: FakeDocumentReference, value: StoredDocument) {
    this.writes.push(() => this.firestore.documents.set(reference.path, { ...value }));
  }

  commit() {
    this.writes.forEach((write) => write());
  }
}

class FakeFirestore {
  readonly documents = new Map<string, StoredDocument>();
  nextId = 1;
  private transactionQueue: Promise<void> = Promise.resolve();

  collection(name: string) {
    return new FakeCollectionReference(this, name);
  }

  runTransaction<T>(callback: (transaction: FakeTransaction) => Promise<T>): Promise<T> {
    const run = this.transactionQueue.then(async () => {
      const transaction = new FakeTransaction(this);
      const result = await callback(transaction);
      transaction.commit();
      return result;
    });
    this.transactionQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}

const weekdayHours = {
  Monday: "09:00 - 17:00",
  Tuesday: "09:00 - 17:00",
  Wednesday: "09:00 - 17:00",
  Thursday: "09:00 - 17:00",
  Friday: "09:00 - 17:00",
  Saturday: "Closed",
  Sunday: "Closed",
};

describe("scheduling ranges and business time", () => {
  it("detects duration overlap but permits adjacent appointments", () => {
    expect(scheduleRangesOverlap(100, 200, 150, 250)).toBe(true);
    expect(scheduleRangesOverlap(100, 200, 200, 300)).toBe(false);
  });

  it("rejects a closed business day", () => {
    const start = Date.parse("2026-07-26T14:00:00.000Z"); // Sunday 10am New York
    expect(
      isScheduleWithinBusinessHours(
        start,
        start + 60 * 60 * 1000,
        weekdayHours,
        "America/New_York"
      )
    ).toBe(false);
  });

  it("preserves wall-clock time across the DST boundary", () => {
    const beforeDst = zonedDateTimeToUtc(
      { year: 2026, month: 3, day: 6, hour: 9, minute: 0 },
      "America/New_York"
    );
    const afterDst = zonedDateTimeToUtc(
      { year: 2026, month: 3, day: 9, hour: 9, minute: 0 },
      "America/New_York"
    );
    expect(new Date(beforeDst!).toISOString()).toBe("2026-03-06T14:00:00.000Z");
    expect(new Date(afterDst!).toISOString()).toBe("2026-03-09T13:00:00.000Z");
  });

  it("does not suggest an occupied duration or a closed day", () => {
    const occupiedStart = Date.parse("2026-07-27T13:30:00.000Z");
    const slots = buildAvailableSlots({
      businessHours: weekdayHours,
      timeZone: "America/New_York",
      preferredDate: "2026-07-26",
      durationMinutes: 60,
      now: new Date("2026-07-20T12:00:00.000Z"),
      existing: [
        {
          startTime: occupiedStart,
          endTime: occupiedStart + 90 * 60 * 1000,
          status: "confirmed",
        },
      ],
      maxSlots: 2,
    });
    expect(slots).toHaveLength(2);
    expect(slots.every((slot) => slot.startTime.startsWith("2026-07-27"))).toBe(true);
    expect(slots[0].startTime).toBe("2026-07-27T15:00:00.000Z");
  });
});

describe("bookAppointment transaction", () => {
  beforeEach(() => {
    vi.mocked(getAdminFirestore).mockReset();
  });

  it("allows exactly one concurrent request for one slot", async () => {
    const firestore = new FakeFirestore();
    firestore.documents.set("businesses/biz-1", {
      businessName: "Example Co",
      timezone: "America/New_York",
      businessHours: weekdayHours,
    });
    vi.mocked(getAdminFirestore).mockReturnValue(firestore as never);
    const startTime = Date.parse("2030-07-23T14:00:00.000Z");
    const request = {
      businessId: "biz-1",
      callerName: "Taylor",
      callerPhone: "+15555550123",
      startTime,
      endTime: startTime + 60 * 60 * 1000,
    };

    const results = await Promise.allSettled([
      bookAppointment(request),
      bookAppointment(request),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejection = results.find((result) => result.status === "rejected");
    expect(rejection).toMatchObject({
      status: "rejected",
      reason: expect.any(SchedulingConflictError),
    });
    expect(
      [...firestore.documents.keys()].filter((path) => path.includes("/appointments/"))
    ).toHaveLength(1);
  });

  it("rejects a requested duration that overlaps an occupied slot", async () => {
    const firestore = new FakeFirestore();
    const occupiedStart = Date.parse("2030-07-23T14:00:00.000Z");
    firestore.documents.set("businesses/biz-1", {
      timezone: "America/New_York",
      businessHours: weekdayHours,
    });
    firestore.documents.set("businesses/biz-1/appointments/existing", {
      startTime: occupiedStart,
      endTime: occupiedStart + 60 * 60 * 1000,
      status: "requested",
    });
    vi.mocked(getAdminFirestore).mockReturnValue(firestore as never);

    await expect(
      bookAppointment({
        businessId: "biz-1",
        callerName: "Jordan",
        callerPhone: "+15555550124",
        startTime: occupiedStart + 30 * 60 * 1000,
        endTime: occupiedStart + 90 * 60 * 1000,
      })
    ).rejects.toMatchObject({ code: "slot_conflict" });
  });
});

function configuredEscalationFirestore() {
  const firestore = new FakeFirestore();
  firestore.documents.set("businesses/biz-1", {
    businessName: "Example Co",
    escalationPhone: "+15555550100",
    notificationEmail: "dispatch@example.com",
    timezone: "America/New_York",
  });
  vi.mocked(getAdminFirestore).mockReturnValue(firestore as never);
  return firestore;
}

const escalationInput = {
  businessId: "biz-1",
  callId: "call-urgent-1",
  reason: "Caller reported an emergency",
  callerPhone: "+15555550199",
  summary: "Immediate assistance requested",
};

describe("truthful emergency escalation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_FROM = "Luxor AI <no-reply@luxordev.com>";
  });

  it.each(["RESEND_FROM", "notificationEmail", "escalationPhone"] as const)(
    "returns unconfigured and persists a retryable attempt when %s is missing",
    async (missingField) => {
      const firestore = configuredEscalationFirestore();
      if (missingField === "RESEND_FROM") {
        delete process.env.RESEND_FROM;
      } else {
        const business = firestore.documents.get("businesses/biz-1") ?? {};
        delete business[missingField];
        firestore.documents.set("businesses/biz-1", business);
      }

      const result = await escalateCall(escalationInput);

      expect(result).toMatchObject({ status: "unconfigured", escalated: false });
      expect(resendMocks.send).not.toHaveBeenCalled();
      expect(
        firestore.documents.get(
          "businesses/biz-1/operations/email:urgent-escalation:call-urgent-1"
        )
      ).toMatchObject({
        state: "failed",
        attemptCount: 1,
        lastFailure: {
          classification: "retryable",
          code: "configuration_missing",
        },
      });
    }
  );

  it("reports delivered only from a real provider ID and persists it", async () => {
    const firestore = configuredEscalationFirestore();
    resendMocks.send.mockResolvedValue({
      data: { id: "resend-message-1" },
      error: null,
    });

    const result = await escalateCall(escalationInput);

    expect(result).toMatchObject({ status: "delivered", escalated: true });
    expect(resendMocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Luxor AI <no-reply@luxordev.com>",
        to: "dispatch@example.com",
      })
    );
    expect(
      firestore.documents.get(
        "businesses/biz-1/operations/email:urgent-escalation:call-urgent-1"
      )
    ).toMatchObject({ state: "succeeded", lastProviderId: "resend-message-1" });
  });

  it("persists provider failure as retryable and succeeds on a safe retry", async () => {
    const firestore = configuredEscalationFirestore();
    resendMocks.send
      .mockResolvedValueOnce({
        data: null,
        error: { name: "application_error", message: "provider unavailable" },
      })
      .mockResolvedValueOnce({ data: { id: "resend-message-2" }, error: null });

    const failed = await escalateCall(escalationInput);
    const retried = await escalateCall(escalationInput);

    expect(failed).toMatchObject({ status: "failed", escalated: false });
    expect(retried).toMatchObject({ status: "delivered", escalated: true });
    expect(resendMocks.send).toHaveBeenCalledTimes(2);
    expect(
      firestore.documents.get(
        "businesses/biz-1/operations/email:urgent-escalation:call-urgent-1"
      )
    ).toMatchObject({
      state: "succeeded",
      attemptCount: 2,
      lastProviderId: "resend-message-2",
    });
  });

  it("persists a thrown provider outage as a retryable failure", async () => {
    const firestore = configuredEscalationFirestore();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    resendMocks.send.mockRejectedValue(new Error("network unavailable"));

    const result = await escalateCall(escalationInput);

    expect(result).toMatchObject({ status: "failed", escalated: false });
    expect(
      firestore.documents.get(
        "businesses/biz-1/operations/email:urgent-escalation:call-urgent-1"
      )
    ).toMatchObject({
      state: "failed",
      lastFailure: { classification: "retryable", code: "provider_error" },
    });
  });

  it("deduplicates simultaneous escalation attempts for the same call", async () => {
    configuredEscalationFirestore();
    let resolveDelivery:
      | ((value: { data: { id: string }; error: null }) => void)
      | undefined;
    resendMocks.send.mockReturnValue(
      new Promise((resolve) => {
        resolveDelivery = resolve;
      })
    );

    const first = escalateCall(escalationInput);
    await vi.waitFor(() => expect(resendMocks.send).toHaveBeenCalledOnce());
    const duplicate = await escalateCall(escalationInput);
    resolveDelivery?.({ data: { id: "resend-message-3" }, error: null });
    const delivered = await first;

    expect(duplicate).toMatchObject({ status: "accepted", escalated: false });
    expect(delivered).toMatchObject({ status: "delivered", escalated: true });
    expect(resendMocks.send).toHaveBeenCalledOnce();
  });
});
