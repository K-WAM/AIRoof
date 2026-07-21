import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const providerMocks = vi.hoisted(() => ({
  generateFaqSuggestions: vi.fn(),
  getAdminFirestore: vi.fn(),
  initiateVapiCall: vi.fn(),
  summarizeTranscript: vi.fn(),
}));

vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: providerMocks.getAdminFirestore,
}));
vi.mock("@/lib/vapi/vapiClient", () => ({
  initiateVapiCall: providerMocks.initiateVapiCall,
}));
vi.mock("@/lib/ai/deepseekClient", () => ({
  generateFaqSuggestions: providerMocks.generateFaqSuggestions,
  summarizeTranscript: providerMocks.summarizeTranscript,
}));

import { POST as summarizeCalls } from "@/app/api/cron/daily-call-summary/route";
import { POST as suggestFaqs } from "@/app/api/cron/faq-suggestions/route";
import { GET as followUpCalls } from "@/app/api/cron/follow-up-calls/route";
import { createLead } from "@/lib/tools/agentTools";

type StoredDocument = Record<string, unknown>;
type QueryFilter = [field: string, operator: string, expected: unknown];

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
  readonly filters: QueryFilter[] = [];
  private orderByField?: string;
  private orderDirection: "asc" | "desc" = "asc";
  private queryLimit?: number;

  constructor(
    protected readonly firestore: FakeFirestore,
    readonly path: string
  ) {}

  where(field: string, operator: string, expected: unknown) {
    this.filters.push([field, operator, expected]);
    return this;
  }

  orderBy(field: string, direction: "asc" | "desc" = "asc") {
    this.orderByField = field;
    this.orderDirection = direction;
    return this;
  }

  limit(value: number) {
    this.queryLimit = value;
    return this;
  }

  async get() {
    const expectedSegments = this.path.split("/").length + 1;
    let matches = [...this.firestore.documents.entries()]
      .filter(
        ([path]) =>
          path.startsWith(`${this.path}/`) && path.split("/").length === expectedSegments
      )
      .filter(([, data]) =>
        this.filters.every(([field, operator, expected]) => {
          const actual = data[field];
          if (operator === "==") return actual === expected;
          if (operator === "!=") return actual !== undefined && actual !== expected;
          if (operator === "<=") {
            return typeof actual === "number" &&
              typeof expected === "number" &&
              actual <= expected;
          }
          if (operator === ">=") {
            return typeof actual === "number" &&
              typeof expected === "number" &&
              actual >= expected;
          }
          throw new Error(`Unsupported fake query operator: ${operator}`);
        })
      );

    if (this.orderByField) {
      const field = this.orderByField;
      const direction = this.orderDirection === "asc" ? 1 : -1;
      matches = matches.sort(([, left], [, right]) => {
        const a = Number(left[field]);
        const b = Number(right[field]);
        return (a - b) * direction;
      });
    }
    if (this.queryLimit !== undefined) matches = matches.slice(0, this.queryLimit);

    this.firestore.queryLog.push({ path: this.path, filters: [...this.filters] });
    return {
      docs: matches.map(
        ([path, data]) =>
          new FakeDocumentSnapshot(new FakeDocumentReference(this.firestore, path), data)
      ),
      empty: matches.length === 0,
    };
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

  async set(value: StoredDocument) {
    this.firestore.documents.set(this.path, { ...value });
  }

  async update(value: StoredDocument) {
    const current = this.firestore.documents.get(this.path);
    if (!current) throw new Error(`Document does not exist: ${this.path}`);
    this.firestore.documents.set(this.path, { ...current, ...value });
  }
}

class FakeTransaction {
  private readonly writes: Array<() => void> = [];

  constructor(private readonly firestore: FakeFirestore) {}

  get(reference: FakeDocumentReference) {
    return reference.get();
  }

  create(reference: FakeDocumentReference, value: StoredDocument) {
    if (this.firestore.documents.has(reference.path)) {
      throw new Error(`Document already exists: ${reference.path}`);
    }
    this.writes.push(() => this.firestore.documents.set(reference.path, { ...value }));
  }

  set(reference: FakeDocumentReference, value: StoredDocument) {
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

  commit() {
    this.writes.forEach((write) => write());
  }
}

class FakeWriteBatch {
  private readonly writes: Array<() => void> = [];

  constructor(private readonly firestore: FakeFirestore) {}

  set(reference: FakeDocumentReference, value: StoredDocument) {
    this.writes.push(() => this.firestore.documents.set(reference.path, { ...value }));
    return this;
  }

  update(reference: FakeDocumentReference, value: StoredDocument) {
    this.writes.push(() => {
      const current = this.firestore.documents.get(reference.path);
      if (!current) throw new Error(`Document does not exist: ${reference.path}`);
      this.firestore.documents.set(reference.path, { ...current, ...value });
    });
    return this;
  }

  async commit() {
    this.writes.forEach((write) => write());
  }
}

class FakeFirestore {
  readonly documents = new Map<string, StoredDocument>();
  readonly queryLog: Array<{ path: string; filters: QueryFilter[] }> = [];
  nextId = 1;
  private transactionQueue: Promise<void> = Promise.resolve();

  collection(name: string) {
    return new FakeCollectionReference(this, name);
  }

  batch() {
    return new FakeWriteBatch(this);
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

const NOW = Date.UTC(2026, 6, 21, 18, 0, 0);
const CRON_SECRET = "test-cron-secret";

function cronRequest(
  path: string,
  method: "GET" | "POST",
  secret?: string,
  body?: StoredDocument
) {
  const headers: Record<string, string> = {};
  if (secret !== undefined) headers.authorization = `Bearer ${secret}`;
  if (body) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function seedCallbackBusiness(firestore: FakeFirestore, overrides: StoredDocument = {}) {
  firestore.documents.set("businesses/biz-1", {
    businessName: "Example Services",
    vapiAssistantId: "assistant-1",
    vapiPhoneNumberId: "phone-1",
    callbackDelayMinutes: 5,
    callbackWindowStart: 0,
    callbackWindowEnd: 24,
    maxCallAttempts: 3,
    timezone: "UTC",
    ...overrides,
  });
}

function seedLead(firestore: FakeFirestore, id: string, overrides: StoredDocument = {}) {
  firestore.documents.set(`businesses/biz-1/leads/${id}`, {
    leadId: id,
    businessId: "biz-1",
    callerPhone: "+15555550123",
    callbackState: "pending",
    callbackConsent: true,
    callbackDueAt: NOW - 1,
    callAttempts: 0,
    ...overrides,
  });
}

describe("cron authentication boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const routes = [
    {
      name: "follow-up calls",
      invoke: (secret?: string) =>
        followUpCalls(cronRequest("/api/cron/follow-up-calls", "GET", secret)),
    },
    {
      name: "daily call summary",
      invoke: (secret?: string) =>
        summarizeCalls(
          cronRequest("/api/cron/daily-call-summary", "POST", secret, { businessId: "biz-1" })
        ),
    },
    {
      name: "FAQ suggestions",
      invoke: (secret?: string) =>
        suggestFaqs(
          cronRequest("/api/cron/faq-suggestions", "POST", secret, { businessId: "biz-1" })
        ),
    },
  ];

  it.each(routes)("rejects a missing Bearer token before side effects: $name", async ({ invoke }) => {
    const response = await invoke();

    expect(response.status).toBe(401);
    expect(providerMocks.getAdminFirestore).not.toHaveBeenCalled();
    expect(providerMocks.initiateVapiCall).not.toHaveBeenCalled();
    expect(providerMocks.summarizeTranscript).not.toHaveBeenCalled();
    expect(providerMocks.generateFaqSuggestions).not.toHaveBeenCalled();
  });

  it.each(routes)("rejects an invalid Bearer token before side effects: $name", async ({ invoke }) => {
    const response = await invoke("wrong-secret");

    expect(response.status).toBe(401);
    expect(providerMocks.getAdminFirestore).not.toHaveBeenCalled();
    expect(providerMocks.initiateVapiCall).not.toHaveBeenCalled();
    expect(providerMocks.summarizeTranscript).not.toHaveBeenCalled();
    expect(providerMocks.generateFaqSuggestions).not.toHaveBeenCalled();
  });
});

describe("lead callback initialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates configured callbacks as pending with an explicit due time and default-deny consent", async () => {
    const firestore = new FakeFirestore();
    seedCallbackBusiness(firestore, { callbackDelayMinutes: 30 });
    providerMocks.getAdminFirestore.mockReturnValue(firestore as never);

    await createLead({
      businessId: "biz-1",
      callerPhone: "+15555550123",
      urgency: "normal",
    });

    expect(firestore.documents.get("businesses/biz-1/leads/lead_1784656800000")).toMatchObject({
      callbackState: "pending",
      callbackDueAt: NOW + 30 * 60 * 1000,
      callbackConsent: false,
    });
    expect(providerMocks.initiateVapiCall).not.toHaveBeenCalled();
  });

  it("persists explicit consent but disables callbacks when delay configuration is absent", async () => {
    const firestore = new FakeFirestore();
    seedCallbackBusiness(firestore);
    const business = firestore.documents.get("businesses/biz-1")!;
    delete business.callbackDelayMinutes;
    providerMocks.getAdminFirestore.mockReturnValue(firestore as never);

    await createLead({
      businessId: "biz-1",
      callerPhone: "+15555550123",
      urgency: "normal",
      callbackConsent: true,
    });

    expect(firestore.documents.get("businesses/biz-1/leads/lead_1784656800000")).toMatchObject({
      callbackState: "none",
      callbackDueAt: null,
      callbackConsent: true,
    });
  });
});

describe("follow-up callback state machine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("queries only due consented leads and records exactly one ledgered attempt", async () => {
    const firestore = new FakeFirestore();
    seedCallbackBusiness(firestore);
    seedLead(firestore, "lead-1");
    seedLead(firestore, "lead-2", { callbackDueAt: NOW - 2 });
    providerMocks.getAdminFirestore.mockReturnValue(firestore as never);
    providerMocks.initiateVapiCall.mockResolvedValue({ id: "vapi-call-1", status: "queued" });

    const response = await followUpCalls(
      cronRequest("/api/cron/follow-up-calls", "GET", CRON_SECRET)
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ attempted: 1, errors: [] });
    expect(providerMocks.initiateVapiCall).toHaveBeenCalledOnce();
    expect(firestore.queryLog).toContainEqual({
      path: "businesses/biz-1/leads",
      filters: [
        ["callbackState", "==", "pending"],
        ["callbackConsent", "==", true],
        ["callbackDueAt", "<=", NOW],
      ],
    });
    expect(
      firestore.documents.get("businesses/biz-1/operations/callback:lead-2:1")
    ).toMatchObject({ state: "succeeded", attemptCount: 1, lastProviderId: "vapi-call-1" });
    expect(
      firestore.documents.get(
        "businesses/biz-1/operations/callback:lead-2:1/attempts/000001"
      )
    ).toMatchObject({ state: "succeeded", providerId: "vapi-call-1" });
    expect(firestore.documents.get("businesses/biz-1/leads/lead-2")).toMatchObject({
      callAttempts: 1,
      callbackState: "pending",
      callbackDueAt: NOW + 4 * 60 * 60 * 1000,
    });
  });

  it("lets only one overlapping invocation call the provider for the same lead", async () => {
    const firestore = new FakeFirestore();
    seedCallbackBusiness(firestore, { maxCallAttempts: 1 });
    seedLead(firestore, "lead-race");
    providerMocks.getAdminFirestore.mockReturnValue(firestore as never);

    let resolveProvider:
      | ((value: { id: string; status: string }) => void)
      | undefined;
    providerMocks.initiateVapiCall.mockReturnValue(
      new Promise((resolve) => {
        resolveProvider = resolve;
      })
    );

    const first = followUpCalls(
      cronRequest("/api/cron/follow-up-calls", "GET", CRON_SECRET)
    );
    await vi.waitFor(() => expect(providerMocks.initiateVapiCall).toHaveBeenCalledOnce());
    const duplicate = await followUpCalls(
      cronRequest("/api/cron/follow-up-calls", "GET", CRON_SECRET)
    );

    expect(await duplicate.json()).toMatchObject({ attempted: 0 });
    resolveProvider?.({ id: "vapi-race", status: "queued" });
    expect(await (await first).json()).toMatchObject({ attempted: 1 });
    expect(providerMocks.initiateVapiCall).toHaveBeenCalledOnce();
    expect(
      firestore.documents.get("businesses/biz-1/operations/callback:lead-race:1")
    ).toMatchObject({ state: "succeeded", attemptCount: 1 });
    expect(firestore.documents.get("businesses/biz-1/leads/lead-race")).toMatchObject({
      callAttempts: 1,
      callbackState: "none",
      callbackDueAt: null,
    });
  });

  it("leaves an ambiguous provider failure pending and does not duplicate it", async () => {
    const firestore = new FakeFirestore();
    seedCallbackBusiness(firestore);
    seedLead(firestore, "ambiguous-lead");
    providerMocks.getAdminFirestore.mockReturnValue(firestore as never);
    providerMocks.initiateVapiCall.mockRejectedValue(new Error("network timeout"));

    const first = await followUpCalls(
      cronRequest("/api/cron/follow-up-calls", "GET", CRON_SECRET)
    );
    const duplicate = await followUpCalls(
      cronRequest("/api/cron/follow-up-calls", "GET", CRON_SECRET)
    );

    expect(await first.json()).toMatchObject({ attempted: 1 });
    expect(await duplicate.json()).toMatchObject({ attempted: 0 });
    expect(providerMocks.initiateVapiCall).toHaveBeenCalledOnce();
    expect(
      firestore.documents.get("businesses/biz-1/operations/callback:ambiguous-lead:1")
    ).toMatchObject({ state: "pending", attemptCount: 1 });
    expect(
      firestore.documents.get(
        "businesses/biz-1/operations/callback:ambiguous-lead:1/attempts/000001"
      )
    ).toMatchObject({ state: "pending" });
  });

  it("skips businesses without callbackDelayMinutes instead of defaulting them", async () => {
    const firestore = new FakeFirestore();
    seedCallbackBusiness(firestore);
    delete firestore.documents.get("businesses/biz-1")!.callbackDelayMinutes;
    seedLead(firestore, "lead-1");
    providerMocks.getAdminFirestore.mockReturnValue(firestore as never);

    const response = await followUpCalls(
      cronRequest("/api/cron/follow-up-calls", "GET", CRON_SECRET)
    );

    expect(await response.json()).toMatchObject({ attempted: 0, skipped: 1 });
    expect(providerMocks.initiateVapiCall).not.toHaveBeenCalled();
    expect(
      [...firestore.documents.keys()].some((path) => path.includes("/operations/"))
    ).toBe(false);
  });

  it("excludes existing leads without explicit callback consent", async () => {
    const firestore = new FakeFirestore();
    seedCallbackBusiness(firestore);
    seedLead(firestore, "legacy-lead");
    delete firestore.documents.get("businesses/biz-1/leads/legacy-lead")!.callbackConsent;
    providerMocks.getAdminFirestore.mockReturnValue(firestore as never);

    const response = await followUpCalls(
      cronRequest("/api/cron/follow-up-calls", "GET", CRON_SECRET)
    );

    expect(await response.json()).toMatchObject({ attempted: 0 });
    expect(providerMocks.initiateVapiCall).not.toHaveBeenCalled();
  });

  it("honors the configured call-attempt cap", async () => {
    const firestore = new FakeFirestore();
    seedCallbackBusiness(firestore, { maxCallAttempts: 3 });
    seedLead(firestore, "exhausted-lead", { callAttempts: 3 });
    providerMocks.getAdminFirestore.mockReturnValue(firestore as never);

    const response = await followUpCalls(
      cronRequest("/api/cron/follow-up-calls", "GET", CRON_SECRET)
    );

    expect(await response.json()).toMatchObject({ attempted: 0 });
    expect(providerMocks.initiateVapiCall).not.toHaveBeenCalled();
  });

  it("does not call outside the business callback window", async () => {
    const firestore = new FakeFirestore();
    seedCallbackBusiness(firestore, {
      callbackWindowStart: 8,
      callbackWindowEnd: 17,
      timezone: "UTC",
    });
    seedLead(firestore, "after-hours-lead");
    providerMocks.getAdminFirestore.mockReturnValue(firestore as never);

    const response = await followUpCalls(
      cronRequest("/api/cron/follow-up-calls", "GET", CRON_SECRET)
    );

    expect(await response.json()).toMatchObject({ attempted: 0, skipped: 1 });
    expect(providerMocks.initiateVapiCall).not.toHaveBeenCalled();
  });
});

describe("authenticated summary and FAQ jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("summarizes a transcript after valid Bearer authentication", async () => {
    const firestore = new FakeFirestore();
    firestore.documents.set("businesses/biz-1", { businessName: "Example Services" });
    firestore.documents.set("businesses/biz-1/calls/call-1", {
      startedAt: NOW - 1000,
      messages: [{ role: "user", text: "I need service." }],
    });
    providerMocks.getAdminFirestore.mockReturnValue(firestore as never);
    providerMocks.summarizeTranscript.mockResolvedValue("Service requested.");

    const response = await summarizeCalls(
      cronRequest("/api/cron/daily-call-summary", "POST", CRON_SECRET, {
        businessId: "biz-1",
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, processed: 1 });
    expect(firestore.documents.get("businesses/biz-1/calls/call-1")).toMatchObject({
      summary: "Service requested.",
      summarizedAt: NOW,
    });
  });

  it("persists FAQ suggestions for review after valid Bearer authentication", async () => {
    const firestore = new FakeFirestore();
    firestore.documents.set("businesses/biz-1", {
      businessName: "Example Services",
      approvedFaqs: [],
    });
    firestore.documents.set("businesses/biz-1/calls/call-1", {
      startedAt: NOW - 1000,
      summary: "Caller asked about service areas.",
    });
    providerMocks.getAdminFirestore.mockReturnValue(firestore as never);
    providerMocks.generateFaqSuggestions.mockResolvedValue([
      { question: "Where do you work?", answer: "Across the configured service area." },
    ]);

    const response = await suggestFaqs(
      cronRequest("/api/cron/faq-suggestions", "POST", CRON_SECRET, {
        businessId: "biz-1",
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, sourceCallCount: 1 });
    expect(
      firestore.documents.get("businesses/biz-1/faqSuggestions/faq_suggestions_1784656800000")
    ).toMatchObject({ status: "pending_review", sourceCallCount: 1 });
  });
});
