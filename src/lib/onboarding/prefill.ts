import type { BusinessConfig } from "@/types";
import type { StaffMember } from "@/types/staff";
import type { OnboardingPersonRow } from "@/types/onboarding";
import type { LibraryLogo } from "@/types/library";
import { normalizeName } from "@/lib/format/name";
import { userTypeOf } from "@/lib/team/userTypes";
import { companiesOf } from "@/lib/companies/companies";
import { bootstrapCompanies } from "@/lib/companies/bootstrap";
import { resolveLetterhead } from "@/lib/documents/letterhead";
import { onboardingDb, OnboardingError } from "./store";
import type { Prefill } from "./validate";

export async function resolvePrefill(businessId: string): Promise<Prefill> {
  const db = onboardingDb();
  const [business, staff, users, crews] = await Promise.all([
    db.collection("businesses").doc(businessId).get(),
    db.collection(`businesses/${businessId}/staff`).get(),
    db.collection("businessUsers").where("businessId", "==", businessId).get(),
    db.collection(`businesses/${businessId}/crews`).get(),
  ]);
  if (!business.exists) throw new OnboardingError("Client not found.", 404);
  const config = business.data() as BusinessConfig & { legalName?: string; addressStreet?: string; addressCity?: string; addressState?: string; addressZip?: string };
  const activeCrews = crews.docs.filter(d => d.data().active === true);
  const activeCrewIds = new Set(activeCrews.map(d => d.id));
  const liveCrew = (crewId: unknown) => (typeof crewId === "string" && activeCrewIds.has(crewId) ? crewId : "");
  const people = new Map<string, OnboardingPersonRow>();
  for (const doc of staff.docs) {
    const s = doc.data() as StaffMember;
    if (!s.active || !s.name) continue;
    people.set(normalizeName(s.name), { name: s.name, position: s.position ?? "", appRole: s.userType ?? "none", email: s.email ?? "", mobile: s.mobile ?? "", ...(s.language ? { language: s.language } : {}), crewId: liveCrew(s.crewId), prefilled: true });
  }
  for (const doc of users.docs) {
    const u = doc.data();
    const name = u.displayName || u.name;
    if (!name || u.active === false) continue;
    const key = normalizeName(name);
    people.set(key, { ...people.get(key), name, position: u.position || people.get(key)?.position || "", appRole: userTypeOf({ role: u.role, trade: u.trade }), email: u.email || people.get(key)?.email || "", mobile: u.mobile || u.phone || people.get(key)?.mobile || "", ...(u.language ? { language: u.language } : {}), crewId: liveCrew(u.crewId) || people.get(key)?.crewId || "", prefilled: true });
  }
  return {
    "business.legalName": config.legalName || config.businessName,
    "business.displayName": config.businessName,
    "business.phone": config.contactPhone || config.phoneNumber || "",
    "business.website": config.websiteUrl || "",
    "business.address": { street: config.addressStreet || config.address || "", city: config.addressCity || "", state: config.addressState || "", zip: config.addressZip || "" },
    "business.serviceArea": Array.isArray(config.serviceArea) ? config.serviceArea.join(", ") : config.serviceArea || "",
    "business.hours": typeof config.businessHours === "string" ? config.businessHours : Object.entries(config.businessHours ?? {}).map(([day, hours]) => `${day}: ${hours}`).join("\n"),
    "business.notificationEmail": config.notificationEmail || config.contactEmail || "",
    "companies.options": companiesOf(config).map(c => ({ value: c.id, label: c.name })),
    "crews.options": activeCrews.map(d => ({ value: d.id, label: d.data().name || d.id })),
    "team.people": [...people.values()],
  };
}
export async function clientLogo(businessId: string) {
  const db = onboardingDb();
  const [business, library] = await Promise.all([db.collection("businesses").doc(businessId).get(), db.collection(`businesses/${businessId}/library`).doc("logos").get()]);
  const b = business.data() ?? {};
  const logos = (library.data()?.logos ?? []) as LibraryLogo[];
  const companies = bootstrapCompanies(b, logos).companies;
  const logo = companies?.find(c => c.isDefault)?.logoUrl ?? resolveLetterhead(b, logos).logoUrl ?? null;
  return logo && /^(https:\/\/|data:image\/(png|jpeg|webp|gif|svg\+xml);base64,)/i.test(logo) ? logo : null;
}
