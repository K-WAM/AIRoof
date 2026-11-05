import { NextRequest, NextResponse } from "next/server";
import { verifyOwnBusinessRole } from "@/lib/auth/verifyRole";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { companiesOf, isMultiCompany } from "@/lib/companies/companies";
import { patchCompanyProfiles, validateCompanies } from "@/lib/companies/validation";
import { jsonWithCache } from "@/lib/http/cache";
import type { LibraryLogo } from "@/types/library";

export async function GET(req: NextRequest) {
  const gate = await verifyOwnBusinessRole(req, ["owner", "staff"]);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const biz = await db.collection("businesses").doc(gate.user.businessId!).get();
  if (!biz.exists) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  return jsonWithCache({ companies: isMultiCompany(biz.data()) ? companiesOf(biz.data()) : [] }, "semiStatic");
}

export async function PATCH(req: NextRequest) {
  const gate = await verifyOwnBusinessRole(req, ["owner"]);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid company profiles" }, { status: 400 });
  const businessId = gate.user.businessId!;
  const ref = db.collection("businesses").doc(businessId);
  const result = await db.runTransaction(async tx => {
    const [biz, library] = await Promise.all([tx.get(ref), tx.get(db.collection(`businesses/${businessId}/library`).doc("logos"))]);
    if (!biz.exists || !isMultiCompany(biz.data())) return { error: "Companies are not enabled.", status: 409 };
    const before = companiesOf(biz.data());
    const next = patchCompanyProfiles(before, body.companies);
    if (!next) return { error: "Only company contact, logo and payment details can be edited here.", status: 400 };
    const valid = validateCompanies(next, ((library.data()?.logos ?? []) as LibraryLogo[]).map(l => l.logoId));
    if (!valid.companies) return { error: valid.error, status: 400 };
    const now = Date.now();
    tx.update(ref, { billingCompanies: valid.companies, updatedAt: now });
    const audit = ref.collection("auditEvents").doc();
    tx.set(audit, { action: "companies.updated", actorUid: gate.user.uid, businessId, before, after: valid.companies, createdAt: now });
    return { companies: valid.companies };
  });
  return "error" in result ? NextResponse.json({ error: result.error }, { status: result.status }) : jsonWithCache(result, "noStore");
}
