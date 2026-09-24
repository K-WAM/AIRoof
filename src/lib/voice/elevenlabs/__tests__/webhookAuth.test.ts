import { createHmac } from "node:crypto";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import {
  claimElevenLabsPostCallEvent,
  completeElevenLabsPostCallEvent,
  timingSafeStringEqual,
  verifyElevenLabsPostCallSignature,
  verifyElevenLabsToolSecret,
} from "@/lib/voice/elevenlabs/webhookAuth";

function secretRequest(headerValue: string | undefined): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/elevenlabs/initiation", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(headerValue ? { "x-luxor-tool-secret": headerValue } : {}),
    },
    body: JSON.stringify({ caller_id: "+1" }),
  });
}

describe("verifyElevenLabsToolSecret (initiation + tools auth)", () => {
  beforeEach(() => {
    vi.stubEnv("ELEVENLABS_TOOL_SECRET", "expected-secret");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("fails closed when the secret env is not configured", () => {
    vi.stubEnv("ELEVENLABS_TOOL_SECRET", "");
    expect(verifyElevenLabsToolSecret(secretRequest("expected-secret"))).toBe(false);
  });

  it("fails closed when no secret header is present", () => {
    expect(verifyElevenLabsToolSecret(secretRequest(undefined))).toBe(false);
  });

  it("fails closed for a wrong secret", () => {
    expect(verifyElevenLabsToolSecret(secretRequest("wrong-secret"))).toBe(false);
  });

  it("rejects an altered same-length secret (timing-safe compare)", () => {
    expect(verifyElevenLabsToolSecret(secretRequest("expected-secreu"))).toBe(false);
  });

  it("accepts the exact secret in the tool-secret header", () => {
    expect(verifyElevenLabsToolSecret(secretRequest("expected-secret"))).toBe(true);
  });

  it("accepts the secret as an Authorization Bearer token", () => {
    const request = new NextRequest("http://localhost/api/webhooks/elevenlabs/initiation", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer expected-secret" },
      body: JSON.stringify({}),
    });
    expect(verifyElevenLabsToolSecret(request)).toBe(true);
  });
});

describe("timingSafeStringEqual", () => {
  it("rejects different lengths and same-length differences, accepts equality", () => {
    expect(timingSafeStringEqual("abc", "abc")).toBe(true);
    expect(timingSafeStringEqual("abc", "ab")).toBe(false);
    expect(timingSafeStringEqual("abc", "abd")).toBe(false);
  });
});

function sign(body: string, secret: string, timestampSecs: number): string {
  const digest = createHmac("sha256", secret)
    .update(`${timestampSecs}.${body}`)
    .digest("hex");
  return `t=${timestampSecs},v0=${digest}`;
}

describe("verifyElevenLabsPostCallSignature (post-call HMAC)", () => {
  const SECRET = "webhook-secret";
  const BODY = JSON.stringify({ type: "post_call_transcription", data: { conversation_id: "abc" } });

  it("accepts a correctly signed fresh payload", () => {
    const now = Date.now();
    const signature = sign(BODY, SECRET, Math.floor(now / 1000));
    expect(verifyElevenLabsPostCallSignature(BODY, signature, SECRET, now)).toBe(true);
  });

  it("rejects a payload signed with the wrong secret", () => {
    const now = Date.now();
    const signature = sign(BODY, "other-secret", Math.floor(now / 1000));
    expect(verifyElevenLabsPostCallSignature(BODY, signature, SECRET, now)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const now = Date.now();
    const signature = sign(BODY, SECRET, Math.floor(now / 1000));
    expect(
      verifyElevenLabsPostCallSignature(BODY + " ", signature, SECRET, now)
    ).toBe(false);
  });

  it("rejects an expired timestamp (> 30 minutes old)", () => {
    const now = Date.now();
    const old = Math.floor(now / 1000) - 31 * 60;
    const signature = sign(BODY, SECRET, old);
    expect(verifyElevenLabsPostCallSignature(BODY, signature, SECRET, now)).toBe(false);
  });

  it("rejects a far-future timestamp (beyond clock skew)", () => {
    const now = Date.now();
    const future = Math.floor(now / 1000) + 6 * 60;
    const signature = sign(BODY, SECRET, future);
    expect(verifyElevenLabsPostCallSignature(BODY, signature, SECRET, now)).toBe(false);
  });

  it("accepts a small future skew (clock drift)", () => {
    const now = Date.now();
    const future = Math.floor(now / 1000) + 2 * 60;
    const signature = sign(BODY, SECRET, future);
    expect(verifyElevenLabsPostCallSignature(BODY, signature, SECRET, now)).toBe(true);
  });

  it("rejects malformed signature headers", () => {
    const now = Date.now();
    expect(verifyElevenLabsPostCallSignature(BODY, null, SECRET, now)).toBe(false);
    expect(verifyElevenLabsPostCallSignature(BODY, "garbage", SECRET, now)).toBe(false);
    expect(
      verifyElevenLabsPostCallSignature(BODY, `v0=abcd`, SECRET, now)
    ).toBe(false);
    expect(
      verifyElevenLabsPostCallSignature(BODY, `t=${Math.floor(now / 1000)}`, SECRET, now)
    ).toBe(false);
  });

  it("fails closed when the webhook secret is not configured", () => {
    const now = Date.now();
    const signature = sign(BODY, SECRET, Math.floor(now / 1000));
    expect(verifyElevenLabsPostCallSignature(BODY, signature, undefined, now)).toBe(false);
    expect(verifyElevenLabsPostCallSignature(BODY, signature, "", now)).toBe(false);
  });
});

describe("claimElevenLabsPostCallEvent (replay guard)", () => {
  function createReplayDb() {
    const claims = new Map<string, Record<string, unknown>>();
    const db = {
      collection: () => ({ doc: (id: string) => ({
        id,
        update: async (value: Record<string, unknown>) => {
          claims.set(id, { ...claims.get(id), ...value });
        },
      }) }),
      runTransaction: vi.fn(async <T>(callback: (transaction: {
        get: (ref: { id: string }) => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
        set: (ref: { id: string }, value: Record<string, unknown>) => void;
      }) => Promise<T>) => callback({
        get: async (ref) => ({ exists: claims.has(ref.id), data: () => claims.get(ref.id) }),
        set: (ref, value) => claims.set(ref.id, value),
      })),
    };
    // The replay guard uses only collection() and runTransaction(); this
    // intentionally small fake has those methods but not the Firestore SDK's
    // unrelated admin surface.
    return { db: db as unknown as Firestore, claims };
  }

  const event = { type: "post_call_transcription", conversationId: "conv_1", eventTimestamp: "1700000000" };

  it("treats an unfinished claim as in progress, then completed delivery as duplicate", async () => {
    const { db } = createReplayDb();
    expect(await claimElevenLabsPostCallEvent(db, event, 1_700_000_000_000)).toBe("claimed");
    expect(await claimElevenLabsPostCallEvent(db, event, 1_700_000_000_000)).toBe("in_progress");
    await completeElevenLabsPostCallEvent(db, event, 1_700_000_000_010);
    expect(await claimElevenLabsPostCallEvent(db, event, 1_700_000_000_020)).toBe("duplicate");
  });

  it("reclaims an unfinished delivery after its processing lease", async () => {
    const { db } = createReplayDb();
    expect(await claimElevenLabsPostCallEvent(db, event, 1_700_000_000_000)).toBe("claimed");
    expect(await claimElevenLabsPostCallEvent(db, event, 1_700_000_061_000)).toBe("claimed");
  });

  it("re-claims after the TTL window has passed", async () => {
    const { db } = createReplayDb();
    expect(await claimElevenLabsPostCallEvent(db, event, 1_000_000)).toBe("claimed");
    // 25 hours later — past the 24h TTL
    expect(await claimElevenLabsPostCallEvent(db, event, 1_000_000 + 25 * 60 * 60 * 1000)).toBe("claimed");
  });

  it("treats events without identity fields as invalid", async () => {
    const { db } = createReplayDb();
    expect(
      await claimElevenLabsPostCallEvent(db, { type: "post_call_audio", conversationId: "", eventTimestamp: "1" }, 1)
    ).toBe("invalid");
  });
});
