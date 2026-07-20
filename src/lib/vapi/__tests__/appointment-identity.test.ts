import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminFirestore: vi.fn(),
}));

vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: mocks.getAdminFirestore,
}));

import {
  cancelAppointment,
  lookupAppointment,
} from "@/lib/tools/agentTools";

interface AppointmentSeed {
  appointmentId?: string;
  callerName?: string;
  callerPhone?: string;
  serviceType?: string;
  address?: string;
  startTime: number;
  status: string;
}

interface BusinessSeed {
  timezone?: string;
  appointments: Record<string, AppointmentSeed>;
}

interface FakeRef {
  kind: "business" | "appointment" | "confirmation";
  businessId: string;
  id: string;
  get: () => Promise<FakeSnapshot>;
  set: (value: Record<string, unknown>) => Promise<void>;
  update: (value: Record<string, unknown>) => Promise<void>;
  collection?: (name: string) => FakeCollection;
}

interface FakeSnapshot {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
}

interface FakeCollection {
  doc: (id: string) => FakeRef;
  get: () => Promise<{ empty: boolean; docs: Array<{ id: string; data: () => Record<string, unknown> }> }>;
}

function createFirestore(seed: Record<string, BusinessSeed>) {
  const businesses = new Map(
    Object.entries(seed).map(([businessId, business]) => [
      businessId,
      {
        timezone: business.timezone,
        appointments: new Map(Object.entries(business.appointments)),
      },
    ])
  );
  const confirmations = new Map<string, Record<string, unknown>>();

  const snapshotFor = (ref: FakeRef): FakeSnapshot => {
    if (ref.kind === "business") {
      const business = businesses.get(ref.businessId);
      return {
        exists: Boolean(business),
        data: () => business ? { timezone: business.timezone } : undefined,
      };
    }
    if (ref.kind === "appointment") {
      const appointment = businesses.get(ref.businessId)?.appointments.get(ref.id);
      return {
        exists: Boolean(appointment),
        data: () => appointment ? { ...appointment } : undefined,
      };
    }
    const confirmation = confirmations.get(`${ref.businessId}/${ref.id}`);
    return {
      exists: Boolean(confirmation),
      data: () => confirmation ? { ...confirmation } : undefined,
    };
  };

  const updateRef = (ref: FakeRef, value: Record<string, unknown>) => {
    if (ref.kind === "appointment") {
      const appointments = businesses.get(ref.businessId)?.appointments;
      const current = appointments?.get(ref.id);
      if (!appointments || !current) throw new Error("Missing appointment");
      appointments.set(ref.id, { ...current, ...value } as AppointmentSeed);
      return;
    }
    if (ref.kind === "confirmation") {
      const key = `${ref.businessId}/${ref.id}`;
      const current = confirmations.get(key);
      if (!current) throw new Error("Missing confirmation");
      confirmations.set(key, { ...current, ...value });
    }
  };

  const makeRef = (
    kind: FakeRef["kind"],
    businessId: string,
    id: string
  ): FakeRef => {
    const ref: FakeRef = {
      kind,
      businessId,
      id,
      get: async () => snapshotFor(ref),
      set: async (value) => {
        if (kind !== "confirmation") throw new Error("Unexpected set");
        confirmations.set(`${businessId}/${id}`, { ...value });
      },
      update: async (value) => updateRef(ref, value),
    };
    if (kind === "business") {
      ref.collection = (name) => {
        if (name === "appointments") {
          return {
            doc: (appointmentId) => makeRef("appointment", businessId, appointmentId),
            get: async () => {
              const appointments = businesses.get(businessId)?.appointments ?? new Map();
              const docs = Array.from(appointments.entries()).map(([appointmentId, value]) => ({
                id: appointmentId,
                data: () => ({ ...value }),
              }));
              return { empty: docs.length === 0, docs };
            },
          };
        }
        if (name === "vapiAppointmentConfirmations") {
          return {
            doc: (confirmationId) => makeRef("confirmation", businessId, confirmationId),
            get: async () => ({ empty: true, docs: [] }),
          };
        }
        throw new Error(`Unexpected collection ${name}`);
      };
    }
    return ref;
  };

  const db = {
    collection: (name: string) => {
      if (name !== "businesses") throw new Error(`Unexpected root collection ${name}`);
      return {
        doc: (businessId: string) => makeRef("business", businessId, businessId),
      };
    },
    runTransaction: async <T>(callback: (transaction: {
      get: (ref: FakeRef) => Promise<FakeSnapshot>;
      update: (ref: FakeRef, value: Record<string, unknown>) => void;
    }) => Promise<T>) => callback({
      get: async (ref) => snapshotFor(ref),
      update: (ref, value) => updateRef(ref, value),
    }),
  };

  return { db, businesses, confirmations };
}

const startTime = Date.UTC(2026, 6, 22, 17, 0, 0);

function baseSeed(): Record<string, BusinessSeed> {
  return {
    biz_a: {
      timezone: "America/Los_Angeles",
      appointments: {
        apt_alice: {
          appointmentId: "apt_alice",
          callerName: "Alice Example",
          callerPhone: "+1 (604) 555-1234",
          serviceType: "Roof inspection",
          address: "123 Secret Lane",
          startTime,
          status: "confirmed",
        },
        apt_bob: {
          appointmentId: "apt_bob",
          callerName: "Bob Private",
          callerPhone: "+1 (604) 555-9876",
          serviceType: "Private mold visit",
          address: "999 Hidden Road",
          startTime: startTime + 60 * 60 * 1000,
          status: "confirmed",
        },
        apt_cancelled: {
          appointmentId: "apt_cancelled",
          callerName: "Alice Example",
          callerPhone: "16045551234",
          serviceType: "Cancelled private service",
          address: "123 Secret Lane",
          startTime: startTime + 2 * 60 * 60 * 1000,
          status: "cancelled",
        },
      },
    },
    biz_b: {
      timezone: "America/Los_Angeles",
      appointments: {},
    },
  };
}

describe("verified appointment identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("reveals nothing when caller ID is unavailable, despite name/address guesses", async () => {
    const { db } = createFirestore(baseSeed());
    mocks.getAdminFirestore.mockReturnValue(db);

    const result = await lookupAppointment({
      businessId: "biz_a",
      callId: "call_no_id",
      callerName: "Bob",
      address: "999 Hidden Road",
      callerPhone: "+1 (604) 555-9876",
    });

    expect(result).toBe("I can't verify you from caller ID — the office will call back.");
    expect(result).not.toContain("Bob");
    expect(result).not.toContain("Hidden");
    expect(mocks.getAdminFirestore).not.toHaveBeenCalled();
  });

  it("does not disclose appointments belonging to a different caller", async () => {
    const { db, confirmations } = createFirestore(baseSeed());
    mocks.getAdminFirestore.mockReturnValue(db);

    const result = await lookupAppointment({
      businessId: "biz_a",
      callId: "call_attacker",
      verifiedCallerPhone: "+1 (604) 555-0000",
      callerName: "Alice Example",
      address: "123 Secret Lane",
    });

    expect(result).toBe("No active appointment was found for the verified caller number.");
    expect(result).not.toContain("Roof inspection");
    expect(confirmations.size).toBe(0);
  });

  it("cannot cancel by guessing an ID when caller identity is unavailable", async () => {
    const { db, businesses } = createFirestore(baseSeed());
    mocks.getAdminFirestore.mockReturnValue(db);

    await lookupAppointment({
      businessId: "biz_a",
      callId: "call_guess",
      callerName: "Alice Example",
      address: "123 Secret Lane",
      callerPhone: "+1 (604) 555-1234",
    });

    await expect(cancelAppointment({
      businessId: "biz_a",
      callId: "call_guess",
      confirmCancellation: true,
      appointmentId: "apt_alice",
    })).rejects.toThrow("I can't verify you from caller ID");
    expect(businesses.get("biz_a")?.appointments.get("apt_alice")?.status).toBe("confirmed");
  });

  it("cannot use another caller's number against a verified lookup", async () => {
    const { db, businesses } = createFirestore(baseSeed());
    mocks.getAdminFirestore.mockReturnValue(db);

    await lookupAppointment({
      businessId: "biz_a",
      callId: "call_cross_customer",
      verifiedCallerPhone: "16045551234",
    });

    await expect(cancelAppointment({
      businessId: "biz_a",
      callId: "call_cross_customer",
      verifiedCallerPhone: "16045559876",
      confirmCancellation: true,
      appointmentId: "apt_alice",
    })).rejects.toThrow("No recent verified appointment lookup");
    expect(businesses.get("biz_a")?.appointments.get("apt_alice")?.status).toBe("confirmed");
  });

  it("rejects appointment-ID replay without a lookup in the same call", async () => {
    const { db, businesses } = createFirestore(baseSeed());
    mocks.getAdminFirestore.mockReturnValue(db);

    await lookupAppointment({
      businessId: "biz_a",
      callId: "call_original",
      verifiedCallerPhone: "16045551234",
    });

    await expect(cancelAppointment({
      businessId: "biz_a",
      callId: "call_replay",
      verifiedCallerPhone: "16045551234",
      confirmCancellation: true,
      appointmentId: "apt_alice",
    })).rejects.toThrow("No recent verified appointment lookup");
    expect(businesses.get("biz_a")?.appointments.get("apt_alice")?.status).toBe("confirmed");
  });

  it("rejects a confirmation replay across businesses", async () => {
    const { db, businesses } = createFirestore(baseSeed());
    mocks.getAdminFirestore.mockReturnValue(db);

    await lookupAppointment({
      businessId: "biz_a",
      callId: "call_shared",
      verifiedCallerPhone: "16045551234",
    });

    await expect(cancelAppointment({
      businessId: "biz_b",
      callId: "call_shared",
      verifiedCallerPhone: "16045551234",
      confirmCancellation: true,
      appointmentId: "apt_alice",
    })).rejects.toThrow("No recent verified appointment lookup");
    expect(businesses.get("biz_a")?.appointments.get("apt_alice")?.status).toBe("confirmed");
  });

  it("requires explicit confirmation after a verified lookup", async () => {
    const { db, businesses } = createFirestore(baseSeed());
    mocks.getAdminFirestore.mockReturnValue(db);

    await lookupAppointment({
      businessId: "biz_a",
      callId: "call_unconfirmed",
      verifiedCallerPhone: "16045551234",
    });

    await expect(cancelAppointment({
      businessId: "biz_a",
      callId: "call_unconfirmed",
      verifiedCallerPhone: "16045551234",
    })).rejects.toThrow("confirm the cancellation");
    expect(businesses.get("biz_a")?.appointments.get("apt_alice")?.status).toBe("confirmed");
  });

  it("returns minimum details and cancels the verified caller's single appointment", async () => {
    const { db, businesses } = createFirestore(baseSeed());
    mocks.getAdminFirestore.mockReturnValue(db);

    const lookup = await lookupAppointment({
      businessId: "biz_a",
      callId: "call_happy",
      verifiedCallerPhone: "1-604-555-1234",
    });

    expect(lookup).toContain("Appointment 1: Roof inspection");
    expect(lookup).toContain("confirm cancellation");
    expect(lookup).not.toContain("apt_alice");
    expect(lookup).not.toContain("Alice Example");
    expect(lookup).not.toContain("Secret Lane");
    expect(lookup).not.toContain("Private mold visit");
    expect(lookup).not.toContain("Cancelled private service");

    const cancelled = await cancelAppointment({
      businessId: "biz_a",
      callId: "call_happy",
      verifiedCallerPhone: "+1 (604) 555-1234",
      confirmCancellation: true,
    });

    expect(cancelled).toEqual({
      cancelled: true,
      serviceType: "Roof inspection",
      startTime,
    });
    expect(businesses.get("biz_a")?.appointments.get("apt_alice")?.status).toBe("cancelled");
  });

  it("lists multiple appointments with minimum data and cancels the selected number", async () => {
    const seed = baseSeed();
    seed.biz_a.appointments.apt_alice_second = {
      appointmentId: "apt_alice_second",
      callerName: "Alice Example",
      callerPhone: "1 604 555 1234",
      serviceType: "Gutter cleaning",
      address: "123 Secret Lane",
      startTime: startTime + 24 * 60 * 60 * 1000,
      status: "requested",
    };
    const { db, businesses } = createFirestore(seed);
    mocks.getAdminFirestore.mockReturnValue(db);

    const lookup = await lookupAppointment({
      businessId: "biz_a",
      callId: "call_multiple",
      verifiedCallerPhone: "16045551234",
    });

    expect(lookup).toContain("Appointment 1: Roof inspection");
    expect(lookup).toContain("Appointment 2: Gutter cleaning");
    expect(lookup).toContain("appointmentNumber");

    await cancelAppointment({
      businessId: "biz_a",
      callId: "call_multiple",
      verifiedCallerPhone: "16045551234",
      confirmCancellation: true,
      appointmentNumber: 2,
    });

    expect(businesses.get("biz_a")?.appointments.get("apt_alice")?.status).toBe("confirmed");
    expect(businesses.get("biz_a")?.appointments.get("apt_alice_second")?.status).toBe("cancelled");
  });
});
