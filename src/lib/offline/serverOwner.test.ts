import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { checkOfflineOwner, fieldOfflineOwner } from "./serverOwner";

describe("outbox replay session binding", () => {
  it("rejects a different signed-in user and any superadmin replay", () => {
    const req = new NextRequest("http://localhost/api/jobs/J-1/updates", { headers: { "x-offline-owner": "user-a" } });
    expect(checkOfflineOwner(req, { uid: "user-b" })?.status).toBe(403);
    expect(checkOfflineOwner(req, { uid: "user-a", superadmin: true })?.status).toBe(403);
    expect(checkOfflineOwner(req, { uid: "user-a" })).toBeNull();
  });
  it("binds a QR queue to the exact HttpOnly session without revealing the token", () => {
    const original = new NextRequest("http://localhost/api/field/session", { headers: { cookie: "__field_access=secret-session-one" } });
    const owner = fieldOfflineOwner(original);
    expect(owner).toMatch(/^field:[a-f0-9]{64}$/); expect(owner).not.toContain("secret");
    const changed = new NextRequest("http://localhost/api/jobs/J-1/updates", { headers: { cookie: "__field_access=secret-session-two", "x-offline-owner": owner } });
    expect(checkOfflineOwner(changed, { uid: "field:biz" })?.status).toBe(403);
  });
});
