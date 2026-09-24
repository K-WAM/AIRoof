export async function allocateJobQuoteNumber(db: FirebaseFirestore.Firestore, businessId: string): Promise<string> {
  const bizRef = db.collection("businesses").doc(businessId);
  let counter = 1000;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(bizRef);
    counter = (snap.data()?.quoteCounter ?? 999) + 1;
    tx.update(bizRef, { quoteCounter: counter });
  });
  return `Q-${counter}`;
}
