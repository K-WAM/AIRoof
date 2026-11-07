import { getAdminFirestore } from "@/lib/firebase/admin";
import type { OnboardingPortal } from "@/types/onboarding";
import { portalDefaults } from "./defaults";

export class OnboardingError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function onboardingDb() {
  const db = getAdminFirestore();
  if (!db) throw new OnboardingError("The portal is temporarily unavailable. Try again shortly.", 503);
  return db;
}
export function portalRef(businessId: string) { return onboardingDb().collection("clientOnboarding").doc(businessId); }
export function submissionRef(businessId: string, formId: string) { return onboardingDb().collection("clientOnboardingForms").doc(`${businessId}__${formId}`); }
export async function getOrCreatePortal(businessId: string): Promise<OnboardingPortal> {
  const db = onboardingDb();
  return db.runTransaction(async tx => {
    const business = await tx.get(db.collection("businesses").doc(businessId));
    if (!business.exists) throw new OnboardingError("Client not found.", 404);
    const ref = portalRef(businessId);
    const snap = await tx.get(ref);
    if (snap.exists) return snap.data() as OnboardingPortal;
    const portal = portalDefaults(businessId, business.data()!.businessName);
    tx.set(ref, portal);
    return portal;
  });
}
