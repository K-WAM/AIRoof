import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetRateLimitState } from "@/lib/auth/rateLimit";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({
  getAdminFirestore: vi.fn(),
  classifyCallOutcome: vi.fn(),
  findBusinessByElevenLabsAgentId: vi.fn(),
}));

vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: mocks.getAdminFirestore,
}));
vi.mock("@/lib/ai/deepseekClient", () => ({
  classifyCallOutcome: mocks.classifyCallOutcome,
}));
vi.mock("@/lib/voice/elevenlabs/businessLookupShim", () => ({
  findBusinessByElevenLabsAgentId: mocks.findBusinessByElevenLabsAgentId,
}));

import { POST } from "@/app/api/webhooks/elevenlabs/post-call/route";

const WEBHOOK_SECRET = "webhook-secret";

function sign(body: string, timestampSecs: number): string {
  const digest = createHmac("sha256", WEBHOOK_SECRET)
    .update(`${timestampSecs}.${body}`)
    .digest("hex");
  return `t=${timestampSecs},v0=${digest}`;
}

function requestFor(
  payload: Record<string, unknown>,
  signature?: string | null
): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/elevenlabs/post-call", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(signature ? { "elevenlabs-signature": signature } : {}),
    },
    body: JSON.stringify(payload),
  });
}

function transcriptionPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "post_call_transcription",
    event_timestamp: 1_750_000_000,
    data: {
      agent_id: "agent_1",
      conversation_id: "conv_1",
      status: "done",
      transcript: [
        { role: "agent", message: "Thanks for calling Apex Roofing.", time_in_call_secs: 0 },
        { role: "user", message: "I need a roof inspection.", time_in_call_secs: 2 },
      ],
      metadata: { start_time_unix_secs: 1_750_000_000, call_duration_secs: 45 },
      analysis: { transcript_summary: "Caller requested a roof inspection." },
      ...overrides,
    },
  };
}

describe("POST /api/webhooks/elevenlabs/post-call", () => {
  let db: ReturnType<typeof makeFakeDb>;
  const now = Date.now();
  const nowSecs = Math.floor(now / 1000);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ELEVENLABS_WEBHOOK_SECRET", WEBHOOK_SECRET);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    db = makeFakeDb();
    mocks.getAdminFirestore.mockReturnValue(db);
    mocks.classifyCallOutcome.mockResolvedValue({ outcome: "scheduled", reason: "Booked" });
    mocks.findBusinessByElevenLabsAgentId.mockResolvedValue(null);
    db.__seed("elevenlabsConversations", "conv_1", {
      businessId: "biz_1",
      callerPhone: "+1 (305) 555-0100",
      calledNumber: "+17542837658",
      createdAt: now - 1000,
      expiresAt: now + 24 * 60 * 60 * 1000,
    });
    db.__seed("businesses", "biz_1", { businessName: "Apex Roofing", timezone: "America/New_York" });
    _resetRateLimitState();
  });

  it.each([
    ["missing signature", null],
    ["malformed signature", "v0=deadbeef"],
  ])("returns 401 with no detail for %s", async (_case, signature) => {
    const payload = transcriptionPayload();
    const response = await POST(requestFor(payload, signature));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("rejects an old timestamp even with a valid HMAC", async () => {
    const payload = transcriptionPayload();
    const oldSecs = nowSecs - 31 * 60;
    const response = await POST(
      requestFor(payload, sign(JSON.stringify(payload), oldSecs))
    );
    expect(response.status).toBe(401);
  });

  it("processes a valid post_call_transcription and writes the same call-doc shape as Vapi", async () => {
    const payload = transcriptionPayload();
    const response = await POST(
      requestFor(payload, sign(JSON.stringify(payload), nowSecs))
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });

    const call = db.__peek("businesses/biz_1/calls", "call_elevenlabs_conv_1");
    expect(call).toBeDefined();
    expect(call?.businessId).toBe("biz_1");
    expect(call?.callerPhone).toBe("+1 (305) 555-0100");
    expect(call?.status).toBe("ended");
    expect(call?.elevenLabsConversationId).toBe("conv_1");
    expect(call?.summary).toBe("Caller requested a roof inspection.");
    expect(call?.durationSecs).toBe(45);
    expect(call?.outcome).toBe("scheduled");
    expect(call?.outcomeReason).toBe("Booked");
    expect(call?.messages).toEqual([
      {
        messageId: "m_0",
        role: "agent",
        text: "Thanks for calling Apex Roofing.",
        timestamp: 1_750_000_000 * 1000,
      },
      {
        messageId: "m_1",
        role: "caller",
        text: "I need a roof inspection.",
        timestamp: (1_750_000_000 + 2) * 1000,
      },
    ]);
  });

  it("dedups a retried delivery (identical payload) without double-writing", async () => {
    const payload = transcriptionPayload();
    const signed = sign(JSON.stringify(payload), nowSecs);

    const first = await POST(requestFor(payload, signed));
    expect(first.status).toBe(200);
    const writesAfterFirst = db.__peek("businesses/biz_1/calls", "call_elevenlabs_conv_1");
    expect(writesAfterFirst).toBeDefined();

    const replay = await POST(requestFor(payload, signed));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ received: true });
    expect(mocks.classifyCallOutcome).toHaveBeenCalledTimes(1);
  });

  it("falls back to the agent id when there is no stored conversation record", async () => {
    mocks.findBusinessByElevenLabsAgentId.mockResolvedValue("biz_2");
    db.__seed("businesses", "biz_2", { businessName: "Roof Doctors" });
    const payload = transcriptionPayload();
    payload.data = { ...(payload.data as Record<string, unknown>), conversation_id: "conv_outbound" };

    const response = await POST(
      requestFor(payload, sign(JSON.stringify(payload), nowSecs))
    );
    expect(response.status).toBe(200);
    const call = db.__peek("businesses/biz_2/calls", "call_elevenlabs_conv_outbound");
    expect(call?.businessId).toBe("biz_2");
    expect(call?.callerPhone).toBeNull();
  });

  it("records a call_initiation_failure without crashing", async () => {
    const payload = {
      type: "call_initiation_failure",
      event_timestamp: nowSecs,
      data: {
        agent_id: "agent_1",
        conversation_id: "conv_fail",
        failure_reason: "busy",
        metadata: { type: "twilio", body: { CallStatus: "busy" } },
      },
    };

    const response = await POST(
      requestFor(payload, sign(JSON.stringify(payload), nowSecs))
    );
    expect(response.status).toBe(200);

    // No stored record -> falls back to agent id; mock returns null -> logged, no write.
    const call = db.__peek("businesses/biz_1/calls", "call_elevenlabs_conv_fail");
    expect(call).toBeUndefined();

    // With a resolvable agent, the failure is persisted as a failed call doc.
    // (A fresh event_timestamp so the replay guard treats it as a new event.)
    mocks.findBusinessByElevenLabsAgentId.mockResolvedValue("biz_1");
    const secondPayload = { ...payload, event_timestamp: nowSecs + 1 };
    const second = await POST(
      requestFor(secondPayload, sign(JSON.stringify(secondPayload), nowSecs + 1))
    );
    expect(second.status).toBe(200);
    const failed = db.__peek("businesses/biz_1/calls", "call_elevenlabs_conv_fail");
    expect(failed?.status).toBe("failed");
    expect(failed?.failureReason).toBe("busy");
    expect(failed?.elevenLabsConversationId).toBe("conv_fail");
  });

  it("acks post_call_audio and stores nothing", async () => {
    const payload = {
      type: "post_call_audio",
      event_timestamp: nowSecs,
      data: { agent_id: "agent_1", conversation_id: "conv_1", full_audio: "SUQzBAAAAA==" },
    };
    const response = await POST(
      requestFor(payload, sign(JSON.stringify(payload), nowSecs))
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    // No call doc, no classification.
    expect(mocks.classifyCallOutcome).not.toHaveBeenCalled();
    expect(db.__peek("businesses/biz_1/calls", "call_elevenlabs_conv_1")).toBeUndefined();
  });

  it("acks unknown event types", async () => {
    const payload = { type: "voice_removed", event_timestamp: nowSecs, data: {} };
    const response = await POST(
      requestFor(payload, sign(JSON.stringify(payload), nowSecs))
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });
});
