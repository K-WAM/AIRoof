import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetRateLimitState } from "@/lib/auth/rateLimit";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({
  getAdminFirestore: vi.fn(),
  executeAgentTool: vi.fn(),
}));

vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: mocks.getAdminFirestore,
}));
vi.mock("@/lib/tools/toolDispatcher", () => ({
  executeAgentTool: mocks.executeAgentTool,
}));

import { POST } from "@/app/api/webhooks/elevenlabs/tools/[tool]/route";

const UNVERIFIED =
  "I couldn't verify this call — the office will call you back to help.";

function requestFor(
  tool: string,
  options: {
    secret?: string;
    conversationId?: string;
    body?: Record<string, unknown>;
    ip?: string;
  } = {}
): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.secret) headers["x-luxor-tool-secret"] = options.secret;
  if (options.conversationId) headers["x-luxor-conversation-id"] = options.conversationId;
  if (options.ip) headers["x-forwarded-for"] = options.ip;
  return new NextRequest(
    `http://localhost/api/webhooks/elevenlabs/tools/${tool}`,
    { method: "POST", headers, body: JSON.stringify(options.body ?? {}) }
  );
}

describe("POST /api/webhooks/elevenlabs/tools/[tool]", () => {
  let db: ReturnType<typeof makeFakeDb>;
  const now = Date.now();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ELEVENLABS_TOOL_SECRET", "expected-secret");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    db = makeFakeDb();
    mocks.getAdminFirestore.mockReturnValue(db);
    mocks.executeAgentTool.mockResolvedValue({ result: "done" });
    db.__seed("elevenlabsConversations", "conv_1", {
      businessId: "biz_stored",
      callerPhone: "+1 (305) 555-0100",
      calledNumber: "+17542837658",
      createdAt: now,
      expiresAt: now + 24 * 60 * 60 * 1000,
    });
    _resetRateLimitState();
  });

  it("returns 401 with no detail for a missing or wrong secret", async () => {
    for (const secret of [undefined, "wrong-secret"]) {
      const response = await POST(
        requestFor("createLead", { secret, conversationId: "conv_1" }),
        { params: Promise.resolve({ tool: "createLead" }) }
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
    }
    expect(mocks.executeAgentTool).not.toHaveBeenCalled();
  });

  it("returns 404 for a tool name outside the 7 schemas", async () => {
    const response = await POST(
      requestFor("deleteDatabase", { secret: "expected-secret", conversationId: "conv_1" }),
      { params: Promise.resolve({ tool: "deleteDatabase" }) }
    );
    expect(response.status).toBe(404);
    expect(mocks.executeAgentTool).not.toHaveBeenCalled();
  });

  it("refuses without a conversation-id header", async () => {
    const response = await POST(
      requestFor("createLead", { secret: "expected-secret" }),
      { params: Promise.resolve({ tool: "createLead" }) }
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: UNVERIFIED });
    expect(mocks.executeAgentTool).not.toHaveBeenCalled();
  });

  it("refuses when there is no stored conversation record (expired included)", async () => {
    db.__seed("elevenlabsConversations", "conv_old", {
      businessId: "biz_stored",
      callerPhone: "+1 (305) 555-0100",
      createdAt: now - 2 * 24 * 60 * 60 * 1000,
      expiresAt: now - 60 * 1000,
    });
    for (const conversationId of ["conv_missing", "conv_old"]) {
      const response = await POST(
        requestFor("createLead", { secret: "expected-secret", conversationId }),
        { params: Promise.resolve({ tool: "createLead" }) }
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ result: UNVERIFIED });
    }
    expect(mocks.executeAgentTool).not.toHaveBeenCalled();
  });

  it("resolves businessId + verified caller phone from the stored record and ignores model-supplied ones", async () => {
    const response = await POST(
      requestFor("createLead", {
        secret: "expected-secret",
        conversationId: "conv_1",
        body: {
          // Model-supplied spoofing — must be ignored entirely.
          businessId: "biz_model_supplied",
          verifiedCallerPhone: "+9 (999) 999-9999",
          callerPhone: "+9 (999) 999-9999",
          callerName: "Pat",
        },
      }),
      { params: Promise.resolve({ tool: "createLead" }) }
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: "done" });
    expect(mocks.executeAgentTool).toHaveBeenCalledWith(
      "createLead",
      { callerName: "Pat" },
      {
        businessId: "biz_stored",
        callId: "call_elevenlabs_conv_1",
        callerPhone: "+1 (305) 555-0100",
        provider: "elevenlabs",
        providerIds: { elevenLabsConversationId: "conv_1" },
      }
    );
  });

  it("429s a burst past the per-IP webhook budget", async () => {
    const burst = (ip: string) =>
      POST(
        requestFor("getCurrentDate", {
          secret: "expected-secret",
          conversationId: "conv_1",
          ip,
        }),
        { params: Promise.resolve({ tool: "getCurrentDate" }) }
      );

    for (let i = 0; i < 300; i++) {
      const response = await burst("10.10.10.10");
      expect(response.status).toBe(200);
    }
    const blocked = await burst("10.10.10.10");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });
});
