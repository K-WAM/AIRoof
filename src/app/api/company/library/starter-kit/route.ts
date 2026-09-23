import { NextRequest } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { mergeStarterKit, starterKitFor, type StarterLibrary } from "@/lib/verticals/starterKits";
import { VERTICAL_TEMPLATES, type VerticalId } from "@/lib/verticals/templates";

// POST /api/company/library/starter-kit { businessId }
// The server chooses the kit from the tenant's current industry, never from client input.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const businessId = typeof body?.businessId === "string" ? body.businessId.trim() : "";
  if (!businessId) return jsonWithCache({ error: "businessId required" }, "noStore", { status: 400 });

  const auth = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in auth) {
    auth.error.headers.set("Cache-Control", "no-store");
    return auth.error;
  }

  const db = getAdminFirestore();
  if (!db) return jsonWithCache({ error: "Database unavailable" }, "noStore", { status: 503 });

  const businessRef = db.collection("businesses").doc(businessId);
  const pricingRef = db.collection(`businesses/${businessId}/library`).doc("pricing");
  const outcome = await db.runTransaction(async (tx) => {
    const businessSnap = await tx.get(businessRef);
    const industry = businessSnap.data()?.industry;
    const kit = starterKitFor(industry);
    if (!kit || typeof industry !== "string") return { error: "No starter kit for this industry", status: 409 } as const;
    const verticalId = industry as VerticalId;
    const disabled = VERTICAL_TEMPLATES[verticalId].disabledModules;
    if (disabled.includes("library")) return { error: "Library is disabled for this industry", status: 403 } as const;

    const snap = await tx.get(pricingRef);
    const existing: StarterLibrary = snap.exists
      ? (snap.data() as StarterLibrary)
      : { materials: [], laborRates: [], documents: [] };
    const { library, added } = mergeStarterKit(existing, kit, !disabled.includes("pricing"), verticalId, Date.now());
    tx.set(pricingRef, library, { merge: true });
    return { library, added };
  });

  if ("error" in outcome) return jsonWithCache({ error: outcome.error }, "noStore", { status: outcome.status });
  return jsonWithCache(outcome, "noStore");
}
