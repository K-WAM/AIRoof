import type { Firestore } from "firebase-admin/firestore";
import type { StaffMember } from "@/types/staff";

// Staff directory store (T-371): businesses/{businessId}/staff/{staffId}. Server-only; routes call these after the
// central guard. Nothing here emails, texts or invites anyone.

const MAX_STAFF = 500;

const path = (businessId: string) => `businesses/${businessId}/staff`;

/** Firestore refuses undefined unless told to ignore it; strip it so a fake or a strict client behaves the same. */
function clean<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/** Active people first, then by name (case-insensitive). */
export function sortStaff(list: StaffMember[]): StaffMember[] {
  return [...list].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export async function listStaff(db: Firestore, businessId: string): Promise<StaffMember[]> {
  const snap = await db.collection(path(businessId)).limit(MAX_STAFF).get();
  return sortStaff(snap.docs.map((doc) => ({ ...(doc.data() as StaffMember), staffId: doc.id })));
}

export async function getStaff(db: Firestore, businessId: string, staffId: string): Promise<StaffMember | null> {
  const snap = await db.collection(path(businessId)).doc(staffId).get();
  return snap.exists ? { ...(snap.data() as StaffMember), staffId: snap.id } : null;
}

export async function createStaff(
  db: Firestore,
  businessId: string,
  input: Omit<StaffMember, "staffId" | "active" | "createdAt" | "updatedAt"> & { active?: boolean },
): Promise<StaffMember> {
  const ref = db.collection(path(businessId)).doc();
  const now = Date.now();
  const member: StaffMember = clean({ ...input, staffId: ref.id, active: input.active ?? true, createdAt: now, updatedAt: now }) as StaffMember;
  await ref.set(member);
  return member;
}

/** `changes` may carry FieldValue.delete() sentinels (typed loosely on purpose). Returns the stored row, or null if missing. */
export async function patchStaff(
  db: Firestore,
  businessId: string,
  staffId: string,
  changes: Record<string, unknown>,
): Promise<StaffMember | null> {
  const ref = db.collection(path(businessId)).doc(staffId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  await ref.update({ ...changes, updatedAt: Date.now() });
  const after = await ref.get();
  return { ...(after.data() as StaffMember), staffId };
}

const LIMITED_KEYS = ["staffId", "name", "position", "userType", "crewId", "crewLead", "crewProvenance", "linkedUid", "active"] as const;

/** What a non-owner may see: no email, no mobile, and only the origin of provenance (never the source/notes). */
export function limitedStaffView(member: StaffMember): Partial<StaffMember> {
  const out: Record<string, unknown> = {};
  for (const key of LIMITED_KEYS) if (member[key] !== undefined) out[key] = member[key];
  out.provenance = { origin: member.provenance?.origin };
  if (member.crewProvenance) out.crewProvenance = { origin: member.crewProvenance.origin };
  return out as Partial<StaffMember>;
}
