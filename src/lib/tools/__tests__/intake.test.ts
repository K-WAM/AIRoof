import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminFirestore } from "@/lib/firebase/admin";
import {
  bookAppointment,
  createLead,
  intakeFieldsForIndustry,
  mergeIntake,
  parseIntakeFromNotes,
  resolveIntake,
} from "@/lib/tools/agentTools";
import { VERTICAL_TEMPLATES, type IntakeField } from "@/lib/verticals/templates";

// T-100 — intake parsing and persistence. The Vapi tool schema cannot change
// (NH-1), so intake travels inside the existing "notes" parameter as
// "Label: value" lines; these tests prove those lines become a structured
// `intake` map on the lead/appointment without touching the free-text notes.

type StoredDocument = Record<string, unknown>;

class FakeSnapshot {
  constructor(
    readonly ref: FakeDocRef,
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
  readonly filters: Array<[string, string, unknown]> = [];
  constructor(
    readonly firestore: FakeFirestore,
    readonly path: string
  ) {}
  where(field: string, operator: string, value: unknown) {
    this.filters.push([field, operator, value]);
    return this;
  }
  async get() {
    const segmentCount = this.path.split("/").length + 1;
    const docs = [...this.firestore.documents.entries()]
      .filter(
        ([path]) =>
          path.startsWith(`${this.path}/`) && path.split("/").length === segmentCount
      )
      .filter(([, data]) =>
        this.filters.every(([field, operator, expected]) => {
          const actual = data[field];
          if (operator === "==") return actual === expected;
          if (operator === "<")
            return typeof actual === "number" && typeof expected === "number" && actual < expected;
          return false;
        })
      )
      .map(
        ([path, data]) =>
          new FakeSnapshot(new FakeDocRef(this.firestore, path), data)
      );
    return { docs, empty: docs.length === 0 };
  }
}

class FakeCollectionRef extends FakeQuery {
  doc(id?: string) {
    return new FakeDocRef(
      this.firestore,
      `${this.path}/${id ?? `auto-${this.firestore.nextId++}`}`
    );
  }
}

class FakeDocRef {
  readonly id: string;
  constructor(
    readonly firestore: FakeFirestore,
    readonly path: string
  ) {
    this.id = path.split("/").at(-1) ?? "";
  }
  collection(name: string) {
    return new FakeCollectionRef(this.firestore, `${this.path}/${name}`);
  }
  async get() {
    return new FakeSnapshot(this, this.firestore.documents.get(this.path));
  }
  async set(value: StoredDocument) {
    this.firestore.documents.set(this.path, { ...value });
  }
}

class FakeTransaction {
  constructor(private readonly firestore: FakeFirestore) {}
  get(reference: FakeDocRef | FakeQuery) {
    return reference.get();
  }
  create(reference: FakeDocRef, value: StoredDocument) {
    if (this.firestore.documents.has(reference.path)) {
      throw new Error(`Document already exists: ${reference.path}`);
    }
    this.firestore.documents.set(reference.path, { ...value });
  }
}

class FakeFirestore {
  readonly documents = new Map<string, StoredDocument>();
  nextId = 1;
  collection(name: string) {
    return new FakeCollectionRef(this, name);
  }
  async runTransaction<T>(callback: (transaction: FakeTransaction) => Promise<T>): Promise<T> {
    return callback(new FakeTransaction(this));
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

const dentalFields = VERTICAL_TEMPLATES.dental.intakeFields;

beforeEach(() => {
  vi.mocked(getAdminFirestore).mockReset();
});

describe("parseIntakeFromNotes", () => {
  it("parses Label: value lines into a keyed map", () => {
    const parsed = parseIntakeFromNotes(
      "New or returning patient: New patient\nInsurance: yes\nInsurance provider: Aetna",
      dentalFields
    );
    expect(parsed).toEqual({
      "patient-status": "New patient",
      insurance: "yes",
      "insurance-provider": "Aetna",
    });
  });

  it("is case-insensitive on the label and trims values", () => {
    const parsed = parseIntakeFromNotes("insurance:  YES  ", dentalFields);
    expect(parsed).toEqual({ insurance: "YES" });
  });

  it("ignores lines that are not intake field labels", () => {
    const parsed = parseIntakeFromNotes(
      "Caller says tooth hurts.\nAddress: 123 Main St\nInsurance: yes",
      dentalFields
    );
    expect(parsed).toEqual({ insurance: "yes" });
  });

  it("ignores labels from a different vertical's field set", () => {
    const parsed = parseIntakeFromNotes("Unit number: 4B\nInsurance: yes", dentalFields);
    expect(parsed).toEqual({ insurance: "yes" });
  });

  it("returns undefined for empty notes or no matches", () => {
    expect(parseIntakeFromNotes(undefined, dentalFields)).toBeUndefined();
    expect(parseIntakeFromNotes("", dentalFields)).toBeUndefined();
    expect(parseIntakeFromNotes("Just some prose.", dentalFields)).toBeUndefined();
  });

  it("skips label lines with no value", () => {
    const parsed = parseIntakeFromNotes("Insurance:", dentalFields);
    expect(parsed).toBeUndefined();
  });
});

describe("mergeIntake and resolveIntake", () => {
  it("lets an explicit intake map win over values parsed from notes", () => {
    const merged = mergeIntake({ insurance: "yes" }, { insurance: "no" });
    expect(merged).toEqual({ insurance: "no" });
  });

  it("returns undefined when both sources are empty", () => {
    expect(mergeIntake(undefined, undefined)).toBeUndefined();
    expect(mergeIntake({}, {})).toBeUndefined();
  });

  it("resolves against the vertical's own field set only", () => {
    expect(
      resolveIntake({
        industry: "dental",
        notes: "Insurance: yes\nUnit number: 4B",
      })
    ).toEqual({ insurance: "yes" });
    expect(resolveIntake({ industry: "property-management", notes: "Unit number: 4B" })).toEqual({
      "unit-number": "4B",
    });
  });

  it("fails open (no parsing) for an unknown or missing industry", () => {
    expect(resolveIntake({ notes: "Insurance: yes" })).toBeUndefined();
    expect(resolveIntake({ industry: "not-a-real-industry", notes: "Insurance: yes" })).toBeUndefined();
  });

  it("returns the explicit map unchanged when notes carry nothing", () => {
    expect(
      resolveIntake({ industry: "dental", intake: { insurance: "yes" } })
    ).toEqual({ insurance: "yes" });
  });

  it("intakeFieldsForIndustry returns [] for unknown industries", () => {
    expect(intakeFieldsForIndustry("dental")).toBe(VERTICAL_TEMPLATES.dental.intakeFields);
    expect(intakeFieldsForIndustry("nope")).toEqual([]);
    expect(intakeFieldsForIndustry(undefined)).toEqual([]);
  });
});

describe("createLead persists structured intake", () => {
  it("parses Label: value notes into lead.intake and keeps the free-text notes", async () => {
    const firestore = new FakeFirestore();
    firestore.documents.set("businesses/biz-dental", { industry: "dental" });
    vi.mocked(getAdminFirestore).mockReturnValue(firestore as never);

    const notes = "Needs a cleaning soon.\nNew or returning patient: New patient\nInsurance: yes";
    const lead = await createLead({
      businessId: "biz-dental",
      callerName: "Dana",
      urgency: "normal",
      notes,
    });

    expect(lead.intake).toEqual({ "patient-status": "New patient", insurance: "yes" });
    expect(lead.notes).toBe(notes);

    const stored = [...firestore.documents.values()].find((doc) =>
      typeof (doc as { callerName?: unknown }).callerName === "string"
    ) as StoredDocument;
    expect(stored.intake).toEqual({ "patient-status": "New patient", insurance: "yes" });
  });

  it("leaves legacy leads without intake untouched", async () => {
    const firestore = new FakeFirestore();
    firestore.documents.set("businesses/biz-dental", { industry: "dental" });
    vi.mocked(getAdminFirestore).mockReturnValue(firestore as never);

    const lead = await createLead({
      businessId: "biz-dental",
      callerName: "Dana",
      urgency: "normal",
      notes: "Wants a callback Tuesday.",
    });

    expect(lead.intake ?? null).toBeNull();
    expect(lead.notes).toBe("Wants a callback Tuesday.");
  });
});

describe("bookAppointment persists structured intake", () => {
  it("parses Label: value notes into appointment.intake", async () => {
    const firestore = new FakeFirestore();
    firestore.documents.set("businesses/biz-hvac", {
      industry: "hvac",
      businessHours: weekdayHours,
      timezone: "America/New_York",
    });
    vi.mocked(getAdminFirestore).mockReturnValue(firestore as never);

    const startTime = Date.parse("2030-07-23T14:00:00.000Z"); // Tuesday 10am ET
    const appt = await bookAppointment({
      businessId: "biz-hvac",
      callerName: "Ray",
      callerPhone: "+15555550120",
      startTime,
      endTime: startTime + 60 * 60 * 1000,
      notes: "AC won't cool upstairs.\nSystem type: Central AC\nSystem age: Over 10 years",
    });

    expect(appt.intake).toEqual({ "system-type": "Central AC", "system-age": "Over 10 years" });

    const stored = [...firestore.documents.values()].find((doc) =>
      typeof (doc as { callerName?: unknown }).callerName === "string"
    ) as StoredDocument;
    expect(stored.intake).toEqual({ "system-type": "Central AC", "system-age": "Over 10 years" });
  });

  it("stores no intake for a booking whose notes carry no matching lines", async () => {
    const firestore = new FakeFirestore();
    firestore.documents.set("businesses/biz-hvac", {
      industry: "hvac",
      businessHours: weekdayHours,
      timezone: "America/New_York",
    });
    vi.mocked(getAdminFirestore).mockReturnValue(firestore as never);

    const startTime = Date.parse("2030-07-23T15:00:00.000Z");
    const appt = await bookAppointment({
      businessId: "biz-hvac",
      callerName: "Ray",
      callerPhone: "+15555550120",
      startTime,
      endTime: startTime + 60 * 60 * 1000,
      notes: "Prefers mornings.",
    });

    expect(appt.intake ?? null).toBeNull();
  });
});

describe("intake fields stay within the hard-rule set for restricted verticals", () => {
  it("care-homes and daycares intake never mentions health or identity terms", () => {
    const forbidden = /diagnos|allerg|medicat|condition|symptom|health|presence|whereabout/i;
    for (const id of ["care-homes", "daycares"] as const) {
      const fields: IntakeField[] = VERTICAL_TEMPLATES[id].intakeFields;
      const text = fields.flatMap((f) => [f.label, ...(f.options ?? [])]).join(" ");
      expect(text).not.toMatch(forbidden);
      expect(fields.some((f) => f.type === "text")).toBe(false);
    }
  });
});
