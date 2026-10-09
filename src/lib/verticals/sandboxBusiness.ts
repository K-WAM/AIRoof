// One read-only demo business per industry for the public demo link (/try/<industry> → "See it in the real app").
// Before 2026-10-09 every industry's link opened the one shared live-line business (demo-roofing), whose industry is
// whatever Demo Studio last launched — so a dog walker could land in a roofing app. Each industry now has its own
// `demo-try-<industry>` business, created and filled with that industry's demo data on first visit and refreshed once
// a day (bookings stay in the future). Visitors are always the read-only "viewer" role (see api/demo/sandbox-token).
import type { Firestore } from "firebase-admin/firestore";
import { VERTICAL_TEMPLATES, type VerticalId } from "./templates";
import { VERTICAL_PITCH } from "./pitch";
import { demoSeedFor } from "./demoSeed";
import { writeDemoSeed } from "./writeDemoSeed";

const REFRESH_MS = 24 * 60 * 60 * 1000;
const SEEDING_LOCK_MS = 2 * 60 * 1000;
/** Bump to reseed every sandbox after the demo data changes shape. */
const SEED_VERSION = 2;
const SUBCOLLECTIONS = ["calls", "leads", "appointments", "crews", "jobs", "customers", "quotes", "invoices", "punches", "agentActions"];

export function sandboxBusinessId(verticalId: VerticalId): string {
  return `demo-try-${verticalId}`;
}

export function isVerticalId(value: unknown): value is VerticalId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(VERTICAL_TEMPLATES, value);
}

/** Creates or refreshes the industry's sandbox. Returns false if the id is taken by something that isn't a demo. */
export async function ensureSandboxBusiness(db: Firestore, verticalId: VerticalId, now = Date.now()): Promise<boolean> {
  const businessId = sandboxBusinessId(verticalId);
  const ref = db.collection("businesses").doc(businessId);

  // Claim the (re)seed in a transaction so two first visitors don't seed twice.
  const claim = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if (snap.exists && data?.isDemo !== true) return "refuse" as const;
    const fresh = snap.exists && data?.seedVersion === SEED_VERSION && typeof data?.seededAt === "number" && now - data.seededAt < REFRESH_MS;
    if (fresh) return "fresh" as const;
    if (typeof data?.seedingAt === "number" && now - data.seedingAt < SEEDING_LOCK_MS) return "busy" as const;
    tx.set(ref, { seedingAt: now }, { merge: true });
    return "seed" as const;
  });
  if (claim === "refuse") return false;
  if (claim !== "seed") return true;

  const t = VERTICAL_TEMPLATES[verticalId];
  const name = VERTICAL_PITCH[verticalId].demoName;
  try {
    await ref.set({
      businessId,
      businessName: name,
      industry: verticalId,
      isDemo: true,
      accountPurpose: "demo",
      active: true,
      subscriptionStatus: "active",
      timezone: "America/New_York",
      businessHours: { Monday: "08:00 - 17:00", Tuesday: "08:00 - 17:00", Wednesday: "08:00 - 17:00", Thursday: "08:00 - 17:00", Friday: "08:00 - 17:00", Saturday: "Closed", Sunday: "Closed" },
      agentName: t.agentName,
      agentIdentity: t.agentIdentity,
      agentTone: t.agentTone,
      greeting: t.greetingTemplate.replace("{businessName}", name),
      afterHoursGreeting: t.afterHoursGreetingTemplate.replace("{businessName}", name),
      approvedServices: t.approvedServices,
      approvedFaqs: t.approvedFaqs,
      emergencyRules: t.emergencyRules,
      bookingRules: t.bookingRules,
      disallowedTopics: t.disallowedTopics,
      brandColor: t.color,
      contactEmail: "hello@example.com",
      contactPhone: "+1 (555) 010-2000",
      address: "100 Demo Street, Miami, FL",
      serviceArea: "Miami",
      createdAt: now,
      updatedAt: now,
    }, { merge: true });
    for (const sub of SUBCOLLECTIONS) await db.recursiveDelete(ref.collection(sub));
    await writeDemoSeed(db, businessId, verticalId, now, demoSeedFor(verticalId, now));
    await ref.set({ seededAt: now, seedVersion: SEED_VERSION, seedingAt: null }, { merge: true });
  } catch (error) {
    await ref.set({ seedingAt: null }, { merge: true }).catch(() => {});
    throw error;
  }
  return true;
}
