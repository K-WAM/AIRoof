import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import type { SetupChecklistInput } from "@/lib/onboarding/setupChecklist";

const arrayLength = (value: unknown) => (Array.isArray(value) ? value.length : 0);

// GET /api/company/setup-status?businessId=
//
// The raw inputs for the Dashboard's setup checklist (src/lib/onboarding/setupChecklist.ts decides
// what "done" means). Single doc reads and count() aggregations only — never a full collection read.
// noStore: the whole point is that it changes the moment the owner fixes an item.
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const root = db.collection("businesses").doc(businessId);
  const library = root.collection("library");
  const [business, pricing, workCatalog, logos, crews, members, calls] = await Promise.all([
    root.get(),
    library.doc("pricing").get(),
    library.doc("workCatalog").get(),
    library.doc("logos").get(),
    root.collection("crews").count().get(),
    db.collection("businessUsers").where("businessId", "==", businessId).count().get(),
    root.collection("calls").count().get(),
  ]);
  if (!business.exists) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const config = business.data() ?? {};
  const elevenlabs = (config.elevenlabs ?? {}) as { agentId?: string; phoneNumber?: string };
  const phoneNumber = elevenlabs.phoneNumber || (typeof config.phoneNumber === "string" ? config.phoneNumber : "") || null;
  const pricingData = pricing.data() ?? {};

  const body: SetupChecklistInput = {
    phoneConfigured: Boolean(elevenlabs.agentId || config.vapiAssistantId || config.vapiPhoneNumberId),
    prices: arrayLength(pricingData.materials) + arrayLength(pricingData.laborRates) + arrayLength(workCatalog.data()?.items),
    resources: crews.data().count,
    hasLogo: arrayLength(logos.data()?.logos) > 0 || (typeof config.logoUrl === "string" && config.logoUrl.length > 0),
    teamMembers: members.data().count,
    calls: calls.data().count,
    phoneNumber,
  };
  return jsonWithCache(body, "noStore");
}
