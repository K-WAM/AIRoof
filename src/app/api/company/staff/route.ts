import { NextRequest } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { createStaff, limitedStaffView, listStaff } from "@/lib/staff/store";
import { firstIssue, normalizeMobile, staffCreateSchema } from "@/lib/staff/schema";
import type { StaffMember } from "@/types/staff";

// GET  /api/company/staff?businessId=   everyone who works here, with or without a login (T-371).
//   Owner (and the platform admin) get every field; staff and view-only get names, titles, crew and login link only.
// POST /api/company/staff               owner adds a person. Never emails, texts or invites them.

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return jsonWithCache({ error: "businessId required" }, "noStore", { status: 400 });
  const auth = await verifyAuthAndRole(req, businessId, ["owner", "staff", "viewer", "superadmin"]);
  if ("error" in auth) return auth.error;
  const db = getAdminFirestore();
  if (!db) return jsonWithCache({ error: "Database unavailable" }, "noStore", { status: 503 });

  const full = auth.user.superadmin || auth.user.role === "owner";
  const staff = await listStaff(db, businessId);
  return jsonWithCache({ staff: full ? staff : staff.map(limitedStaffView) }, "volatile");
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const businessId = typeof body.businessId === "string" ? body.businessId : "";
  if (!businessId) return jsonWithCache({ error: "businessId required" }, "noStore", { status: 400 });
  const auth = await verifyAuthAndRole(req, businessId, ["owner", "superadmin"]);
  if ("error" in auth) return auth.error;

  const { businessId: _ignored, ...fields } = body;
  void _ignored;
  const parsed = staffCreateSchema.safeParse(fields);
  if (!parsed.success) return jsonWithCache({ error: firstIssue(parsed.error) }, "noStore", { status: 400 });
  const input = parsed.data;

  const db = getAdminFirestore();
  if (!db) return jsonWithCache({ error: "Database unavailable" }, "noStore", { status: 503 });

  if (input.crewId) {
    const crew = await db.collection(`businesses/${businessId}/crews`).doc(input.crewId).get();
    if (!crew.exists) return jsonWithCache({ error: "That crew doesn't exist" }, "noStore", { status: 400 });
  }

  const now = Date.now();
  const provenance = { origin: "client" as const, source: "app:team", addedAt: now };
  const member = await createStaff(db, businessId, {
    name: input.name,
    ...(input.position ? { position: input.position } : {}),
    ...(input.userType ? { userType: input.userType as StaffMember["userType"] } : {}),
    ...(input.email ? { email: input.email } : {}),
    ...(input.mobile ? { mobile: normalizeMobile(input.mobile) } : {}),
    ...(input.language ? { language: input.language } : {}),
    ...(input.crewId ? { crewId: input.crewId, crewProvenance: provenance } : {}),
    provenance,
  });
  return jsonWithCache({ ok: true, staff: member }, "noStore", { status: 201 });
}
