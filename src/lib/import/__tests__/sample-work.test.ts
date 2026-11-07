import { describe, expect, it } from "vitest";
import { buildSampleWork, chooseDemoDay, describeSampleWork, localDateKey, pickProperties, SAMPLE_WORK_SOURCE as SCRIPT_SOURCE } from "../../../../scripts/lib/sample-work.mjs";
import { buildProjection, parsedToFieldLog } from "@/lib/jobs/projection";
import { latestFieldUpdate } from "@/lib/jobs/writeProjection";
import { SAMPLE_WORK_SOURCE } from "@/types/provenance";
import type { FieldUpdate } from "@/types/jobs";

// T-376: sample work for a client's blank screens (scripts/lib/sample-work.mjs).
const tz = "America/New_York";
const hours = { Monday: "08:00 - 17:00", Tuesday: "08:00 - 17:00", Wednesday: "08:00 - 17:00", Thursday: "08:00 - 17:00", Friday: "08:00 - 17:00", Saturday: "Closed", Sunday: "Closed" };
// Wed Nov 11 2026, 9:00 AM Eastern (EST = UTC-5).
const WED_9AM = Date.UTC(2026, 10, 11, 14, 0);
// Every name, address, catalog item and price below is made up (never a client's real data — that stays in git-ignored
// client-resources/). The shapes match a Jobba import: two records for one organisation, a property with no name, a
// customer with no address, a person-named crew, an inspector row and an inactive crew.
const crews = [
  { crewId: "c-rosa", name: "Rosa's Crew", active: true },
  { crewId: "c-delgado", name: "Delgado Crew", active: true },
  { crewId: "c-mateo", name: "Mateo's Crew", active: true },
  { crewId: "c-dana", name: "Dana Whitfield", active: true },
  { crewId: "c-service", name: "Service", active: true },
  { crewId: "c-inspector", name: "Inspectors", active: true, kind: "inspector" },
  { crewId: "c-off", name: "Old Crew", active: false },
];
const prop = (name: string, address: string, city = "Boca Raton") => ({ name, address, city, state: "FL", zip: "33431" });
const customers = [
  { customerId: "C-1069", name: "Harbor View Academy , Inc.", properties: [prop("Faculty Housing 12", "120 Harbor Way", "Fort Lauderdale")], workOrders: 274 },
  { customerId: "C-1068", name: "Harbor View Academies, Inc", properties: [prop("Summer Camp", "400 Camp Road")], workOrders: 85 },
  { customerId: "C-1093", name: "Lakeside Community Council", properties: [prop("Pool House", "16 Lakeside Drive", "Coral Springs")], workOrders: 114 },
  { customerId: "C-1072", name: "Quiet Pines Country Club P.O.A.", properties: [prop("Cluster 3", "45 Heron Ct", "Boynton Beach")], workOrders: 46 },
  { customerId: "C-1078", name: "Seaview Property Mgmt", properties: [prop("Buildings 1-27", "39 Shore Road", "Tequesta")], workOrders: 30 },
  { customerId: "C-1077", name: "Coral Bay Yacht Club", properties: [prop("Clubhouse", "24 Bay Drive West")], workOrders: 25 },
  { customerId: "C-1111", name: "Sunrise County Schools", properties: [prop("", "33 Sunrise Blvd", "West Palm Beach")], workOrders: 22 },
  { customerId: "C-1131", name: "Maple Road Plaza Ltd", properties: [prop("Plaza Phase 1", "106 Maple Road", "Coral Springs")], workOrders: 18 },
  { customerId: "C-1003", name: "Oceanfront Towers Corporation", properties: [prop("Oceanfront Towers", "27 Ocean Blvd", "Palm Beach")], workOrders: 14 },
  { customerId: "C-1047", name: "Bright & Bright, Inc.", properties: [prop("Bright Bakery", "29 Market Street", "Hallandale Beach")], workOrders: 14 },
  { customerId: "C-1105", name: "City Of Example Beach", properties: [prop("Fire Station 9", "50 Main Street", "West Palm Beach")], workOrders: 11 },
  { customerId: "C-1999", name: "No Address LLC", properties: [], workOrders: 500 },
];
// Catalog names only need to CONTAIN the builder's generic keywords ("roof tile", "mortar", "flashing cement", ...).
const materials = [
  { name: "Clay Roof Tile", unitPrice: 31.5, unit: "each" }, { name: "Grey Tile Mortar", unitPrice: 18.25, unit: "each" },
  { name: "Silicone Mastic Tube", unitPrice: 120.4, unit: "each" }, { name: "Flashing Cement Pail", unitPrice: 77.1, unit: "each" },
  { name: "Pourable Sealer Kit", unitPrice: 210, unit: "each" }, { name: "Downspout Elbow", unitPrice: 14.9, unit: "each" },
  { name: "Disposal Fee", unitPrice: 25, unit: "each" },
];
const laborRates = [{ role: "Foreman", rate: 88 }, { role: "Roof Mechanic", rate: 82 }, { role: "Service Roofer", rate: 80 }]; // the Library shape (LibraryLaborRate)
const categories = ["Broken Tiles", "Clogged Scupper / Drain", "Pitch Pan Sealant", "Other"];
const companies = [{ id: "co-main", isDefault: true }, { id: "co-second" }];
const jobIds = ["J-1000", "J-1001", "J-1002", "J-1003", "J-1004", "J-1005", "J-1006"];
const build = (overrides: Record<string, unknown> = {}) => buildSampleWork({
  now: WED_9AM, businessId: "e2e-roofpros", timeZone: tz, businessHours: hours, crews, customers, materials, laborRates, categories, companies, jobIds, ...overrides,
});
const minutesOfDay = (ms: number) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(ms).map((p) => [p.type, p.value]));
  return Number(parts.hour) * 60 + Number(parts.minute);
};
const weekday = (ms: number) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(ms);

describe("chooseDemoDay", () => {
  it("is today on an open day before 5 pm, else the next open day", () => {
    expect(chooseDemoDay({ now: WED_9AM, timeZone: tz, businessHours: hours })).toBe("2026-11-11");
    expect(chooseDemoDay({ now: Date.UTC(2026, 10, 11, 22, 30), timeZone: tz, businessHours: hours })).toBe("2026-11-12"); // Wed 5:30 PM
    expect(chooseDemoDay({ now: Date.UTC(2026, 10, 13, 23, 0), timeZone: tz, businessHours: hours })).toBe("2026-11-16"); // Fri 6 PM -> Mon
    expect(chooseDemoDay({ now: Date.UTC(2026, 10, 7, 6, 12), timeZone: tz, businessHours: hours })).toBe("2026-11-09"); // Sat 1 AM -> Mon
  });
  it("accepts a given day only when its previous open day has happened", () => {
    expect(chooseDemoDay({ now: WED_9AM, timeZone: tz, businessHours: hours, day: "2026-11-12" })).toBe("2026-11-12");
    expect(() => chooseDemoDay({ now: WED_9AM, timeZone: tz, businessHours: hours, day: "2026-11-13" })).toThrow(/too far ahead/);
    expect(() => chooseDemoDay({ now: WED_9AM, timeZone: tz, businessHours: hours, day: "2026-11-10" })).toThrow(/past/);
    expect(() => chooseDemoDay({ now: WED_9AM, timeZone: tz, businessHours: hours, day: "2026-11-14" })).toThrow(/not an open day/);
    expect(() => chooseDemoDay({ now: WED_9AM, timeZone: tz, businessHours: hours, day: "2026-13-01" })).toThrow(/YYYY-MM-DD/);
  });
});

describe("buildSampleWork", () => {
  const work = build();
  const all = [...work.jobs.map((j) => j.doc), ...work.appointments.map((a) => a.doc), ...work.leads.map((l) => l.doc)];

  it("marks every record as Luxor sample work, with the same source the app recognises", () => {
    expect(SCRIPT_SOURCE).toBe(SAMPLE_WORK_SOURCE);
    expect(work.jobs).toHaveLength(7);
    expect(work.appointments).toHaveLength(1);
    expect(work.leads).toHaveLength(2);
    for (const doc of all) expect(doc.provenance).toMatchObject({ origin: "luxor-sample", source: SAMPLE_WORK_SOURCE, addedAt: WED_9AM });
  });

  it("copies no email and no real phone number; requests use 555-01xx numbers", () => {
    const text = JSON.stringify(work);
    expect(text).not.toMatch(/@/);
    for (const phone of text.match(/\+1\d{10}/g) ?? []) expect(phone).toMatch(/^\+1\d{3}55501\d{2}$/);
    for (const { doc } of work.jobs) { expect(doc.clientPhone).toBeUndefined(); expect(doc.clientEmail).toBeUndefined(); }
  });

  it("puts the work at real properties, one organisation each, most past work first", () => {
    expect(work.jobs.map((j) => j.doc.jobId)).toEqual(jobIds);
    const ids = all.map((doc) => doc.customerId);
    expect(new Set(ids).size).toBe(10);
    expect(ids).not.toContain("C-1068"); // same school as C-1069
    expect(ids).not.toContain("C-1999"); // no property address
    expect(work.jobs[0].doc).toMatchObject({ customerId: "C-1069", clientName: "Harbor View Academy , Inc.", address: "120 Harbor Way, Fort Lauderdale, FL 33431", title: "Roof leak repair — Faculty Housing 12" });
    expect(work.leads[0].doc.title).toBeUndefined();
    expect(pickProperties(customers, 10).find((p) => p.customerId === "C-1111")?.label).toBe("33 Sunrise Blvd");
  });

  it("schedules on the client's active work crews, on open days, inside business hours", () => {
    const used = new Set(work.jobs.map((j) => j.doc.assignedCrewId).filter(Boolean));
    for (const id of used) expect(["c-rosa", "c-delgado", "c-mateo", "c-dana", "c-service"]).toContain(id);
    for (const { doc } of work.jobs.filter((j) => j.doc.scheduledStart)) {
      expect(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]).toContain(weekday(doc.scheduledStart));
      expect(minutesOfDay(doc.scheduledStart)).toBeGreaterThanOrEqual(8 * 60);
      expect(minutesOfDay(doc.scheduledEnd)).toBeLessThanOrEqual(17 * 60);
    }
    expect(work.jobs[0].doc.assignedCrewId).toBe("c-service");
    expect(work.jobs[1].doc.assignedCrewId).toBe("c-dana");
    expect(work.jobs[6].doc.assignedCrewId).toBeUndefined();
    expect(work.jobs[6].doc.scheduledStart).toBeUndefined();
    expect(localDateKey(work.jobs[3].doc.scheduledStart, tz)).toBe("2026-11-11");
    expect(work.jobs.filter((j) => j.doc.crewConfirmed === false)).toHaveLength(2);
    expect(work.appointments[0].doc).toMatchObject({ status: "requested", pendingConfirmation: true, calendarProvider: "mock" });
    expect(work.leads[0].doc).toMatchObject({ urgency: "urgent", escalated: true, status: "new" });
  });

  it("prices from the client's own catalog and issues the inspection under the second company", () => {
    const inspection = work.jobs[1].doc;
    expect(inspection.companyId).toBe("co-second");
    expect(work.jobs.filter((j, i) => i !== 1).every((j) => j.doc.companyId === "co-main")).toBe(true);
    // The client's own category wording, matched by keyword.
    expect(inspection.findings.map((f: { category: string }) => f.category)).toEqual(["Broken Tiles", "Clogged Scupper / Drain", "Pitch Pan Sealant"]);
    expect(build({ categories: [] }).jobs[1].doc.findings.map((f: { category: string }) => f.category)).toEqual(["Tile", "Drains", "Flashing"]);
    const lines = inspection.findings.flatMap((f: { lines: Array<{ description: string; unitPrice: number }> }) => f.lines);
    // The client's own item name and price when its catalog has one containing the keyword…
    expect(lines.find((l: { description: string }) => l.description === "Clay Roof Tile")?.unitPrice).toBe(31.5);
    expect(lines.find((l: { description: string }) => l.description === "Flashing Cement Pail")?.unitPrice).toBe(77.1);
    // …else the generic label at a stand-in price.
    expect(lines.find((l: { description: string }) => l.description === "Drain basket")?.unitPrice).toBe(90);
    expect(lines.filter((l: { description: string }) => l.description === "Roof Mechanic").every((l: { unitPrice: number }) => l.unitPrice === 82)).toBe(true);
    expect(inspection.findings.every((f: { includeInQuote: boolean; includeInReport: boolean }) => f.includeInQuote && f.includeInReport)).toBe(true);
    expect(build({ companies: [] }).jobs.every((j) => j.doc.companyId === undefined)).toBe(true);
  });

  it("keeps everything that already happened in the past", () => {
    const happened: number[] = [];
    for (const { doc, updates } of work.jobs) {
      happened.push(doc.createdAt, doc.updatedAt, ...(updates as Array<{ createdAt: number }>).map((u) => u.createdAt), ...(doc.statusHistory ?? []).map((s: { at: number }) => s.at));
      if (doc.completedAt) happened.push(doc.completedAt);
      if (doc.lastFieldUpdate) happened.push(doc.lastFieldUpdate.at);
    }
    for (const { doc } of [...work.appointments, ...work.leads]) happened.push(doc.createdAt, doc.updatedAt);
    for (const t of happened) expect(t).toBeLessThanOrEqual(WED_9AM - 60_000);
    // Run at 5:10 PM: the story's "yesterday" is today, and the 5:40 PM after-hours call is pulled into the past.
    const late = Date.UTC(2026, 10, 11, 22, 10);
    const evening = build({ now: late });
    expect(evening.day).toBe("2026-11-12");
    expect(evening.leads[0].doc.createdAt).toBeLessThanOrEqual(late - 60_000);
  });

  it("writes the same job totals the app computes from the notes (projection drift check)", () => {
    const withNotes = work.jobs.filter((j) => j.updates.length > 0);
    expect(withNotes.map((j) => j.doc.jobId)).toEqual(["J-1000", "J-1001", "J-1002"]);
    for (const { doc, updates } of withNotes) {
      const ledger = updates as FieldUpdate[];
      const parsed = buildProjection(ledger, [], tz);
      expect(doc.parsed).toEqual(parsed);
      const log = parsedToFieldLog(parsed);
      expect({ materials: doc.materials, laborEntries: doc.laborEntries, timelineEvents: doc.timelineEvents, fieldNotes: doc.fieldNotes, totalLaborHours: doc.totalLaborHours }).toEqual(log);
      expect(doc.lastFieldUpdate).toEqual(latestFieldUpdate(ledger));
    }
    expect(work.jobs[0].doc.totalLaborHours).toBe(14);
    expect(work.jobs[0].updates[1]).toMatchObject({ language: "es", rawTextEn: expect.stringContaining("14 broken tiles") });
  });

  it("works for a small account: reuses its properties, leaves jobs unscheduled when it has no crews", () => {
    const small = build({ customers: customers.slice(0, 2), crews: [] });
    expect(small.jobs.every((j) => j.doc.assignedCrewId === undefined)).toBe(true);
    expect(new Set([...small.jobs.map((j) => j.doc.customerId)])).toEqual(new Set(["C-1069"]));
    expect(() => build({ customers: [customers[11]] })).toThrow(/property address/);
    expect(() => build({ jobIds: ["J-1"] })).toThrow(/7 job ids/);
  });

  it("describes the plan in one line per record", () => {
    const lines = describeSampleWork(work, tz, crews);
    expect(lines[0]).toContain("2026-11-11");
    expect(lines).toHaveLength(1 + 7 + 1 + 2);
    expect(lines.join("\n")).not.toMatch(/555/);
  });
});
