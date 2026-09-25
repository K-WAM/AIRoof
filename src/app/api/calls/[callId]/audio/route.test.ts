import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({ verifyAuthAndRole: vi.fn(), getAdminFirestore: vi.fn() }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyAuthAndRole: mocks.verifyAuthAndRole }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: mocks.getAdminFirestore }));
import { GET } from "./route";

const request = (businessId = "biz-1") => new NextRequest(`http://localhost/api/calls/call-1/audio?businessId=${businessId}`);
const params = { params: Promise.resolve({ callId: "call-1" }) };

describe("GET /api/calls/[callId]/audio", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); vi.stubEnv("ELEVENLABS_API_KEY", "test-key"); });

  it("returns 401 without a session", async () => {
    mocks.verifyAuthAndRole.mockResolvedValue({ error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) });
    expect((await GET(request(), params)).status).toBe(401);
    expect(mocks.getAdminFirestore).not.toHaveBeenCalled();
  });

  it("returns 403 when the session cannot access the requested tenant", async () => {
    mocks.verifyAuthAndRole.mockResolvedValue({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await GET(request("another-tenant"), params)).status).toBe(403);
  });

  it("streams ElevenLabs audio with private caching", async () => {
    mocks.verifyAuthAndRole.mockResolvedValue({ user: { uid: "staff" } });
    const db = makeFakeDb();
    db.__seed("businesses/biz-1/calls", "call-1", { providerIds: { elevenLabsConversationId: "conv/audio" } });
    mocks.getAdminFirestore.mockReturnValue(db);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const response = await GET(request(), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetchMock).toHaveBeenCalledWith("https://api.elevenlabs.io/v1/convai/conversations/conv%2Faudio/audio", { headers: { "xi-api-key": "test-key" } });
  });

  it("maps an upstream 404 to our 404", async () => {
    mocks.verifyAuthAndRole.mockResolvedValue({ user: { uid: "staff" } });
    const db = makeFakeDb();
    db.__seed("businesses/biz-1/calls", "call-1", { elevenLabsConversationId: "missing" });
    mocks.getAdminFirestore.mockReturnValue(db);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));
    expect((await GET(request(), params)).status).toBe(404);
  });
});
