import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/verifyRole", () => ({
  verifyFieldAccess: async (_req: NextRequest, _businessId: string, options?: { write?: true }) =>
    options?.write
      ? { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
      : { user: { uid: "viewer-1", role: "viewer" } },
  verifyAuthAndRole: async () => ({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }),
}));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => ({}) }));
vi.mock("@/lib/ai/registry", () => ({ isProviderReady: () => true }));

import { POST as postUpdate } from "@/app/api/jobs/[jobId]/updates/route";
import { POST as postAudio } from "@/app/api/jobs/[jobId]/field-audio/route";
import { POST as postFinding } from "@/app/api/jobs/[jobId]/findings/route";
import { POST as postPhoto } from "@/app/api/jobs/[jobId]/photos/route";
import { PATCH as patchPhoto } from "@/app/api/jobs/[jobId]/photos/[photoId]/route";
import { POST as postPunch } from "@/app/api/timeclock/punch/route";
import { POST as postTranscribe } from "@/app/api/transcribe/route";

const job = { params: Promise.resolve({ jobId: "J-1" }) };
const photo = { params: Promise.resolve({ jobId: "J-1", photoId: "P-1" }) };
function request(path: string, body: object) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("viewer field writes", () => {
  it.each([
    ["note", () => postUpdate(request("/api/jobs/J-1/updates", { businessId: "biz", rawText: "note" }), job)],
    ["audio", () => postAudio(request("/api/jobs/J-1/field-audio", { businessId: "biz", audioBase64: "AAAA", mimeType: "audio/webm" }), job)],
    ["finding", () => postFinding(request("/api/jobs/J-1/findings", { businessId: "biz", itemId: "item" }), job)],
    ["photo", () => postPhoto(request("/api/jobs/J-1/photos", { businessId: "biz", label: "roof", thumbB64: "AAAA", fullB64: "AAAA" }), job)],
    ["photo metadata", () => patchPhoto(request("/api/jobs/J-1/photos/P-1", { businessId: "biz", label: "roof" }), photo)],
    ["punch", () => postPunch(request("/api/timeclock/punch", { businessId: "biz", type: "site_in", jobId: "J-1", workerName: "Alex" }))],
    ["transcription", () => postTranscribe(request("/api/transcribe", { businessId: "biz", audioBase64: "AAAA", mimeType: "audio/webm" }))],
  ])("rejects %s before a write or provider call", async (_label, call) => {
    const response = await call();
    expect(response.status).toBe(403);
  });
});
