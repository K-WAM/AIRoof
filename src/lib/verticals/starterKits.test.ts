import { describe, expect, it } from "vitest";
import { DASHBOARD_TILES, STARTER_KITS, countDashboardMetrics, kitHasAllowedPricing, mergeStarterKit, tilesFor } from "./starterKits";
import { VERTICAL_TEMPLATES, type VerticalId } from "./templates";

describe("vertical starter kits", () => {
  const industries = Object.keys(VERTICAL_TEMPLATES) as VerticalId[];

  it("covers every vertical with usable documents and 2–3 dashboard tiles", () => {
    expect(Object.keys(STARTER_KITS).sort()).toEqual([...industries].sort());
    expect(Object.keys(DASHBOARD_TILES).sort()).toEqual([...industries].sort());
    for (const industry of industries) {
      expect(STARTER_KITS[industry].documents.length).toBeGreaterThan(0);
      for (const document of STARTER_KITS[industry].documents) {
        expect(document.name.length).toBeGreaterThan(0);
        expect(document.body.length).toBeGreaterThan(80);
      }
      expect(DASHBOARD_TILES[industry].length).toBeGreaterThanOrEqual(2);
      expect(DASHBOARD_TILES[industry].length).toBeLessThanOrEqual(3);
    }
    expect(tilesFor("unknown")).toBeNull();
    expect(tilesFor("")).toBeNull();
  });

  it("only supplies clearly labeled prices where pricing is enabled", () => {
    for (const industry of industries) {
      expect(kitHasAllowedPricing(industry), industry).toBe(true);
      for (const item of STARTER_KITS[industry].materials) {
        // Names print on customer invoices — never carry placeholder text; the flag marks them instead.
        expect(item.name).not.toMatch(/placeholder|edit to match/i);
        expect(item.starter).toBe(true);
      }
      for (const item of STARTER_KITS[industry].laborRates) {
        expect(item.role).not.toMatch(/placeholder|edit to match/i);
        expect(item.starter).toBe(true);
      }
    }
  });

  it("keeps care-home and daycare documents at the front desk", () => {
    for (const industry of ["care-homes", "daycares"] as const) {
      const body = STARTER_KITS[industry].documents.map((d) => d.body).join(" ").toLowerCase();
      expect(body).not.toMatch(/diagnos|allerg|medicat|injur|treatment|resident name/);
    }
  });

  it("merges twice without duplicates or overwriting edits and deliberate deletions", () => {
    const kit = STARTER_KITS.roofing;
    const first = mergeStarterKit({ materials: [], laborRates: [], documents: [] }, kit, true, "roofing", 100);
    expect(first.added).toBe(kit.materials.length + kit.laborRates.length + kit.documents.length);
    first.library.materials[0].unitPrice = 999;
    first.library.documents![0].name = "My edited agreement";
    first.library.materials.pop();
    const second = mergeStarterKit(first.library, kit, true, "roofing", 200);
    expect(second.added).toBe(0);
    expect(second.library.materials[0].unitPrice).toBe(999);
    expect(second.library.documents![0].name).toBe("My edited agreement");
    expect(second.library.materials).toHaveLength(kit.materials.length - 1);
    expect(second.library.updatedAt).toBe(100);
  });

  it("recognizes an existing tenant catalog entry by name and does not re-add it", () => {
    const result = mergeStarterKit({
      materials: [{ name: "Shingle bundle", unit: "bundle", unitPrice: 123 }],
      laborRates: [{ role: "Roofer", rate: 245 }],
      documents: [],
    }, STARTER_KITS.roofing, true, "roofing", 100);
    expect(result.library.materials.filter((m) => m.name.includes("Shingle bundle"))).toHaveLength(1);
    expect(result.library.laborRates.filter((l) => l.role.includes("Roofer"))).toHaveLength(1);
    expect(result.library.materials[0].unitPrice).toBe(123);
    expect(result.library.laborRates[0].rate).toBe(245);
  });

  it("counts existing dashboard records using the tenant's local day and week", () => {
    const at = (day: string) => Date.parse(day);
    const counts = countDashboardMetrics(
      [
        { urgency: "urgent", serviceRequested: "Daycare tour", createdAt: at("2026-09-22T15:00:00Z") },
        { urgency: "normal", serviceRequested: "Tour", createdAt: at("2026-09-13T15:00:00Z") },
      ],
      [
        { startTime: at("2026-09-23T17:00:00Z"), status: "pending", pendingConfirmation: true },
        { startTime: at("2026-09-23T18:00:00Z"), status: "cancelled", pendingConfirmation: true },
      ],
      [{ status: "open" }, { status: "complete" }, { status: "complete", invoiceId: "INV-1" }],
      "America/Los_Angeles", at("2026-09-23T19:00:00Z")
    );
    expect(counts).toEqual({
      openJobs: 1, awaitingInvoice: 1, todayBookings: 1,
      pendingConfirmations: 1, tourRequestsThisWeek: 1, urgentLeads: 1,
    });
  });
});
