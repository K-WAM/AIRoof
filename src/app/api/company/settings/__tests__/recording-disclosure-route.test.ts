import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_RECORDING_DISCLOSURE_EN } from "@/lib/recordingDisclosure";
import type { BusinessConfig } from "@/types";

const mocks = vi.hoisted(() => ({
  verifyAuthAndRole: vi.fn(),
  updateAssistantPersona: vi.fn(),
  docUpdate: vi.fn(),
}));

vi.mock("@/lib/auth/verifyRole", () => ({
  verifyAuthAndRole: mocks.verifyAuthAndRole,
}));

vi.mock("@/lib/vapi/vapiClient", () => ({
  updateAssistantPersona: mocks.updateAssistantPersona,
}));

let currentDoc: Record<string, unknown> | undefined;
vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: () => ({
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: currentDoc !== undefined, data: () => currentDoc }),
        update: mocks.docUpdate,
      }),
    }),
  }),
}));

import { GET, PUT } from "@/app/api/company/settings/route";

const baseDoc: BusinessConfig = {
  businessId: "biz-1",
  businessName: "Apex Roofing",
  industry: "roofing",
  serviceArea: "Miami",
  businessHours: "Mon-Fri 8-5",
  emergencyRules: [],
  bookingRules: [],
  escalationPhone: "+1 305 555 0100",
  approvedServices: [],
  approvedFaqs: [],
  disallowedTopics: [],
  active: true,
  createdAt: 0,
  updatedAt: 0,
  greeting: "Thanks for calling Apex Roofing, this is Roofus.",
  afterHoursGreeting: "Thanks for calling Apex Roofing. The office is closed.",
  vapiAssistantId: "assistant-1",
  agentLanguage: "en",
};

function getRequest(businessId: string | null) {
  const url = businessId
    ? `http://localhost/api/company/settings?businessId=${businessId}`
    : "http://localhost/api/company/settings";
  return new NextRequest(url);
}

function putRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/company/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.verifyAuthAndRole.mockReset();
  mocks.updateAssistantPersona.mockReset();
  mocks.docUpdate.mockReset();
  mocks.docUpdate.mockImplementation(async (patch: Record<string, unknown>) => {
    currentDoc = { ...(currentDoc ?? {}), ...patch };
  });
  currentDoc = { ...baseDoc };
});

describe("GET /api/company/settings — recording notice (T-102)", () => {
  it("returns the default-on disclosure and stored greetings when the field is missing", async () => {
    mocks.verifyAuthAndRole.mockResolvedValue({ user: { uid: "u1", superadmin: false } });
    delete currentDoc!.recordingDisclosure;

    const res = await GET(getRequest("biz-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recordingDisclosure).toEqual({ enabled: true, text: DEFAULT_RECORDING_DISCLOSURE_EN });
    expect(body.greeting).toBe(baseDoc.greeting);
    expect(body.afterHoursGreeting).toBe(baseDoc.afterHoursGreeting);
  });

  it("returns the owner's custom disclosure and the Spanish default for es tenants", async () => {
    mocks.verifyAuthAndRole.mockResolvedValue({ user: { uid: "u1", superadmin: false } });
    currentDoc = {
      ...baseDoc,
      agentLanguage: "es",
      recordingDisclosure: { enabled: true, text: "Esta llamada puede ser grabada." },
    };

    const res = await GET(getRequest("biz-1"));
    const body = await res.json();
    expect(body.recordingDisclosure).toEqual({ enabled: true, text: "Esta llamada puede ser grabada." });
  });
});

describe("PUT /api/company/settings — recording notice auth (T-102)", () => {
  it("refuses staff: only the owner (or superadmin) may change the notice", async () => {
    mocks.verifyAuthAndRole.mockResolvedValue({ user: { uid: "u2", superadmin: false, role: "staff" } });

    const res = await PUT(putRequest({ businessId: "biz-1", recordingDisclosure: { enabled: false } }));
    expect(res.status).toBe(403);
    expect(mocks.docUpdate).not.toHaveBeenCalled();
    expect(mocks.updateAssistantPersona).not.toHaveBeenCalled();
  });

  it("allows the owner and the superadmin", async () => {
    mocks.updateAssistantPersona.mockResolvedValue(undefined);
    mocks.verifyAuthAndRole.mockResolvedValue({ user: { uid: "u1", superadmin: false, role: "owner" } });
    let res = await PUT(putRequest({ businessId: "biz-1", recordingDisclosure: { enabled: false } }));
    expect(res.status).toBe(200);

    mocks.verifyAuthAndRole.mockResolvedValue({ user: { uid: "u-admin", superadmin: true } });
    res = await PUT(putRequest({ businessId: "biz-1", recordingDisclosure: { enabled: true } }));
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/company/settings — recording notice validation (T-102)", () => {
  beforeEach(() => {
    mocks.verifyAuthAndRole.mockResolvedValue({ user: { uid: "u1", superadmin: false, role: "owner" } });
  });

  it("rejects text longer than 300 characters before any write", async () => {
    const res = await PUT(putRequest({
      businessId: "biz-1",
      recordingDisclosure: { enabled: true, text: "a".repeat(301) },
    }));
    expect(res.status).toBe(400);
    expect(mocks.docUpdate).not.toHaveBeenCalled();
  });

  it("rejects HTML in the text", async () => {
    const res = await PUT(putRequest({
      businessId: "biz-1",
      recordingDisclosure: { enabled: true, text: "Calls <script>alert(1)</script> recorded" },
    }));
    expect(res.status).toBe(400);
    expect(mocks.docUpdate).not.toHaveBeenCalled();
  });

  it("rejects a malformed disclosure shape", async () => {
    for (const bad of [null, "on", 1, [], { enabled: "yes" }, { text: "x" }]) {
      const res = await PUT(putRequest({ businessId: "biz-1", recordingDisclosure: bad }));
      expect(res.status).toBe(400);
    }
    expect(mocks.docUpdate).not.toHaveBeenCalled();
  });
});

describe("PUT /api/company/settings — recording notice save + persona push (T-102)", () => {
  beforeEach(() => {
    mocks.verifyAuthAndRole.mockResolvedValue({ user: { uid: "u1", superadmin: false, role: "owner" } });
    mocks.updateAssistantPersona.mockResolvedValue(undefined);
  });

  it("stores custom text and pushes the composed greeting (notice first) to Vapi", async () => {
    const res = await PUT(putRequest({
      businessId: "biz-1",
      recordingDisclosure: { enabled: true, text: "This call is recorded." },
    }));
    expect(res.status).toBe(200);
    expect(mocks.docUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ recordingDisclosure: { enabled: true, text: "This call is recorded." } })
    );

    const call = mocks.updateAssistantPersona.mock.calls[0][0];
    expect(call.assistantId).toBe("assistant-1");
    expect(call.firstMessage).toBe("This call is recorded. Thanks for calling Apex Roofing, this is Roofus.");
    expect(call.systemPrompt).toContain("## Call Recording");
    // Disclosure-only save must not touch the transcriber.
    expect(call.transcriberLanguage).toBeUndefined();
  });

  it("toggle off: stores enabled=false and pushes the plain greeting with no notice", async () => {
    const res = await PUT(putRequest({ businessId: "biz-1", recordingDisclosure: { enabled: false } }));
    expect(res.status).toBe(200);
    expect(mocks.docUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ recordingDisclosure: { enabled: false } })
    );

    const call = mocks.updateAssistantPersona.mock.calls[0][0];
    expect(call.firstMessage).toBe("Thanks for calling Apex Roofing, this is Roofus.");
    // The prompt still answers honestly if asked, even with the notice off.
    expect(call.systemPrompt).toContain("## Call Recording");
  });

  it("empty text falls back to the drafted default in the pushed greeting", async () => {
    const res = await PUT(putRequest({
      businessId: "biz-1",
      recordingDisclosure: { enabled: true, text: "   " },
    }));
    expect(res.status).toBe(200);
    expect(mocks.docUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ recordingDisclosure: { enabled: true } })
    );

    const call = mocks.updateAssistantPersona.mock.calls[0][0];
    expect(call.firstMessage).toBe(`${DEFAULT_RECORDING_DISCLOSURE_EN} Thanks for calling Apex Roofing, this is Roofus.`);
  });

  it("a language-only save still passes transcriberLanguage and the composed greeting (existing behavior preserved)", async () => {
    const res = await PUT(putRequest({ businessId: "biz-1", agentLanguage: "es" }));
    expect(res.status).toBe(200);
    expect(mocks.updateAssistantPersona).toHaveBeenCalledTimes(1);
    const call = mocks.updateAssistantPersona.mock.calls[0][0];
    expect(call.transcriberLanguage).toBe("es");
    expect(call.systemPrompt).toContain("Greet and answer in Spanish");
  });

  it("does not push Vapi when neither the language nor the disclosure changed", async () => {
    const res = await PUT(putRequest({ businessId: "biz-1", timezone: "America/Chicago" }));
    expect(res.status).toBe(200);
    expect(mocks.updateAssistantPersona).not.toHaveBeenCalled();
  });

  it("saves fine and skips the push when the business has no vapiAssistantId", async () => {
    delete currentDoc!.vapiAssistantId;
    const res = await PUT(putRequest({
      businessId: "biz-1",
      recordingDisclosure: { enabled: true, text: "This call is recorded." },
    }));
    expect(res.status).toBe(200);
    expect(mocks.updateAssistantPersona).not.toHaveBeenCalled();
  });

  it("surfaces a vapiSyncWarning without failing the save when the push throws", async () => {
    mocks.updateAssistantPersona.mockRejectedValue(new Error("Vapi PATCH /assistant failed (500)"));
    const res = await PUT(putRequest({ businessId: "biz-1", recordingDisclosure: { enabled: false } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.vapiSyncWarning).toBeTruthy();
  });
});
