import type { AdminAuditEvent } from "@/types";
import { NextRequest, NextResponse } from "next/server";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { jsonWithCache } from "@/lib/http/cache";
import { companiesOf } from "@/lib/companies/companies";
import { validateCompanies } from "@/lib/companies/validation";
import type { LibraryLogo } from "@/types/library";

export async function GET(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const gate = await verifySuperadmin(req);
  if ("error" in gate) return gate.error;
  const { businessId } = await params;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const [biz, library] = await Promise.all([db.collection("businesses").doc(businessId).get(), db.collection(`businesses/${businessId}/library`).doc("logos").get()]);
  if (!biz.exists) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  return jsonWithCache({ companies: companiesOf(biz.data()), logos: library.data()?.logos ?? [] }, "noStore");
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const gate = await verifySuperadmin(req);
  if ("error" in gate) return gate.error;
  const { businessId } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid company profiles" }, { status: 400 });
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const ref = db.collection("businesses").doc(businessId);
  const audit = db.collection("adminAuditEvents").doc();
  const result = await db.runTransaction(async tx => {
    const [biz, library] = await Promise.all([tx.get(ref), tx.get(db.collection(`businesses/${businessId}/library`).doc("logos"))]);
    if (!biz.exists) return { error: "Business not found", status: 404 };
    const valid = validateCompanies(body.companies, ((library.data()?.logos ?? []) as LibraryLogo[]).map(l => l.logoId));
    if (!valid.companies) return { error: valid.error, status: 400 };
    const before = companiesOf(biz.data());
    if (before.some(c => !valid.companies.some(n => n.id === c.id))) return { error: "Companies cannot be removed or their ids changed.", status: 400 };
    const now = Date.now();
    tx.update(ref, { billingCompanies: valid.companies, updatedAt: now });
    const event: AdminAuditEvent = { auditEventId: audit.id, actorUid: gate.user.uid, ...(gate.user.email ? { actorEmail: gate.user.email } : {}), businessId, action: "companies.updated", targetPath: ref.path, before, after: valid.companies, createdAt: now };
    tx.set(audit, event);
    return { companies: valid.companies };
  });
  return "error" in result ? NextResponse.json({ error: result.error }, { status: result.status }) : jsonWithCache(result, "noStore");
}
