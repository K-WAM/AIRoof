import { NextRequest, NextResponse } from "next/server";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { jsonWithCache } from "@/lib/http/cache";
import { isDemoTenant } from "@/lib/accounts/purpose";
import { LINE_CONFLICT_MESSAGE, countryOf, findLineConflicts, toE164, toPhoneLineView } from "@/lib/phoneLines/registry";
import type { BusinessPhoneNumber } from "@/types";
import type { LineAcquisition, LineCountry, PhoneLineView } from "@/types/phoneLine";

// Phase 32 (T-171, contract C-B). The phone-line registry for Luxor operators.
//   GET  /api/admin/phone-lines[?businessId=]  → { lines: PhoneLineView[] }
//   POST /api/admin/phone-lines { businessId, phoneNumber, label?, acquisition?, country? } → a new Draft line
// A Draft answers nothing: routing changes only through PATCH …/[lineId] "go_live" after a recorded test call.

export async function GET(req: NextRequest) {
  const gate = await verifySuperadmin(req);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const businessId = req.nextUrl.searchParams.get("businessId");
  if (businessId !== null && !/^[A-Za-z0-9_-]{1,128}$/.test(businessId)) {
    return NextResponse.json({ error: "Invalid businessId" }, { status: 400 });
  }
  const query = businessId
    ? db.collection("businessPhoneNumbers").where("businessId", "==", businessId)
    : db.collection("businessPhoneNumbers").limit(500);
  const snap = await query.get();
  const lines = snap.docs
    .map((doc) => toPhoneLineView(doc.id, doc.data() as Partial<BusinessPhoneNumber>, true))
    .filter((line): line is PhoneLineView => line !== null)
    .sort((a, b) => a.businessId.localeCompare(b.businessId) || a.e164.localeCompare(b.e164));
  return jsonWithCache({ lines }, "noStore");
}

export async function POST(req: NextRequest) {
  const gate = await verifySuperadmin(req);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const businessId = typeof body.businessId === "string" ? body.businessId : "";
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(businessId)) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  const e164 = toE164(body.phoneNumber);
  if (!e164) return NextResponse.json({ error: "Enter the number as a full phone number, e.g. +1 (305) 555-0100" }, { status: 400 });
  const acquisition = body.acquisition;
  if (acquisition !== undefined && !["new", "forward", "port_in"].includes(acquisition as string)) {
    return NextResponse.json({ error: "acquisition must be new, forward or port_in" }, { status: 400 });
  }
  const country = body.country;
  if (country !== undefined && country !== "US" && country !== "CA") {
    return NextResponse.json({ error: "country must be US or CA" }, { status: 400 });
  }
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 60) : "Main line";

  const business = await db.collection("businesses").doc(businessId).get();
  if (!business.exists) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const conflicts = await findLineConflicts(db, e164, businessId);
  if (conflicts.length > 0) return NextResponse.json({ error: LINE_CONFLICT_MESSAGE[conflicts[0].kind] }, { status: 409 });

  const lineId = `${businessId}-${e164.slice(1)}`;
  const ref = db.collection("businessPhoneNumbers").doc(lineId);
  const existingLines = await db.collection("businessPhoneNumbers").where("businessId", "==", businessId).get();
  if (existingLines.docs.some((doc) => toE164((doc.data() as Partial<BusinessPhoneNumber>).normalizedPhoneNumber) === e164 && doc.data().status !== "retired")) {
    return NextResponse.json({ error: "This number is already on record for this business." }, { status: 409 });
  }

  const now = Date.now();
  const line: BusinessPhoneNumber = {
    phoneNumberId: lineId,
    businessId,
    phoneNumber: e164,
    normalizedPhoneNumber: e164,
    label,
    active: false,
    status: "draft",
    purpose: isDemoTenant(businessId, business.data()) ? "demo" : "client",
    country: (country as LineCountry | undefined) ?? countryOf(e164) ?? "US",
    ...(acquisition ? { acquisition: acquisition as LineAcquisition } : {}),
    sms: {
      status: "not_configured",
      purposes: ["booking_received", "appointment_confirmed", "inspector_assigned"],
      isDefaultSender: !existingLines.docs.some((doc) => doc.data().sms?.isDefaultSender === true && doc.data().status !== "retired"),
    },
    updatedBy: gate.user.uid,
    createdAt: now,
    updatedAt: now,
  };
  const auditRef = db.collection("adminAuditEvents").doc(`audit_line_${now}_${lineId}`);
  const created = await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (current.exists && current.data()?.status !== "retired") return false;
    transaction.set(ref, line);
    transaction.set(auditRef, {
      auditEventId: auditRef.id,
      actorUid: gate.user.uid,
      actorEmail: gate.user.email ?? null,
      businessId,
      action: "phone_line.created",
      targetPath: `businessPhoneNumbers/${lineId}`,
      after: line,
      createdAt: now,
    });
    return true;
  });
  if (!created) return NextResponse.json({ error: "This number is already on record for this business." }, { status: 409 });
  return jsonWithCache({ line: toPhoneLineView(lineId, line, true) }, "noStore", { status: 201 });
}
