import { describe, expect, it } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { resolveCustomer } from "../resolve";

describe("resolveCustomer", () => {
  it("two simultaneous creates for the same person make ONE customer", async () => {
    const db = makeFakeDb();
    db.__seed("businesses", "b", {});
    const input = { name: "José Pérez", phone: "+1 305 555 0101" };
    const [a, b] = await Promise.all([resolveCustomer(db as never, "b", input), resolveCustomer(db as never, "b", { name: "jose perez", phone: "305-555-0101" })]);
    expect(a.customerId).toBe(b.customerId);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    expect(db.__list("businesses/b/customers")).toHaveLength(1);
  });

  it("finds a customer made before the identity markers existed (by matchKey) without creating another", async () => {
    const db = makeFakeDb();
    db.__seed("businesses", "b", { customerCounter: 1004 });
    const made = await resolveCustomer(db as never, "b", { name: "Ana Diaz", phone: "3055550199" });
    expect(made).toEqual({ customerId: "C-1005", created: true });
    expect(await resolveCustomer(db as never, "b", { name: "ana díaz", phone: "(305) 555-0199" })).toEqual({ customerId: "C-1005", created: false });
    expect(await resolveCustomer(db as never, "b", { name: "Ana Diaz", phone: "3055550100" })).toMatchObject({ customerId: "C-1006", created: true });
  });
});
