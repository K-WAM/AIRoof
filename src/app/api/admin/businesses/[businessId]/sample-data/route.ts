import { NextRequest } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { applySampleRemoval, planSampleRemoval, scanSampleData } from "@/lib/sampleData/scan";

// GET    /api/admin/businesses/[businessId]/sample-data   counts per collection: client data, Luxor samples, not marked
// DELETE /api/admin/businesses/[businessId]/sample-data   removes the Luxor samples. DRY RUN unless ?apply=1&confirm=<businessId>:
//        the dry run lists what would go and writes nothing. Records marked "client" or not marked are never touched.
// Superadmin only. One adminAuditEvents row per applied removal.

export async function GET(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const gate = await verifySuperadmin(req);
  if ("error" in gate) return gate.error;
  const { businessId } = await params;
  const db = getAdminFirestore();
  if (!db) return jsonWithCache({ error: "Firestore not available" }, "noStore", { status: 503 });
  if (!(await db.collection("businesses").doc(businessId).get()).exists) {
    return jsonWithCache({ error: `Business ${businessId} not found` }, "noStore", { status: 404 });
  }
  return jsonWithCache({ businessId, ...(await scanSampleData(db, businessId)) }, "noStore");
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const gate = await verifySuperadmin(req);
  if ("error" in gate) return gate.error;
  const { businessId } = await params;
  const db = getAdminFirestore();
  if (!db) return jsonWithCache({ error: "Firestore not available" }, "noStore", { status: 503 });
  if (!(await db.collection("businesses").doc(businessId).get()).exists) {
    return jsonWithCache({ error: `Business ${businessId} not found` }, "noStore", { status: 404 });
  }

  const apply = req.nextUrl.searchParams.get("apply") === "1";
  if (!apply) {
    return jsonWithCache({ businessId, dryRun: true, plan: await planSampleRemoval(db, businessId) }, "noStore");
  }
  if (req.nextUrl.searchParams.get("confirm") !== businessId) {
    return jsonWithCache({ error: "Type the business id to confirm (confirm=<businessId>)." }, "noStore", { status: 400 });
  }

  const before = await scanSampleData(db, businessId);
  const result = await applySampleRemoval(db, businessId);
  const now = Date.now();
  const auditRef = db.collection("adminAuditEvents").doc(`audit_${now}`);
  await auditRef.set({
    auditEventId: auditRef.id,
    actorUid: gate.user.uid,
    ...(gate.user.email ? { actorEmail: gate.user.email } : {}),
    businessId,
    action: "sample_data.removed",
    targetPath: `businesses/${businessId}`,
    before: { samples: Object.fromEntries(before.rows.map((row) => [row.collection, row.sample])), staffCrewSamples: before.staffCrewSamples },
    after: result,
    createdAt: now,
  });
  return jsonWithCache({ businessId, dryRun: false, ...result }, "noStore");
}
