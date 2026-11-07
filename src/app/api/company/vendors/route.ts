import { NextRequest } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { createVendor, listVendors } from "@/lib/vendors/store";
import { VENDOR_TEXT_FIELDS, firstIssue, normalizeVendorField, vendorCreateSchema } from "@/lib/vendors/schema";
import type { Vendor } from "@/types/vendor";

// GET  /api/company/vendors?businessId=   the manufacturers/suppliers a business works with (owner, staff, view-only).
// POST /api/company/vendors               owner or staff adds one. Nothing is ever sent to a vendor from the app.

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return jsonWithCache({ error: "businessId required" }, "noStore", { status: 400 });
  const auth = await verifyAuthAndRole(req, businessId, ["owner", "staff", "viewer", "superadmin"]);
  if ("error" in auth) return auth.error;
  const db = getAdminFirestore();
  if (!db) return jsonWithCache({ error: "Database unavailable" }, "noStore", { status: 503 });
  return jsonWithCache({ vendors: await listVendors(db, businessId) }, "volatile");
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const businessId = typeof body.businessId === "string" ? body.businessId : "";
  if (!businessId) return jsonWithCache({ error: "businessId required" }, "noStore", { status: 400 });
  const auth = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in auth) return auth.error;

  const { businessId: _ignored, ...fields } = body;
  void _ignored;
  const parsed = vendorCreateSchema.safeParse(fields);
  if (!parsed.success) return jsonWithCache({ error: firstIssue(parsed.error) }, "noStore", { status: 400 });
  const input = parsed.data;

  const db = getAdminFirestore();
  if (!db) return jsonWithCache({ error: "Database unavailable" }, "noStore", { status: 503 });

  const extras: Partial<Vendor> = {};
  for (const key of VENDOR_TEXT_FIELDS) {
    const value = input[key];
    if (value) (extras as Record<string, string>)[key] = normalizeVendorField(key, value);
  }
  const vendor = await createVendor(db, businessId, {
    name: input.name,
    ...extras,
    provenance: { origin: "client", source: "app:library", addedAt: Date.now() },
  });
  return jsonWithCache({ ok: true, vendor }, "noStore", { status: 201 });
}
