import { DEFAULT_LETTERS, validLetterTemplate } from "./letters";
import type { LetterKind, LetterTemplate } from "@/types/documentTemplate";

export async function loadLetter(db: FirebaseFirestore.Firestore, businessId: string, kind: LetterKind): Promise<LetterTemplate> {
  const snap = await db.collection(`businesses/${businessId}/documentTemplates`).doc(kind).get();
  const saved = snap.data();
  if (snap.exists && !validLetterTemplate(saved)) throw new Error("Saved letter template is invalid");
  return snap.exists ? saved as LetterTemplate : DEFAULT_LETTERS[kind];
}
