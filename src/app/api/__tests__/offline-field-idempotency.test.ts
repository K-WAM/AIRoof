import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";

let db = makeFakeDb();
const mocks = vi.hoisted(() => ({
  gate: vi.fn(),
  parse: vi.fn(),
  transcribe: vi.fn(),
}));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => db }));
vi.mock("@/lib/auth/verifyRole", () => ({ verifyFieldAccess: mocks.gate }));
vi.mock("@/lib/auth/rateLimit", () => ({ checkRateLimit: () => null, FIELD_NOTE_LIMIT: {} }));
vi.mock("@/lib/demo/roofingTrial", () => ({ consumeTrialBudget: async () => null, TRIAL_PREFIX: "trial-" }));
vi.mock("@/lib/usage/meter", () => ({ recordUsage: async () => {} }));
vi.mock("@/lib/ai/registry", () => ({ isProviderReady: () => true }));
vi.mock("@/lib/ai/deepseekClient", () => ({ parseFieldUpdate: mocks.parse, ParseFieldUpdateError: class extends Error {} }));
vi.mock("openai/uploads", () => ({ toFile: async () => ({}) }));
vi.mock("openai", () => ({ default: class { audio = { transcriptions: { create: mocks.transcribe } }; } }));
vi.mock("@/lib/jobs/writeProjection", () => ({
  loadBusinessTz: async () => "UTC",
  loadLedger: async () => [],
  writeJobProjection: async () => ({ timeline: [], materials: [], labor: [], issues: [] }),
}));
import { POST as updates } from "@/app/api/jobs/[jobId]/updates/route";
import { POST as audio } from "@/app/api/jobs/[jobId]/field-audio/route";
import { POST as photos } from "@/app/api/jobs/[jobId]/photos/route";
import { POST as punch } from "@/app/api/timeclock/punch/route";

beforeEach(() => {
  db = makeFakeDb(); vi.clearAllMocks();
  mocks.gate.mockResolvedValue({ user: { uid: "u1", businessId: "biz", displayName: "Carlos", superadmin: false } });
  mocks.parse.mockResolvedValue({ timeline: [], materials: [], labor: [], issues: [] });
  mocks.transcribe.mockResolvedValue({ text: "Used twelve bundles", language: "english", duration: 3 });
  db.__seed("businesses", "biz", { businessName: "Roof Co" });
  db.__seed("businesses/biz/jobs", "J-1", { jobId: "J-1", title: "Reroof", status: "in_progress" });
});
const cases = [
  { name: "typed note", handler: updates, url: "/api/jobs/J-1/updates", body: { rawText: "Used twelve bundles" }, collection: "businesses/biz/jobs/J-1/updates" },
  { name: "voice note", handler: audio, url: "/api/jobs/J-1/field-audio", body: { audioBase64: "YXVkaW8=", mimeType: "audio/webm" }, collection: "businesses/biz/jobs/J-1/updates" },
  { name: "photo", handler: photos, url: "/api/jobs/J-1/photos", body: { label: "Before work", thumbB64: "cGhvdG8=", fullB64: "cGhvdG8=", w: 100, h: 100 }, collection: "businesses/biz/jobs/J-1/photos" },
  { name: "punch", handler: punch, url: "/api/timeclock/punch", body: { type: "office_in", jobId: "J-1" }, collection: "businesses/biz/punches" },
];

describe("real field routes deduplicate durable phone submissions", () => {
  for (const entry of cases) {
    const post = (body: Record<string, unknown>) => entry.handler(new NextRequest(`http://localhost${entry.url}`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-offline-owner": "u1" }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ jobId: "J-1" }) });
    it(`${entry.name}: denies unauthorized replay before claiming a key`, async () => {
      mocks.gate.mockResolvedValueOnce({ error: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }) });
      expect((await post({ businessId: "biz", clientRequestId: "request-123", ...entry.body })).status).toBe(401);
      expect(db.__list(entry.collection)).toHaveLength(0);
      expect(db.__list("businesses/biz/idempotency")).toHaveLength(0);
      expect(mocks.parse).not.toHaveBeenCalled(); expect(mocks.transcribe).not.toHaveBeenCalled();
    });
    it(`${entry.name}: duplicate ID writes once; a different ID writes a second record`, async () => {
      const capturedAt = Date.now() - 3_600_000;
      const body = { businessId: "biz", clientRequestId: "request-123", clientCreatedAt: capturedAt, ...entry.body };
      const first = await post(body), duplicate = await post(body);
      expect(first.status).toBeLessThan(300); expect(duplicate.status).toBe(first.status);
      expect(await duplicate.json()).toEqual(await first.json());
      expect(db.__list(entry.collection)).toHaveLength(1);
      if (entry.name.includes("note")) expect(mocks.parse).toHaveBeenCalledOnce();
      if (entry.name === "voice note") expect(mocks.transcribe).toHaveBeenCalledOnce();
      await post({ ...body, clientRequestId: "request-456", ...(entry.name === "punch" ? { type: "office_out", clientCreatedAt: capturedAt + 60_000 } : {}) });
      expect(db.__list(entry.collection)).toHaveLength(2);
      if (entry.name.includes("note")) expect(mocks.parse).toHaveBeenCalledTimes(2);
      if (entry.name === "voice note") expect(mocks.transcribe).toHaveBeenCalledTimes(2);
      if (entry.name === "photo") expect(db.__list("businesses/biz/jobs/J-1/photoBlobs")).toHaveLength(2);
      if (entry.name === "punch") expect(db.__list(entry.collection)[0].data.at).toBe(capturedAt);
    });
  }
});
