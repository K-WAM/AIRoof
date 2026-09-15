// Job invoice numbering — deliberately separate from src/app/admin/invoices/invoiceFlow.ts's
// LuxorInvoice sequence. That counter is Luxor's own platform billing of a tenant; a tenant's
// invoice numbers to ITS OWN customers must never share a sequence with the platform's. Same
// transaction shape as businesses/{bid}.jobCounter (see POST /api/jobs), different field.

export async function allocateJobInvoiceNumber(
  db: FirebaseFirestore.Firestore,
  businessId: string,
): Promise<string> {
  const bizRef = db.collection("businesses").doc(businessId);
  let counter = 1000;
  await db.runTransaction(async (tx) => {
    const bizSnap = await tx.get(bizRef);
    const current: number = bizSnap.data()?.invoiceCounter ?? 999;
    counter = current + 1;
    tx.update(bizRef, { invoiceCounter: counter });
  });
  return `INV-${counter}`;
}
