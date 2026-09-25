import type { Firestore } from "firebase-admin/firestore";

/** Allocate the tenant's human-friendly J-XXXX identifier exactly once. */
export async function nextJobId(db: Firestore, businessId: string): Promise<string> {
  const business = db.collection("businesses").doc(businessId);
  let counter = 1000;
  await db.runTransaction(async (tx) => {
    const current = (await tx.get(business)).data()?.jobCounter ?? 999;
    counter = current + 1;
    tx.update(business, { jobCounter: counter });
  });
  return `J-${counter}`;
}
