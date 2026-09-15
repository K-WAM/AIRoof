import type { Firestore } from "firebase-admin/firestore";
import type { Customer, CustomerKind } from "@/types/customer";
import { buildMatchKey, buildSearchTokens } from "./search";

export interface ResolveCustomerInput {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  kind?: CustomerKind;
}

/**
 * Find-or-create a customer by matchKey (normalized name + phone-last-7).
 * The one place "is this the same customer" is decided — shared by
 * POST /api/company/customers/resolve (the job-create form's non-blocking
 * background call) and scripts/backfill-customers.mjs (which groups
 * existing jobs the same way), so the two paths can never disagree about
 * what counts as a duplicate.
 *
 * `lastJobAt` is seeded to `now` at creation (not left undefined) — Firestore
 * excludes a doc from an `orderBy("lastJobAt")` query entirely if the field
 * is missing, which would silently drop brand-new customers from the "most
 * recently active" ordering the slim list and token-search fallback both use.
 */
export async function resolveCustomer(
  db: Firestore,
  businessId: string,
  input: ResolveCustomerInput
): Promise<{ customerId: string; created: boolean }> {
  const name = input.name.trim();
  if (!name) throw new Error("name required");
  const matchKey = buildMatchKey({ name, phone: input.phone });

  const bizRef = db.collection("businesses").doc(businessId);
  const customersRef = bizRef.collection("customers");

  const existing = await customersRef.where("matchKey", "==", matchKey).limit(1).get();
  if (!existing.empty) {
    return { customerId: existing.docs[0].id, created: false };
  }

  // Same short-ID counter pattern POST /api/jobs uses (businesses/{id}.jobCounter).
  let counter = 999;
  await db.runTransaction(async (tx) => {
    const bizSnap = await tx.get(bizRef);
    counter = (bizSnap.data()?.customerCounter ?? 999) + 1;
    tx.update(bizRef, { customerCounter: counter });
  });

  const customerId = `C-${counter}`;
  const now = Date.now();
  const customer: Customer = {
    customerId,
    businessId,
    name,
    kind: input.kind ?? "residential",
    ...(input.phone ? { phone: input.phone } : {}),
    ...(input.email ? { email: input.email } : {}),
    ...(input.address ? { address: input.address } : {}),
    jobCount: 0,
    lastJobAt: now,
    matchKey,
    searchTokens: buildSearchTokens({ name, phone: input.phone, address: input.address }),
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  await customersRef.doc(customerId).set(customer);
  return { customerId, created: true };
}

/**
 * Bumps a customer's job rollups — called wherever a job actually gets
 * linked. A plain read-then-write, not FieldValue.increment: jobCount is
 * documented on the type as "never source of truth" (recomputable from a
 * jobs query), so the small race window under concurrent job creation for
 * the same customer is an acceptable trade for keeping this — and its tests
 * — simple. Silently no-ops if the customer doc doesn't exist (defensive;
 * every call site already guarantees it does).
 */
export async function bumpCustomerJobStats(
  db: Firestore,
  businessId: string,
  customerId: string,
  jobCreatedAt: number
): Promise<void> {
  const ref = db.collection("businesses").doc(businessId).collection("customers").doc(customerId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const current = (snap.data()?.jobCount as number | undefined) ?? 0;
  await ref.update({
    jobCount: current + 1,
    lastJobAt: jobCreatedAt,
    updatedAt: Date.now(),
  });
}
