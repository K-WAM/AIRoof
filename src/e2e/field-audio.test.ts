import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/test-utils/fakeFirestore";

const mocks = vi.hoisted(() => ({
  db: undefined as FakeDb | undefined,
  actorBusinessId: "e2e-audio",
  transcription: vi.fn(),
  parseFieldUpdate: vi.fn(),
}));

vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => mocks.db }));
vi.mock("@/lib/auth/verifyRole", () => ({
  verifyFieldAccess: async (request: NextRequest, businessId: string) => {
    const grant = request.cookies.get("__field_access")?.value;
    if (grant) {
      const requestedJobId = request.nextUrl.pathname.split("/")[3];
      if (grant !== "field-grant:J-1000" || requestedJobId !== "J-1000") {
        return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
      }
      return { user: { uid: "field-worker", role: "viewer" } };
    }
    if (!request.cookies.get("__session")?.value) {
      return { error: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }) };
    }
    if (mocks.actorBusinessId !== businessId) {
      return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
    return { user: { uid: "e2e-owner", role: "owner" } };
  },
}));
vi.mock("@/lib/ai/deepseekClient", () => ({ parseFieldUpdate: mocks.parseFieldUpdate }));
vi.mock("@/lib/ai/registry", () => ({ isProviderReady: () => true }));
vi.mock("openai/uploads", () => ({ toFile: vi.fn(async () => new Blob(["fake audio"])) }));
vi.mock("openai", () => ({
  default: class OpenAI {
    audio = { transcriptions: { create: mocks.transcription } };
  },
}));

import { POST as fieldAudio } from "@/app/api/jobs/[jobId]/field-audio/route";

const BUSINESS_ID = "e2e-audio";
const JOB_ID = "J-1000";
const audioPayload = Buffer.from("offline field recording").toString("base64");
const parsedEnglish = {
  transcriptEn: "Installed 12 bundles of shingles and Carlos worked 8 hours.",
  timeline: [{ description: "Roof repair completed" }],
  materials: [{ item: "shingles", quantity: 12, unit: "bundles" }],
  labor: [{ description: "Carlos", hours: 8 }],
  issues: [],
  invoiceSuggestions: [],
};

function request(jobId = JOB_ID, body: Record<string, unknown> = {}, cookie = "__session=e2e") {
  return new NextRequest(`http://localhost/api/jobs/${jobId}/field-audio`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      businessId: BUSINESS_ID,
      audioBase64: audioPayload,
      mimeType: "audio/webm",
      submittedBy: "Carlos",
      jobContext: { title: "Roof repair", clientName: "Ada" },
      ...body,
    }),
  });
}

const context = (jobId = JOB_ID) => ({ params: Promise.resolve({ jobId }) });
const ledgerPath = (jobId = JOB_ID) => `businesses/${BUSINESS_ID}/jobs/${jobId}/updates`;

describe("field-audio smoke path", () => {
  let db: FakeDb;

  beforeEach(() => {
    db = makeFakeDb();
    mocks.db = db;
    mocks.actorBusinessId = BUSINESS_ID;
    mocks.transcription.mockReset();
    mocks.parseFieldUpdate.mockReset();
    mocks.transcription.mockResolvedValue({ text: "Installed twelve bundles of shingles.", language: "en" });
    mocks.parseFieldUpdate.mockResolvedValue({ ...parsedEnglish });
    db.__seed("businesses", BUSINESS_ID, {
      businessId: BUSINESS_ID,
      businessName: "E2E Audio Roofing",
      industry: "roofing",
      agentLanguages: ["en", "es"],
      timezone: "America/New_York",
    });
    db.__seed(`businesses/${BUSINESS_ID}/library`, "pricing", { materials: [{ name: "shingles" }] });
    db.__seed(`businesses/${BUSINESS_ID}/jobs`, JOB_ID, { jobId: JOB_ID, status: "open" });
    db.__seed(`businesses/${BUSINESS_ID}/jobs`, "J-2000", { jobId: "J-2000", status: "open" });
  });

  it("transcribes English audio into the ledger and recomputes the job projection", async () => {
    const response = await fieldAudio(request(), context());

    expect(response.status).toBe(200);
    expect(mocks.transcription).toHaveBeenCalledOnce();
    expect(mocks.parseFieldUpdate).toHaveBeenCalledWith(expect.objectContaining({
      rawText: "Installed twelve bundles of shingles.", language: "en",
    }));
    expect(db.__list(ledgerPath())).toHaveLength(1);
    expect(db.__list(ledgerPath())[0].data).toMatchObject({
      rawText: "Installed twelve bundles of shingles.", language: "en", parsed: parsedEnglish,
    });
    expect(db.__peek(`businesses/${BUSINESS_ID}/jobs`, JOB_ID)).toMatchObject({
      status: "in_progress",
      parsed: { materials: [{ item: "shingles", quantity: "12", unit: "bundles" }] },
      materials: [{ name: "shingles", quantity: 12, unit: "bundles" }],
      totalLaborHours: 8,
    });
  });

  it("keeps Spanish audio text in the ledger while projecting canonical English", async () => {
    const spanish = "Instalé doce paquetes de tejas y Carlos trabajó ocho horas.";
    mocks.transcription.mockResolvedValue({ text: spanish, language: "es" });
    mocks.parseFieldUpdate.mockResolvedValue({
      ...parsedEnglish,
      transcriptEn: "Installed 12 bundles of shingles and Carlos worked 8 hours.",
    });

    const response = await fieldAudio(request(), context());

    expect(response.status).toBe(200);
    expect(db.__list(ledgerPath())[0].data).toMatchObject({
      rawText: spanish,
      rawTextEn: "Installed 12 bundles of shingles and Carlos worked 8 hours.",
      language: "es",
      parsed: expect.objectContaining({ sourceLanguage: "es" }),
    });
    expect(db.__peek(`businesses/${BUSINESS_ID}/jobs`, JOB_ID)).toMatchObject({
      parsed: { materials: [{ item: "shingles", quantity: "12", unit: "bundles" }] },
    });
  });

  it("rejects empty and oversized audio before transcription or a ledger write", async () => {
    const empty = await fieldAudio(request(JOB_ID, { audioBase64: "" }), context());
    const oversizedAudio = Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64");
    const oversized = await fieldAudio(request(JOB_ID, { audioBase64: oversizedAudio }), context());

    expect(empty.status).toBe(400);
    expect(oversized.status).toBe(400);
    expect(mocks.transcription).not.toHaveBeenCalled();
    expect(db.__list(ledgerPath())).toHaveLength(0);
  });

  it("returns a clean error with no ledger write when transcription fails", async () => {
    mocks.transcription.mockRejectedValue(new Error("Whisper unavailable"));

    const response = await fieldAudio(request(), context());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: "Transcription failed" });
    expect(mocks.parseFieldUpdate).not.toHaveBeenCalled();
    expect(db.__list(ledgerPath())).toHaveLength(0);
  });

  it("rejects a session from another tenant before transcription or a ledger write", async () => {
    mocks.actorBusinessId = "other-business";

    const response = await fieldAudio(request(), context());

    expect(response.status).toBe(403);
    expect(mocks.transcription).not.toHaveBeenCalled();
    expect(db.__list(ledgerPath())).toHaveLength(0);
  });

  it("accepts a job-scoped field grant only for its scoped job", async () => {
    const granted = await fieldAudio(request(JOB_ID, {}, "__field_access=field-grant:J-1000"), context());
    const wrongJob = await fieldAudio(request("J-2000", {}, "__field_access=field-grant:J-1000"), context("J-2000"));

    expect(granted.status).toBe(200);
    expect(wrongJob.status).toBe(403);
    expect(db.__list(ledgerPath())).toHaveLength(1);
    expect(db.__list(ledgerPath("J-2000"))).toHaveLength(0);
  });

  // The shipped client sends JSON/base64 (see useFieldAudio.ts). The route currently calls req.json(),
  // so multipart uploads fail before the field-audio workflow can begin. Kept as an expected failure;
  // changing that transport is production work and outside C6's test-only scope.
  it.fails("accepts a multipart audio upload", async () => {
    const form = new FormData();
    form.set("businessId", BUSINESS_ID);
    form.set("audio", new Blob(["offline field recording"], { type: "audio/webm" }), "field.webm");
    const response = await fieldAudio(new NextRequest(`http://localhost/api/jobs/${JOB_ID}/field-audio`, {
      method: "POST",
      headers: { cookie: "__session=e2e" },
      body: form,
    }), context());

    expect(response.status).toBe(200);
  });
});
