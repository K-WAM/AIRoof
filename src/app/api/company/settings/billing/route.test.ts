import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { PUT } from "./route";

let db: ReturnType<typeof makeFakeDb>;
vi.mock("@/lib/auth/verifyRole", () => ({ verifyAuthAndRole: async () => ({ user: { uid: "owner", businessId: "a", role: "owner" } }) }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => ({ collection: () => ({ doc: () => {
  const ref = db.collection("businesses").doc("a");
  return { update: ref.update.bind(ref), get: async () => {
    const snapshot = await ref.get();
    // Another request flips Pay now after this route's read, before its write.
    await ref.update({ "billingPrefs.payNow": true });
    return snapshot;
  } };
} }) }) }));
beforeEach(() => { db = makeFakeDb(); db.__seed("businesses", "a", { billingPrefs: { payNow: false, payInstructions: "Old details" } }); });
it("saving manual payment details cannot undo a concurrent online-payment opt-in", async () => {
  const res = await PUT(new NextRequest("https://app.test/api/company/settings/billing", { method: "PUT", body: JSON.stringify({ businessId: "a", payInstructions: "New details" }) }));
  expect(res.status).toBe(200);
  expect(db.__peek("businesses", "a")).toMatchObject({ billingPrefs: { payNow: true, payInstructions: "New details" } });
});
