import { productsOf, type ProductSet } from "@/lib/products/products";
import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { isSmsEnabled } from "@/lib/comms/sms";
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

  // "crew" (field-only) needs the shell's industry/vocab/timezone to render the Field screen.
  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "crew", "viewer", "superadmin"]);
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
      phoneLine: (typeof d.elevenlabs?.phoneNumber === "string" && d.elevenlabs.phoneNumber)
        || (typeof d.phoneNumber === "string" && d.phoneNumber)
        || null,
      // Phase 31 (T-152): effective texting state (env SMS_ENABLED + Twilio creds + the tenant's own opt-in).
      smsEnabled: isSmsEnabled(d),
    },
    modules: {
      // Industry first (a dental office has no Jobs), then the plan (src/lib/products/products.ts). Calendar shows
      // whenever calls or jobs are on — it schedules both.
      disabled: disabledModulesFor((template?.disabledModules ?? []) as CompanyModule[], productsOf(d)),
      locked: lockedModulesFor((template?.disabledModules ?? []) as CompanyModule[], productsOf(d)),
      calendarMode: template?.calendarMode ?? "jobs",
      family: template?.family ?? null,
    },
    serverNow: Date.now(),
  };

  return jsonWithCache(body, "semiStatic");
}

/**
 * Off because the client didn't buy it — not because the industry doesn't use it. These still show, greyed with a
 * lock, so the client sees what they could add (owner, 2026-10-08). A dental office never sees a locked "Jobs".
 */
function lockedModulesFor(industryDisabled: CompanyModule[], products: ProductSet): CompanyModule[] {
  const industryHasJobs = !industryDisabled.includes("jobs");
  const out: CompanyModule[] = [];
  if (!products.calls) out.push("calls");
  if (industryHasJobs && !products.field) out.push("jobs");
  if (industryHasJobs && !products.billing) out.push("billing");
  return out;
}

function disabledModulesFor(industryDisabled: CompanyModule[], products: ProductSet): CompanyModule[] {
  const out = new Set<CompanyModule>(industryDisabled);
  if (!products.calls) out.add("calls");
  if (!products.field) out.add("jobs");
  if (!products.billing || out.has("jobs")) out.add("billing");
  return [...out];
}
