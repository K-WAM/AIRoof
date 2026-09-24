import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import {
  ELEVENLABS_CONVERSATION_TTL_MS,
  elevenLabsConversationDocId,
  getElevenLabsConversation,
  persistElevenLabsConversation,
} from "@/lib/voice/elevenlabs/conversationRecords";

const mocks = vi.hoisted(() => ({
  getAdminFirestore: vi.fn(),
}));

vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: mocks.getAdminFirestore,
}));

const NOW = 1_750_000_000_000;

describe("elevenlabsConversations records (TTL persistence)", () => {
  let db: ReturnType<typeof makeFakeDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = makeFakeDb();
    mocks.getAdminFirestore.mockReturnValue(db);
  });

  it("persists a record with a TTL and reads it back", async () => {
    const docId = await persistElevenLabsConversation(
      {
        businessId: "biz_1",
        callerPhone: "+1 (305) 555-0100",
        calledNumber: "+1 (754) 283-7658",
        agentId: "agent_1",
        conversationId: "conv_1",
      },
      NOW
    );
    expect(docId).toBe("conv_1");

    const record = await getElevenLabsConversation("conv_1", NOW + 1000);
    expect(record).not.toBeNull();
    expect(record?.businessId).toBe("biz_1");
    expect(record?.callerPhone).toBe("+1 (305) 555-0100");
    expect(record?.calledNumber).toBe("+1 (754) 283-7658");
    expect(record?.createdAt).toBe(NOW);
    expect(record?.expiresAt).toBe(NOW + ELEVENLABS_CONVERSATION_TTL_MS);
  });

  it("keys by call_sid when there is no conversation id", async () => {
    await persistElevenLabsConversation(
      { businessId: "biz_1", callSid: "CA123", callerPhone: "+1" },
      NOW
    );
    expect(await getElevenLabsConversation("CA123", NOW)).not.toBeNull();
  });

  it("returns null for an expired record", async () => {
    await persistElevenLabsConversation(
      { businessId: "biz_1", conversationId: "conv_old" },
      NOW
    );
    expect(
      await getElevenLabsConversation("conv_old", NOW + ELEVENLABS_CONVERSATION_TTL_MS + 1)
    ).toBeNull();
  });

  it("returns null for an unknown id and for a record without a businessId", async () => {
    expect(await getElevenLabsConversation("conv_missing", NOW)).toBeNull();
    await persistElevenLabsConversation({ businessId: "", conversationId: "conv_bad" }, NOW);
    expect(await getElevenLabsConversation("conv_bad", NOW)).toBeNull();
  });

  it("encodes conversation ids that are not Firestore-safe", () => {
    expect(elevenLabsConversationDocId("abc")).toBe("abc");
    expect(elevenLabsConversationDocId("a/b/c")).toBe("a%2Fb%2Fc");
  });
});
