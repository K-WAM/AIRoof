import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { getVerticalTemplate, type VerticalId } from "@/lib/verticals/templates";
import type { CompanyModule } from "@/hooks/useBusinessModules";
import type { CompanyBootstrap } from "@/types/bootstrap";

// GET /api/company/bootstrap?businessId=
//
// One document read replacing the two separate client-Firestore reads
// useBusinessModules and useBusinessTimezone used to each make against the
// same businesses/{businessId} doc. businessId comes from the caller's own
// membership (via verifyAuthAndRole below) in the common case; ?businessId=
// is honored for a superadmin's ?preview= — the same pattern useBusinessId()
// already uses everywhere else.
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "viewer", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const snap = await db.collection("businesses").doc(businessId).get();
  if (!snap.exists) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  const d = snap.data()!;

  const industryValue = d.industry;
  const industry: VerticalId | null = (() => {
    try {
      // getVerticalTemplate falls back to roofing for an unrecognized value —
      // we want a hard null here instead, so useBusinessModules' own
      // "unknown industry keeps every module enabled" fail-open logic runs.
      return typeof industryValue === "string" && getVerticalTemplate(industryValue).verticalId === industryValue
        ? (industryValue as VerticalId)
        : null;
    } catch {
      return null;
    }
  })();
  const template = industry ? getVerticalTemplate(industry) : null;

  const statusValue = d.subscriptionStatus;
  const subscriptionStatus =
    statusValue === "paused" || statusValue === "trial" || statusValue === "active" ? statusValue : null;

  const body: CompanyBootstrap = {
    business: {
      businessId,
      businessName: typeof d.businessName === "string" ? d.businessName : "",
      industry,
      timezone: typeof d.timezone === "string" && d.timezone.length > 0 ? d.timezone : "America/New_York",
      subscriptionStatus,
      brandColor: typeof d.brandColor === "string" ? d.brandColor : null,
      logoUrl: typeof d.logoUrl === "string" ? d.logoUrl : null,
    },
    modules: {
      disabled: (template?.disabledModules ?? []) as CompanyModule[],
      calendarMode: template?.calendarMode ?? "jobs",
      family: template?.family ?? null,
    },
    serverNow: Date.now(),
  };

  return jsonWithCache(body, "semiStatic");
}
