import { beforeEach, expect, it, vi } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { resolvePrefill, clientLogo } from "../prefill";
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminFirestore: () => state.db }));
let fake: ReturnType<typeof makeFakeDb>;
beforeEach(() => {
  fake = makeFakeDb(); state.db = fake;
  fake.__seed("businesses", "a", { businessName: "Example", contactPhone: "+19545550123", websiteUrl: "https://example.test", address: "123 Example St", addressCity: "Town", addressState: "FL", addressZip: "33333", serviceArea: ["Town", "City"], notificationEmail: "office@example.test", businessHours: { Monday: "8-5", Tuesday: "8-5" } });
});
it("works with an empty or missing staff collection and resolves every business key", async () => {
  const result = await resolvePrefill("a");
  expect(result).toMatchObject({ "business.legalName": "Example", "business.displayName": "Example", "business.phone": "+19545550123", "business.website": "https://example.test", "business.address": { street: "123 Example St", city: "Town", state: "FL", zip: "33333" }, "business.serviceArea": "Town, City", "business.hours": "Monday: 8-5\nTuesday: 8-5", "business.notificationEmail": "office@example.test", "team.people": [], "crews.options": [], "companies.options": [] });
});
it("merges staff and logins by normalized name without granting access or contacting anyone", async () => {
  fake.__seed("businesses/a/staff", "one", { name: "José   Example", active: true, position: "Supervisor", mobile: "+19545550123", crewId: "crew-a", language: "both" });
  fake.__seed("businesses/a/staff", "two", { name: "Staff Only", active: true, userType: "technician" });
  fake.__seed("businesses/a/staff", "inactive", { name: "Inactive", active: false });
  fake.__seed("businessUsers", "login", { businessId: "a", displayName: "Jose Example", role: "staff", trade: "supervisor", email: "jose@example.test", active: true });
  fake.__seed("businessUsers", "foreign", { businessId: "b", displayName: "Other Tenant", active: true });
  fake.__seed("businesses/a/crews", "crew-a", { name: "Crew A", active: true });
  fake.__seed("businesses/a/crews", "off", { name: "Off", active: false });
  const result = await resolvePrefill("a");
  expect(result["team.people"]).toEqual([
    { name: "Jose Example", position: "Supervisor", appRole: "supervisor", email: "jose@example.test", mobile: "+19545550123", crewId: "crew-a", language: "both", prefilled: true },
    { name: "Staff Only", position: "", appRole: "technician", email: "", mobile: "", crewId: "", prefilled: true },
  ]);
  expect(result["crews.options"]).toEqual([{ value: "crew-a", label: "Crew A" }]);
});
it("uses the default billing company's logo, then the library default, then text", async () => {
  expect(await clientLogo("a")).toBeNull();
  fake.__seed("businesses/a/library", "logos", { logos: [{ logoId: "logo-a", name: "A", mimeType: "image/png", b64: "AAAA", variant: "color", isDefault: true }, { logoId: "logo-b", name: "B", mimeType: "image/png", b64: "BBBB", variant: "color" }] });
  expect(await clientLogo("a")).toBe("data:image/png;base64,AAAA");
  fake.__seed("businesses", "a", { ...fake.__peek("businesses", "a"), billingCompanies: [{ id: "company-a", name: "A", shortName: "A", logoId: "logo-a" }, { id: "company-b", name: "B", shortName: "B", logoId: "logo-b", isDefault: true }] });
  expect(await clientLogo("a")).toBe("data:image/png;base64,BBBB");
});
