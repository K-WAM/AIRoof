import { NextRequest } from "next/server";
import { verifyOwnBusinessRole } from "@/lib/auth/verifyRole";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { jsonWithCache } from "@/lib/http/cache";
import { DEFAULT_LETTERS, LETTER_KINDS, isLetterKind, validLetterTemplate } from "@/lib/documents/letters";
import type { LetterTemplate } from "@/types/documentTemplate";

export async function GET(req: NextRequest) {
  const gate = await verifyOwnBusinessRole(req, ["owner", "staff", "viewer"]);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return jsonWithCache({ error: "Database unavailable" }, "noStore", { status: 503 });
  const kind = req.nextUrl.searchParams.get("kind");
  if (kind && !isLetterKind(kind)) return jsonWithCache({ error: "Invalid letter kind" }, "noStore", { status: 400 });
  const collection = db.collection(`businesses/${gate.user.businessId}/documentTemplates`);
  const templates = await Promise.all((kind ? [kind] : LETTER_KINDS).map(async k => {
    const doc = await collection.doc(k).get();
    return doc.exists ? doc.data() as LetterTemplate : DEFAULT_LETTERS[k as keyof typeof DEFAULT_LETTERS];
  }));
  return jsonWithCache({ templates }, "semiStatic");
}

export async function PUT(req: NextRequest) {
  const gate = await verifyOwnBusinessRole(req, ["owner", "staff"]);
  if ("error" in gate) return gate.error;
  const body = await req.json().catch(() => null);
  if (!validLetterTemplate(body)) return jsonWithCache({ error: "Invalid letter: use a title up to 120 characters and at most 20 sections of 4,000 characters." }, "noStore", { status: 400 });
  const db = getAdminFirestore();
  if (!db) return jsonWithCache({ error: "Database unavailable" }, "noStore", { status: 503 });
  const template: LetterTemplate = { kind: body.kind, title: body.title, sections: body.sections.map(s => ({ id: s.id, body: s.body,
    ...(s.heading === undefined ? {} : { heading: s.heading }), ...(s.optional === undefined ? {} : { optional: s.optional }), ...(s.defaultOn === undefined ? {} : { defaultOn: s.defaultOn }) })),
    ...(body.signer ? { signer: { name: body.signer.name, title: body.signer.title } } : {}), updatedAt: Date.now(), updatedBy: gate.user.uid };
  await db.collection(`businesses/${gate.user.businessId}/documentTemplates`).doc(body.kind).set(template);
  return jsonWithCache({ template }, "noStore");
}
