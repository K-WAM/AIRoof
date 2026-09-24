import { NextRequest } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { mergeWorkStarter, workCatalogStarterFor } from "@/lib/verticals/workCatalogStarter";
import { VERTICAL_TEMPLATES, type VerticalId } from "@/lib/verticals/templates";
import type { WorkCatalog } from "@/types/workCatalog";

// POST /api/company/work-catalog/starter { businessId }
// Idempotent starter import. The server picks the kit from the tenant's
// CURRENT industry — never from client input. Never duplicates, never re-adds
// a starter item whose id is in starterKitImported (a deleted one stays
// deleted), never overwrites tenant edits.

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
  const catalogRef = db.collection(`businesses/${businessId}/library`).doc("workCatalog");
  const outcome = await db.runTransaction(async (tx) => {
    const businessSnap = await tx.get(businessRef);
    const industry = businessSnap.data()?.industry;
    const starterItems = workCatalogStarterFor(industry);
    if (!starterItems || typeof industry !== "string") {
      return { error: "No starter catalog for this industry", status: 409 } as const;
    }
    const verticalId = industry as VerticalId;
    if (VERTICAL_TEMPLATES[verticalId].disabledModules.includes("jobs")) {
      return { error: "Jobs module is disabled for this industry", status: 403 } as const;
    }

    const snap = await tx.get(catalogRef);
    const existing: WorkCatalog = snap.exists ? (snap.data() as WorkCatalog) : { items: [] };
    const { catalog, added } = mergeWorkStarter(existing, starterItems, Date.now());
    tx.set(catalogRef, catalog, { merge: true });
    return { catalog, added };
  });

  if ("error" in outcome) return jsonWithCache({ error: outcome.error }, "noStore", { status: outcome.status });
  return jsonWithCache(outcome, "noStore");
}
