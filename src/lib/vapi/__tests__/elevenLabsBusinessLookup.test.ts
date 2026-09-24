import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getAdminFirestore: vi.fn() }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: mocks.getAdminFirestore }));
import { findBusinessByElevenLabsAgentId, findBusinessByElevenLabsPhoneNumber } from "../businessLookup";

const get = vi.fn();
const where = vi.fn(() => ({ limit: () => ({ get }) }));
beforeEach(() => {
  get.mockReset(); where.mockClear(); mocks.getAdminFirestore.mockReset().mockReturnValue({ collection: () => ({ where }) });
});

describe("ElevenLabs business lookups", () => {
  it("queries and caches the agent ID", async () => {
    get.mockResolvedValue({ empty: false, docs: [{ id: "business-1" }] });
    expect(await findBusinessByElevenLabsAgentId("agent_test_1")).toBe("business-1");
    expect(await findBusinessByElevenLabsAgentId("agent_test_1")).toBe("business-1");
    expect(where).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledWith("elevenlabs.agentId", "==", "agent_test_1");
  });

  it("queries and caches the E.164 phone number independently", async () => {
    get.mockResolvedValue({ empty: false, docs: [{ id: "business-2" }] });
    expect(await findBusinessByElevenLabsPhoneNumber("+15551234567")).toBe("business-2");
    expect(await findBusinessByElevenLabsPhoneNumber("+15551234567")).toBe("business-2");
    expect(where).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledWith("elevenlabs.phoneNumber", "==", "+15551234567");
  });

  it("returns null when no tenant matches and does not cache a miss", async () => {
    get.mockResolvedValue({ empty: true, docs: [] });
    expect(await findBusinessByElevenLabsAgentId("absent_agent")).toBeNull();
    expect(await findBusinessByElevenLabsAgentId("absent_agent")).toBeNull();
    expect(where).toHaveBeenCalledTimes(2);
  });
});
