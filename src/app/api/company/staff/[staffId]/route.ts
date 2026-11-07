import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { patchStaff } from "@/lib/staff/store";
import { firstIssue, normalizeMobile, staffPatchSchema } from "@/lib/staff/schema";

// PATCH /api/company/staff/[staffId]  body: { businessId, position?, userType?, email?, mobile?, language?, crewId?, active? }
// Owner only. "" (or null) clears an optional field. Setting crewId (an existing crew, or "" for none) records that an
// owner confirmed it: crewProvenance becomes client data, so a guessed crew stops being tagged "Example". Never touches
// provenance or linkedUid. A crew change also drops crewLead (the lead flag belonged to the old crew).

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ staffId: string }> }) {
  const { staffId } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const businessId = typeof body.businessId === "string" ? body.businessId : "";
  if (!businessId) return jsonWithCache({ error: "businessId required" }, "noStore", { status: 400 });
  const auth = await verifyAuthAndRole(req, businessId, ["owner", "superadmin"]);
  if ("error" in auth) return auth.error;

  const { businessId: _ignored, ...fields } = body;
  void _ignored;
  const parsed = staffPatchSchema.safeParse(fields);
  if (!parsed.success) return jsonWithCache({ error: firstIssue(parsed.error) }, "noStore", { status: 400 });
  const input = parsed.data;
  if (Object.keys(input).length === 0) return jsonWithCache({ error: "Nothing to update" }, "noStore", { status: 400 });

  const db = getAdminFirestore();
  if (!db) return jsonWithCache({ error: "Database unavailable" }, "noStore", { status: 503 });

  const changes: Record<string, unknown> = {};
  const set = (key: string, value: string | null | undefined, map: (v: string) => string = (v) => v) => {
    if (value === undefined) return;
    changes[key] = value ? map(value) : FieldValue.delete();
  };
  set("position", input.position);
  set("email", input.email);
  set("mobile", input.mobile, normalizeMobile);
  set("language", input.language);
  if (input.userType !== undefined) changes.userType = input.userType;
  if (input.active !== undefined) changes.active = input.active;

  if (input.crewId !== undefined) {
    const crewId = input.crewId ?? "";
    if (crewId) {
      const crew = await db.collection(`businesses/${businessId}/crews`).doc(crewId).get();
      if (!crew.exists) return jsonWithCache({ error: "That crew doesn't exist" }, "noStore", { status: 400 });
      changes.crewId = crewId;
      changes.crewProvenance = { origin: "client", source: "app:team", addedAt: Date.now() };
    } else {
      changes.crewId = FieldValue.delete();
      changes.crewProvenance = FieldValue.delete();
    }
    changes.crewLead = FieldValue.delete();
  }

  const staff = await patchStaff(db, businessId, staffId, changes);
  if (!staff) return jsonWithCache({ error: "Person not found" }, "noStore", { status: 404 });
  return jsonWithCache({ ok: true, staff }, "noStore");
}
