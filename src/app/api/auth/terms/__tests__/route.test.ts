import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const store = new Map<string, Record<string, unknown>>();
vi.mock("@/lib/firebase/admin", () => ({
  verifyIdToken: vi.fn(async (token: string) => (token === "good" ? { uid: "u1", email: "owner@roof.test" } : null)),
  getAdminFirestore: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        create: async (data: Record<string, unknown>) => {
          const key = `${name}/${id}`;
          if (store.has(key)) throw Object.assign(new Error("ALREADY_EXISTS"), { code: 6 });
          store.set(key, data);
        },
      }),
    }),
  }),
}));

import { POST } from "../route";
import { LEGAL_VERSION } from "@/lib/legal/version";

const req = (token?: string) => new NextRequest("http://localhost/api/auth/terms", {
  method: "POST",
  headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "x-forwarded-for": "203.0.113.9, 10.0.0.1", "user-agent": "test" },
});

describe("POST /api/auth/terms", () => {
  beforeEach(() => store.clear());

  it("refuses without a valid sign-in token", async () => {
    expect((await POST(req())).status).toBe(401);
    expect((await POST(req("bad"))).status).toBe(401);
    expect(store.size).toBe(0);
  });

  it("records who accepted which version, when and from where", async () => {
    const res = await POST(req("good"));
    expect(res.status).toBe(200);
    const doc = store.get(`legalAcceptances/u1_${LEGAL_VERSION}`);
    expect(doc).toMatchObject({ uid: "u1", email: "owner@roof.test", version: LEGAL_VERSION, ageConfirmed18: true, via: "sign-in", ip: "203.0.113.9" });
  });

  it("keeps the first record when the same person signs in again", async () => {
    await POST(req("good"));
    const first = store.get(`legalAcceptances/u1_${LEGAL_VERSION}`);
    expect((await POST(req("good"))).status).toBe(200);
    expect(store.get(`legalAcceptances/u1_${LEGAL_VERSION}`)).toBe(first);
  });
});
