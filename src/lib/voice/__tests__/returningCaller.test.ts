import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { buildSearchTokens } from "@/lib/customers/search";
import { findReturningCaller, returningCallerSection, withinBudget } from "@/lib/voice/returningCaller";

const NOW = Date.UTC(2026, 9, 31, 15, 0); // Sat Oct 31 2026, 11:00 AM Eastern
const DAY = 24 * 60 * 60 * 1000;
const CALLER = "+18254887791";
const TZ = "America/New_York";

function seededDb() {
  const db = makeFakeDb();
  db.__seed("businesses", "biz", { businessName: "Apex Roofing" });
  return db;
}
const asDb = (db: ReturnType<typeof makeFakeDb>) => db as unknown as Pick<Firestore, "collection">;

function appointment(db: ReturnType<typeof makeFakeDb>, id: string, data: Record<string, unknown>) {
  db.__seed("businesses/biz/appointments", id, {
    callerPhone: CALLER, callerName: "John Smith", serviceType: "Roof inspection", status: "requested",
    pendingConfirmation: true, address: "317 West Riverbend Drive, Miami, FL 33185", ...data,
  });
}

function customer(db: ReturnType<typeof makeFakeDb>, id: string, data: { name: string; phone: string; address?: string; notes?: string }) {
  db.__seed("businesses/biz/customers", id, {
    ...data, jobCount: 1, lastJobAt: NOW - 30 * DAY, searchTokens: buildSearchTokens(data),
  });
}

describe("findReturningCaller", () => {
  it("finds the caller's upcoming visit by caller ID, with the access note from the booking", async () => {
    const db = seededDb();
    appointment(db, "a1", { startTime: NOW + 3 * DAY, notes: "Leak over the garage\nAccess: gate code 1010" });
    const caller = await findReturningCaller(asDb(db), "biz", CALLER, TZ, NOW);
    expect(caller).toEqual({
      names: ["John Smith"],
      upcoming: { serviceType: "Roof inspection", when: "Tuesday, November 3 at 10:00 AM", // DST ends Nov 1
        address: "317 West Riverbend Drive, Miami, FL 33185", confirmed: false },
      address: "317 West Riverbend Drive, Miami, FL 33185",
      access: "gate code 1010",
    });
  });

  it("returns null for an unknown number and for a number one digit away (never a 'similar' match)", async () => {
    const db = seededDb();
    appointment(db, "a1", { startTime: NOW + DAY });
    customer(db, "c1", { name: "John Smith", phone: "(825) 488-7791" });
    expect(await findReturningCaller(asDb(db), "biz", "+13055550100", TZ, NOW)).toBeNull();
    expect(await findReturningCaller(asDb(db), "biz", "+18254887792", TZ, NOW)).toBeNull();
    // Same last 7 digits, different area code: the customer token matches but the full number does not.
    expect(await findReturningCaller(asDb(db), "biz", "+13054887791", TZ, NOW)).toBeNull();
  });

  it("recognises a customer record by the same number in another format, and keeps office-only notes out", async () => {
    const db = seededDb();
    customer(db, "c1", { name: "José Pérez", phone: "(825) 488-7791", address: "12 Palm Ave, Doral, FL 33172",
      notes: "Pays late, call before invoicing\nDog in the yard; gate code 4421" });
    const caller = await findReturningCaller(asDb(db), "biz", CALLER, TZ, NOW);
    expect(caller).toEqual({ names: ["José Pérez"], address: "12 Palm Ave, Doral, FL 33172", access: "Dog in the yard; gate code 4421" });
    expect(JSON.stringify(caller)).not.toContain("Pays late");
  });

  it("ignores cancelled and long-past visits as 'upcoming' but still knows the name and address", async () => {
    const db = seededDb();
    appointment(db, "old", { startTime: NOW - 40 * DAY, status: "completed" });
    appointment(db, "cancelled", { startTime: NOW + 2 * DAY, status: "cancelled" });
    const caller = await findReturningCaller(asDb(db), "biz", CALLER, TZ, NOW);
    expect(caller?.upcoming).toBeUndefined();
    expect(caller?.names).toEqual(["John Smith"]);
    expect(caller?.address).toBe("317 West Riverbend Drive, Miami, FL 33185");
  });

  it("lists both names when a household shares the phone", async () => {
    const db = seededDb();
    appointment(db, "a1", { startTime: NOW + DAY });
    customer(db, "c1", { name: "Maria Smith", phone: CALLER });
    expect((await findReturningCaller(asDb(db), "biz", CALLER, TZ, NOW))?.names).toEqual(["John Smith", "Maria Smith"]);
  });

  it("returns null without a caller ID", async () => {
    expect(await findReturningCaller(asDb(seededDb()), "biz", undefined, TZ, NOW)).toBeNull();
  });
});

describe("withinBudget", () => {
  it("gives up with null when the lookup is too slow, and swallows errors", async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve("late"), 200));
    expect(await withinBudget(slow, 20)).toBeNull();
    expect(await withinBudget(Promise.reject(new Error("firestore down")), 50)).toBeNull();
    expect(await withinBudget(Promise.resolve("fast"), 50)).toBe("fast");
  });
});

describe("returningCallerSection", () => {
  it("gates everything on a matching name and never reads the access code aloud", () => {
    const text = returningCallerSection({
      names: ["John Smith"],
      upcoming: { serviceType: "Roof inspection", when: "Tuesday, November 3 at 9:00 AM", address: "317 West Riverbend Drive", confirmed: false },
      address: "317 West Riverbend Drive",
      access: "gate code 1010",
    });
    expect(text).toContain("on file for John Smith");
    expect(text).toContain("Say NOTHING from this section until the caller tells you a name that matches");
    expect(text).toContain("Hi John, good to hear from you again");
    expect(text).toContain("I see you're on for Tuesday, November 3 at 9:00 AM");
    expect(text).toContain("Is this for 317 West Riverbend Drive again?");
    expect(text).toContain("Same access as before?");
    expect(text).toContain("without reading the code aloud");
    expect(text).toContain("treat them as a new caller and never reveal anything");
  });

  it("omits the booking and access lines it has no data for", () => {
    const text = returningCallerSection({ names: ["Ana Lopez"] });
    expect(text).not.toContain("Upcoming visit");
    expect(text).not.toContain("again?");
    expect(text).not.toContain("Same access");
    expect(text).toContain("don't ask their name again");
  });
});
