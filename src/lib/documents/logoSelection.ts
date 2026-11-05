export async function validLogoSelection(db: FirebaseFirestore.Firestore, businessId: string, value: unknown): Promise<boolean> {
  if (value === null) return true;
  if (typeof value !== "string" || value.length > 120 || !value) return false;
  const snap = await db.collection(`businesses/${businessId}/library`).doc("logos").get();
  return (snap.data()?.logos ?? []).some((logo: { logoId: string }) => logo.logoId === value);
}
