import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { crewEmailRecipients } from "./recipients";

function setup() {
  const fake = makeFakeDb();
  fake.__seed("businessUsers", "u1", { businessId: "biz", crewId: "c1", role: "crew", email: "carlos@biz.test", displayName: "Carlos", active: true });
  fake.__seed("businessUsers", "u2", { businessId: "biz", crewId: "c1", role: "staff", email: "TYLER@crew.test", active: true });
  fake.__seed("businessUsers", "u3", { businessId: "biz", crewId: "c1", role: "staff", email: "gone@biz.test", active: false });
  fake.__seed("businessUsers", "u4", { businessId: "biz", crewId: "c1", role: "viewer", email: "vera@biz.test", active: true });
  fake.__seed("businessUsers", "u5", { businessId: "biz", crewId: "c2", role: "crew", email: "other@biz.test", active: true });
  return fake as unknown as Firestore;
}

describe("crewEmailRecipients", () => {
  it("returns the crew address then each active member with an email, deduped", async () => {
    const recipients = await crewEmailRecipients({
      db: setup(), businessId: "biz", crewId: "c1", crewEmail: "tyler@crew.test", keyPrefix: "J-1:100",
    });
    expect(recipients.map((r) => r.to)).toEqual(["tyler@crew.test", "carlos@biz.test"]);
    expect(recipients.map((r) => r.entityId)).toEqual(["J-1:100", "J-1:100:u1"]);
    expect(recipients[1].recipientName).toBe("Carlos");
  });

  it("uses crewEntityId for the crew address when one is given", async () => {
    const recipients = await crewEmailRecipients({
      db: setup(), businessId: "biz", crewId: "c1", crewEmail: "tyler@crew.test",
      keyPrefix: "a:assigned:100", crewEntityId: "a:assigned:100:c1",
    });
    expect(recipients[0].entityId).toBe("a:assigned:100:c1");
  });

  it("still returns the members when the crew itself has no address", async () => {
    const recipients = await crewEmailRecipients({ db: setup(), businessId: "biz", crewId: "c1", keyPrefix: "J-1:100" });
    expect(recipients.map((r) => r.to)).toEqual(["carlos@biz.test", "TYLER@crew.test"]);
  });
});
