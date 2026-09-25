import type { Firestore, Transaction } from "firebase-admin/firestore";

/** Allocate a job id from an existing transaction. */
export async function nextJobIdInTransaction(tx: Transaction, business: FirebaseFirestore.DocumentReference): Promise<string> {
  const current = (await tx.get(business)).data()?.jobCounter ?? 999;
  const counter = current + 1;
  tx.update(business, { jobCounter: counter });
  return `J-${counter}`;
}

/** Allocate the tenant's human-friendly J-XXXX identifier exactly once. */
export async function nextJobId(db: Firestore, businessId: string): Promise<string> {
  const business = db.collection("businesses").doc(businessId);
  return db.runTransaction((tx) => nextJobIdInTransaction(tx, business));
}
