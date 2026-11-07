import type { Firestore } from "firebase-admin/firestore";
import type { Vendor } from "@/types/vendor";

// Vendors store (T-370): businesses/{businessId}/vendors/{vendorId}. Server-only. Nothing here contacts a vendor.

const MAX_VENDORS = 1000;
const path = (businessId: string) => `businesses/${businessId}/vendors`;

function clean<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/** Active first, then by name (case-insensitive). */
export function sortVendors(list: Vendor[]): Vendor[] {
  return [...list].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export async function listVendors(db: Firestore, businessId: string): Promise<Vendor[]> {
  const snap = await db.collection(path(businessId)).limit(MAX_VENDORS).get();
  return sortVendors(snap.docs.map((doc) => ({ ...(doc.data() as Vendor), vendorId: doc.id })));
}

export async function createVendor(
  db: Firestore,
  businessId: string,
  input: Omit<Vendor, "vendorId" | "active" | "createdAt" | "updatedAt">,
): Promise<Vendor> {
  const ref = db.collection(path(businessId)).doc();
  const now = Date.now();
  const vendor = clean({ ...input, vendorId: ref.id, active: true, createdAt: now, updatedAt: now }) as Vendor;
  await ref.set(vendor);
  return vendor;
}

/** `changes` may carry FieldValue.delete() sentinels. Returns the stored row, or null when it does not exist. */
export async function patchVendor(
  db: Firestore,
  businessId: string,
  vendorId: string,
  changes: Record<string, unknown>,
): Promise<Vendor | null> {
  const ref = db.collection(path(businessId)).doc(vendorId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  await ref.update({ ...changes, updatedAt: Date.now() });
  const after = await ref.get();
  return { ...(after.data() as Vendor), vendorId };
}
