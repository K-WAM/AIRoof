import type { LibraryDocument, LibraryLaborRate, LibraryMaterial, LibraryPricing } from "@/types/library";
import { VERTICAL_TEMPLATES, type VerticalId } from "./templates";

export interface StarterDocument {
  id: string;
  name: string;
  body: string;
}

export interface StarterKit {
  materials: LibraryMaterial[];
  laborRates: LibraryLaborRate[];
  documents: StarterDocument[];
}

// Names stay clean (they print on customer invoices); the example-price status lives in the
// `starter` flag, which the Library shows as a badge until the tenant edits the price.
const material = (name: string, unit: string, unitPrice: number): LibraryMaterial => ({
  name, unit, unitPrice, starter: true,
});
const labor = (role: string, rate: number): LibraryLaborRate => ({
  role, rate, starter: true,
});
const doc = (id: string, name: string, body: string): StarterDocument => ({ id, name, body });
const agreement = (service: string) => doc("service-agreement", "Service agreement template", `${service} SERVICE AGREEMENT — TEMPLATE\nBusiness: [Business name]\nCustomer: [Customer name]\nService address: [Address]\nScope of work: [Describe agreed work]\nSchedule: [Requested date and any conditions]\nPrice and payment terms: [Insert approved quote and terms]\nChanges: Any change to scope or price requires written approval.\nSignatures: [Business representative] / [Customer]    Date: [Date]\nReview this template with your own adviser before use.`);
const estimate = (service: string) => doc("estimate", "Estimate template", `${service} ESTIMATE — TEMPLATE\nBusiness: [Business name]\nCustomer and site: [Name / address]\nWork proposed: [Description]\nMaterials: [Items and quantities]\nLabor: [Roles and hours]\nTaxes and total: [Use your verified rates and tax settings]\nValid until: [Date]\nCustomer approval: [Signature / date]\nThis is a draft; confirm all prices before sending.`);

/** Every vertical must explicitly declare its kit. Prices are example inputs, never market data. */
export const STARTER_KITS: Record<VerticalId, StarterKit> = {
  roofing: { materials: [material("Shingle bundle", "bundle", 40), material("Underlayment roll", "roll", 75), material("Flashing", "piece", 20)], laborRates: [labor("Roofer", 80), labor("Foreman", 110)], documents: [agreement("ROOFING"), estimate("ROOFING")] },
  hvac: { materials: [material("Air filter", "each", 25), material("Refrigerant", "lb", 60), material("Capacitor", "each", 45)], laborRates: [labor("HVAC technician", 95), labor("Senior technician", 125)], documents: [agreement("HVAC"), estimate("HVAC")] },
  landscaping: { materials: [material("Mulch", "yard", 45), material("Sod", "pallet", 300), material("Edging", "foot", 5)], laborRates: [labor("Landscape crew member", 55), labor("Crew lead", 75)], documents: [agreement("LANDSCAPING"), estimate("LANDSCAPING")] },
  cleaning: { materials: [material("Standard clean — small space", "service", 120), material("Standard clean — medium space", "service", 180), material("Standard clean — large space", "service", 250)], laborRates: [labor("Cleaner", 45), labor("Team lead", 60)], documents: [agreement("CLEANING"), estimate("CLEANING")] },
  dental: { materials: [], laborRates: [], documents: [
    doc("new-patient", "New-patient form template", "NEW-PATIENT FRONT-DESK FORM — TEMPLATE\nPractice: [Practice name]\nPatient name: [Name]\nContact phone/email: [Contact details]\nPreferred appointment time: [Preference]\nInsurance provider and member ID (optional): [Details]\nEmergency contact: [Name / phone]\nOffice use: [Appointment date / provider]\nUse your approved clinical intake forms separately."),
    doc("cancellation", "Cancellation policy template", "APPOINTMENT CANCELLATION POLICY — TEMPLATE\nPractice: [Practice name]\nPlease notify the office [number] hours before an appointment you cannot attend.\nHow to cancel or reschedule: [Phone / email]\nAny fee or exception: [Insert your approved policy]\nPatient acknowledgment: [Signature / date]\nReview this draft with your practice before sharing."),
  ] },
  "care-homes": { materials: [], laborRates: [], documents: [
    doc("visit-request", "Visit-request policy template", "VISIT REQUEST POLICY — FRONT OFFICE TEMPLATE\nCommunity: [Name]\nTo request a general information visit or tour, contact [office phone/email].\nAvailable tour hours: [Hours]\nA team member will confirm the requested time and visitor instructions.\nThis document does not confirm whether any person lives at the community or share personal information.\nReview this draft with your office before use."),
    doc("tour-follow-up", "Tour follow-up template", "TOUR FOLLOW-UP — FRONT OFFICE TEMPLATE\nHello [Contact name],\nThank you for your interest in [Community name]. To arrange or discuss a general tour, contact [office details].\nWe can share public information about amenities, availability, and the application process.\nSincerely, [Front-office name]"),
  ] },
  "property-management": { materials: [], laborRates: [], documents: [
    doc("work-order", "Work-order policy template", "WORK-ORDER REQUEST POLICY — TEMPLATE\nProperty manager: [Company name]\nSubmit maintenance requests to [Office contact / portal].\nProvide property address, unit number, contact details, and a description of the issue.\nFor immediate danger, contact emergency services first; for urgent property issues, use [Emergency contact].\nThe office will acknowledge and coordinate access with the appropriate vendor.\nReview this draft with your team before use."),
    doc("vendor-access", "Vendor access notice template", "VENDOR ACCESS NOTICE — TEMPLATE\nProperty and unit: [Address / unit]\nRequested visit window: [Date and time]\nPurpose: [Work-order summary]\nVendor contact: [Name / number]\nFor scheduling questions contact [Office contact].\nConfirm applicable notice requirements before sending."),
  ] },
  "general-contractors": { materials: [material("Lumber", "board", 15), material("Drywall sheet", "sheet", 25)], laborRates: [labor("General labor", 65), labor("Site supervisor", 105)], documents: [agreement("CONSTRUCTION"), estimate("CONSTRUCTION")] },
  electricians: { materials: [material("Circuit breaker", "each", 40), material("Electrical wire", "foot", 3), material("Outlet", "each", 12)], laborRates: [labor("Electrician", 95), labor("Apprentice", 60)], documents: [agreement("ELECTRICAL"), estimate("ELECTRICAL")] },
  "appliance-repair": { materials: [material("Diagnostic visit", "service", 85), material("Replacement component", "each", 50)], laborRates: [labor("Repair technician", 85), labor("Senior technician", 110)], documents: [agreement("APPLIANCE REPAIR"), estimate("APPLIANCE REPAIR")] },
  childcare: { materials: [], laborRates: [], documents: [
    doc("consultation-follow-up", "Family consultation follow-up template", "CONSULTATION FOLLOW-UP — TEMPLATE\nHello [Contact name],\nThank you for contacting [Business name]. We can discuss general availability, scheduling, and next steps at [Office contact].\nRequested service window: [Date / time]\nA coordinator will confirm details. Do not include child-specific private information in this message."),
    doc("booking-policy", "Booking policy template", "BOOKING POLICY — TEMPLATE\nBusiness: [Business name]\nRequest a consultation through [Office contact].\nHours and notice period: [Insert your policy]\nCancellation process: [Insert your policy]\nThe office confirms all bookings before service.\nReview this draft with your team before use."),
  ] },
  daycares: { materials: [], laborRates: [], documents: [
    doc("tour-follow-up", "Tour follow-up template", "DAYCARE TOUR FOLLOW-UP — FRONT OFFICE TEMPLATE\nHello [Contact name],\nThank you for your interest in [Center name]. We received your tour request for [Requested date].\nOur office will confirm availability and share general program information.\nContact us at [Office phone/email].\nPlease keep child-specific personal information out of this message."),
    doc("enrollment-checklist", "Enrollment checklist template", "ENROLLMENT CHECKLIST — FRONT OFFICE TEMPLATE\nCenter: [Name]\n[ ] Confirm program and age-range availability\n[ ] Schedule a tour\n[ ] Share published hours and fees\n[ ] Provide the center's official enrollment packet\n[ ] Confirm start-date request with the office\nDo not record a child's health or identifying details on this checklist."),
  ] },
  // Priced visits print as invoice lines; no estimate document (a walk is booked at a set price).
  "pet-care": { materials: [material("30-minute walk", "visit", 25), material("60-minute walk", "visit", 40), material("Drop-in visit", "visit", 22), material("Overnight stay", "night", 85)], laborRates: [labor("Walker", 22)], documents: [
    agreement("PET CARE"),
    doc("meet-greet", "Meet & greet checklist", "MEET & GREET CHECKLIST — TEMPLATE\nClient: [Name]  Address: [Address]\nPet(s): [Name / breed / age]\n[ ] Walk routine and favourite route\n[ ] Food, treats and allergies\n[ ] Vet name and phone: [Details]\n[ ] Key, lockbox or code: [Details]\n[ ] Emergency contact: [Name / phone]\n[ ] Photos and updates OK: [Yes / No]\nReview with your own adviser before use."),
  ] },
  "junk-removal": { materials: [material("Small load", "load", 150), material("Medium load", "load", 300), material("Large load", "load", 500)], laborRates: [labor("Removal crew member", 60), labor("Crew lead", 80)], documents: [agreement("JUNK REMOVAL"), estimate("JUNK REMOVAL")] },
};

export function starterKitFor(industry: unknown): StarterKit | null {
  return typeof industry === "string" && Object.prototype.hasOwnProperty.call(STARTER_KITS, industry)
    ? STARTER_KITS[industry as VerticalId]
    : null;
}

type Imported = { materials: string[]; laborRates: string[]; documents: string[] };
export type StarterLibrary = LibraryPricing & { starterKitImported?: Imported };
const key = (value: string) => value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
const catalogKey = key;

/** Pure merge used inside a Firestore transaction. Historical import keys preserve deliberate deletions. */
export function mergeStarterKit(existing: StarterLibrary, kit: StarterKit, pricingEnabled: boolean, industry: VerticalId, now: number): { library: StarterLibrary; added: number } {
  const imported: Imported = {
    materials: [...(existing.starterKitImported?.materials ?? [])],
    laborRates: [...(existing.starterKitImported?.laborRates ?? [])],
    documents: [...(existing.starterKitImported?.documents ?? [])],
  };
  const materials = [...(existing.materials ?? [])];
  const laborRates = [...(existing.laborRates ?? [])];
  const documents = [...(existing.documents ?? [])];
  let added = 0;
  if (pricingEnabled) {
    for (const item of kit.materials) {
      const id = `${industry}:${key(item.name)}`;
      if (imported.materials.includes(id)) continue;
      if (!materials.some((saved) => catalogKey(saved.name) === catalogKey(item.name))) { materials.push(item); added++; }
      imported.materials.push(id);
    }
    for (const item of kit.laborRates) {
      const id = `${industry}:${key(item.role)}`;
      if (imported.laborRates.includes(id)) continue;
      if (!laborRates.some((saved) => catalogKey(saved.role) === catalogKey(item.role))) { laborRates.push(item); added++; }
      imported.laborRates.push(id);
    }
  }
  for (const item of kit.documents) {
    const id = `starter-${industry}-${item.id}`;
    if (imported.documents.includes(id)) continue;
    if (!documents.some((saved) => saved.docId === id || key(saved.name) === key(item.name))) {
      const document: LibraryDocument = { docId: id, name: item.name, b64: Buffer.from(item.body, "utf8").toString("base64"), mimeType: "text/plain", createdAt: now };
      documents.push(document);
      added++;
    }
    imported.documents.push(id);
  }
  return { library: { ...existing, materials, laborRates, documents, starterKitImported: imported, ...(added ? { updatedAt: now } : {}) }, added };
}

// Dashboard tiles live in ./dashboardTiles (the Dashboard imports them without this file's starter price lists).
export { DASHBOARD_TILES, tilesFor, countDashboardMetrics, type DashboardTile, type TileMetric } from "./dashboardTiles";

/** Allows tests to assert pricing coverage against the authoritative module config. */
export function kitHasAllowedPricing(industry: VerticalId): boolean {
  const kit = STARTER_KITS[industry];
  const disabled = VERTICAL_TEMPLATES[industry].disabledModules.includes("pricing");
  return disabled ? kit.materials.length === 0 && kit.laborRates.length === 0 : kit.materials.length > 0 && kit.laborRates.length > 0;
}
