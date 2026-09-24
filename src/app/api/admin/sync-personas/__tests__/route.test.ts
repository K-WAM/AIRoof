import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifySuperadmin = vi.fn();
const updateAssistantPersona = vi.fn();
let docs: Array<{ id: string; data: () => Record<string, unknown> }> = [];

vi.mock("@/lib/auth/verifyRole", () => ({ verifySuperadmin: (...a: unknown[]) => verifySuperadmin(...a) }));
vi.mock("@/lib/vapi/vapiClient", () => ({ updateAssistantPersona: (...a: unknown[]) => updateAssistantPersona(...a) }));
vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: () => ({ collection: () => ({ get: async () => ({ docs }) }) }),
}));

import { POST } from "../route";

function req(body?: unknown) {
  return new NextRequest("http://localhost/api/admin/sync-personas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const doc = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  data: () => ({ businessName: id, industry: "roofing", businessHours: { monday: "9-5" }, approvedServices: ["Inspections"], approvedFaqs: [], emergencyRules: [], bookingRules: [], disallowedTopics: [], greeting: "Hello there.", vapiAssistantId: `asst-${id}`, ...over }),
});

beforeEach(() => {
  verifySuperadmin.mockReset().mockResolvedValue({ user: { superadmin: true } });
  updateAssistantPersona.mockReset().mockResolvedValue(undefined);
  docs = [doc("a"), doc("b")];
});

describe("POST /api/admin/sync-personas", () => {
  it("rejects non-superadmins without touching Vapi", async () => {
    verifySuperadmin.mockResolvedValue({ error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    const res = await POST(req({ dryRun: false }));
    expect(res.status).toBe(403);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(updateAssistantPersona).not.toHaveBeenCalled();
  });

  it("is a dry run by default — no body, or anything but dryRun:false, never writes", async () => {
    for (const body of [undefined, {}, { dryRun: true }, { dryRun: "false" }]) {
      const res = await POST(req(body));
      const json = await res.json();
      expect(json.dryRun).toBe(true);
      expect(json.targets).toHaveLength(2);
    }
    expect(updateAssistantPersona).not.toHaveBeenCalled();
  });

  it("dry-run preview shows the greeting that would be spoken, never the prompt", async () => {
    const json = await (await POST(req({ dryRun: true }))).json();
    expect(json.targets[0].greetingPreview).toContain("This call may be recorded");
    expect(JSON.stringify(json)).not.toContain("systemPrompt");
  });

  it("pushes every planned tenant on dryRun:false and reports per-tenant failures without stopping", async () => {
    updateAssistantPersona.mockRejectedValueOnce(new Error("Vapi PATCH /assistant failed (500)"));
    const json = await (await POST(req({ dryRun: false }))).json();
    expect(json.dryRun).toBe(false);
    expect(updateAssistantPersona).toHaveBeenCalledTimes(2);
    expect(json.synced).toBe(1);
    expect(json.failed).toBe(1);
    expect(json.results[0]).toEqual({ businessId: "a", ok: false, error: "Vapi PATCH /assistant failed (500)" });
    const call = updateAssistantPersona.mock.calls[1][0] as Record<string, unknown>;
    expect(call.firstMessage).toContain("This call may be recorded");
    expect(call).not.toHaveProperty("transcriberLanguage");
  });
});
