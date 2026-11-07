import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { patchVendor } from "@/lib/vendors/store";
import { VENDOR_TEXT_FIELDS, firstIssue, normalizeVendorField, vendorPatchSchema } from "@/lib/vendors/schema";

// PATCH /api/company/vendors/[vendorId]  body: { businessId, name?, type?, address?, city?, state?, zip?, phone?,
//   contactName?, email?, website?, notes?, active? }   Owner or staff. "" clears a field. "Delete" = active: false.
// Never touches provenance: a client edit does not turn a Luxor sample into client data (remove samples instead).

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ vendorId: string }> }) {
  const { vendorId } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const businessId = typeof body.businessId === "string" ? body.businessId : "";
  if (!businessId) return jsonWithCache({ error: "businessId required" }, "noStore", { status: 400 });
  const auth = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in auth) return auth.error;

  const { businessId: _ignored, ...fields } = body;
  void _ignored;
  const parsed = vendorPatchSchema.safeParse(fields);
  if (!parsed.success) return jsonWithCache({ error: firstIssue(parsed.error) }, "noStore", { status: 400 });
  const input = parsed.data;

  const changes: Record<string, unknown> = {};
  if (input.name !== undefined) changes.name = input.name;
  if (input.active !== undefined) changes.active = input.active;
  for (const key of VENDOR_TEXT_FIELDS) {
    const value = input[key];
    if (value === undefined) continue;
    changes[key] = value ? normalizeVendorField(key, value) : FieldValue.delete();
  }
  if (Object.keys(changes).length === 0) return jsonWithCache({ error: "Nothing to update" }, "noStore", { status: 400 });

  const db = getAdminFirestore();
  if (!db) return jsonWithCache({ error: "Database unavailable" }, "noStore", { status: 503 });
  const vendor = await patchVendor(db, businessId, vendorId, changes);
  if (!vendor) return jsonWithCache({ error: "Vendor not found" }, "noStore", { status: 404 });
  return jsonWithCache({ ok: true, vendor }, "noStore");
}
