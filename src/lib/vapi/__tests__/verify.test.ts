import { Timestamp, type Firestore } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VapiMessage } from "@/lib/vapi/types";
import {
  claimVapiWebhookEvent,
  getVapiEventIdentity,
  VAPI_REPLAY_WINDOW_MS,
  verifyVapiWebhook,
} from "@/lib/vapi/verify";

function webhookRequest(headers: Record<string, string> = {}): NextRequest {
  return { headers: new Headers(headers) } as NextRequest;
}

function webhookMessage(overrides: Record<string, unknown> = {}): VapiMessage {
  return {
    id: "msg_123",
    type: "end-of-call-report",
    call: { id: "call_123", assistantId: "assistant_123" },
    ...overrides,
  } as VapiMessage;
}

function createReplayDb(initial: Record<string, Record<string, unknown>> = {}) {
  const documents = new Map(Object.entries(initial));
  const set = vi.fn(
    (ref: { id: string }, value: Record<string, unknown>) => {
      documents.set(ref.id, value);
    }
  );
  let transactionQueue = Promise.resolve();

  const db = {
    collection: vi.fn(() => ({
      doc: (id: string) => ({ id }),
    })),
    runTransaction: vi.fn(<T>(callback: (transaction: {
      get: (ref: { id: string }) => Promise<{
        exists: boolean;
        data: () => Record<string, unknown> | undefined;
      }>;
      set: typeof set;
    }) => Promise<T>) => {
      const run = transactionQueue.then(() =>
        callback({
          get: async (ref) => ({
            exists: documents.has(ref.id),
            data: () => documents.get(ref.id),
          }),
          set,
        })
      );
      transactionQueue = run.then(() => undefined, () => undefined);
      return run;
    }),
  };

  return { db: db as unknown as Firestore, documents, set };
}

describe("verifyVapiWebhook", () => {
  beforeEach(() => {
    delete process.env.VAPI_WEBHOOK_SECRET;
    delete process.env.VAPI_AUTH_BYPASS;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete process.env.VAPI_WEBHOOK_SECRET;
    delete process.env.VAPI_AUTH_BYPASS;
  });

  it("rejects when the secret is missing, even if the legacy bypass is set", () => {
    process.env.VAPI_AUTH_BYPASS = "true";

    expect(
      verifyVapiWebhook(webhookRequest({ "x-vapi-secret": "provided-secret" }))
    ).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      "Vapi webhook authentication unavailable: VAPI_WEBHOOK_SECRET is not configured"
    );
  });

  it("rejects an unsigned request", () => {
    process.env.VAPI_WEBHOOK_SECRET = "expected-secret";

    expect(verifyVapiWebhook(webhookRequest())).toBe(false);
  });

  it("rejects a wrong secret", () => {
    process.env.VAPI_WEBHOOK_SECRET = "expected-secret";

    expect(
      verifyVapiWebhook(webhookRequest({ "x-vapi-secret": "wrong-secret" }))
    ).toBe(false);
  });

  it("rejects an altered secret of the same length", () => {
    process.env.VAPI_WEBHOOK_SECRET = "expected-secret";

    expect(
      verifyVapiWebhook(webhookRequest({ "x-vapi-secret": "expected-secreu" }))
    ).toBe(false);
  });

  it.each([
    ["x-vapi-secret", "expected-secret"],
    ["x-vapi-signature", "expected-secret"],
    ["vapi-secret", "expected-secret"],
    ["vapi-signature", "expected-secret"],
    ["secret", "expected-secret"],
    ["authorization", "Bearer expected-secret"],
  ])("accepts the configured secret from %s", (header, value) => {
    process.env.VAPI_WEBHOOK_SECRET = " expected-secret ";

    expect(verifyVapiWebhook(webhookRequest({ [header]: value }))).toBe(true);
  });
});

describe("claimVapiWebhookEvent", () => {
  it("rejects an event without a stable call identity before writing", async () => {
    const { db, set } = createReplayDb();
    const message = { type: "status-update", call: {} } as VapiMessage;

    await expect(claimVapiWebhookEvent(db, message)).resolves.toBe("invalid");
    expect(set).not.toHaveBeenCalled();
  });

  it("treats an unexpired prior claim as a replay", async () => {
    const message = webhookMessage();
    const eventId = getVapiEventIdentity(message)!;
    const now = 1_700_000_000_000;
    const { db, set } = createReplayDb({
      [eventId]: { expiresAt: Timestamp.fromMillis(now + 1) },
    });

    await expect(claimVapiWebhookEvent(db, message, now)).resolves.toBe("duplicate");
    expect(set).not.toHaveBeenCalled();
  });

  it("reclaims an expired event using a server-clock TTL", async () => {
    const message = webhookMessage({ timestamp: "2099-01-01T00:00:00.000Z" });
    const eventId = getVapiEventIdentity(message)!;
    const now = 1_700_000_000_000;
    const { db, documents, set } = createReplayDb({
      [eventId]: { expiresAt: Timestamp.fromMillis(now - 1) },
    });

    await expect(claimVapiWebhookEvent(db, message, now)).resolves.toBe("claimed");
    expect(set).toHaveBeenCalledOnce();
    expect(
      (documents.get(eventId)?.expiresAt as Timestamp).toMillis()
    ).toBe(now + VAPI_REPLAY_WINDOW_MS);
  });

  it("uses an explicit message ID despite clock-skewed payload timestamps", () => {
    const past = webhookMessage({ timestamp: "1970-01-01T00:00:00.000Z" });
    const future = webhookMessage({ timestamp: "2099-01-01T00:00:00.000Z" });

    expect(getVapiEventIdentity(past)).toBe(getVapiEventIdentity(future));
  });

  it("allows only one concurrent transaction to claim an event", async () => {
    const { db, set } = createReplayDb();
    const message = webhookMessage();

    const results = await Promise.all([
      claimVapiWebhookEvent(db, message),
      claimVapiWebhookEvent(db, message),
    ]);

    expect(results.sort()).toEqual(["claimed", "duplicate"]);
    expect(set).toHaveBeenCalledOnce();
  });
});
