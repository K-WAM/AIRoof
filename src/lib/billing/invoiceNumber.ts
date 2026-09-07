import type { Firestore } from "firebase-admin/firestore";

/**
 * Atomically allocates the next Luxor invoice number (LX-1001, LX-1002, …).
 * Shared by the manual invoice editor (POST /api/admin/invoices) and the
 * recurring-invoices cron so both draw from the same counter — never two
 * independent sequences that could collide.
 */
export async function nextLuxorInvoiceNumber(db: Firestore): Promise<string> {
  const counterRef = db.collection("luxorMeta").doc("invoiceCounter");
  let invoiceNum = 1001;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    invoiceNum = (snap.data()?.count ?? 1000) + 1;
    tx.set(counterRef, { count: invoiceNum });
  });
  return `LX-${invoiceNum}`;
}
