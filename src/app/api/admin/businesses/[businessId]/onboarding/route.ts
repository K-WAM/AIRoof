import type { NextRequest } from "next/server";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { getOrCreatePortal, portalRef, submissionRef } from "@/lib/onboarding/store";
import { patchPortal, portalPatchSchema } from "@/lib/onboarding/admin";
import { readBody, routeError } from "@/lib/onboarding/http";
import { ONBOARDING_FORM_IDS } from "@/types/onboarding";

type Context = { params: Promise<{ businessId: string }> };
export async function GET(request: NextRequest, { params }: Context) {
  const gate = await verifySuperadmin(request); if ("error" in gate) return gate.error;
  try {
    const { businessId } = await params;
    if (request.nextUrl.searchParams.get("summary") === "1") return jsonWithCache({ portal: (await portalRef(businessId).get()).data() ?? null }, "noStore");
    const portal = await getOrCreatePortal(businessId);
    const rows = await Promise.all(ONBOARDING_FORM_IDS.map(async id => {
      const doc = await submissionRef(businessId, id).get(); const data = doc.data();
      return [id, data ? { state: data.state, updatedAt: data.updatedAt, submittedAt: data.submittedAt, submittedBy: data.submittedBy } : null];
    }));
    return jsonWithCache({ portal, submissions: Object.fromEntries(rows) }, "noStore");
  } catch (error) { return routeError(error); }
}
export async function PATCH(request: NextRequest, { params }: Context) {
  const gate = await verifySuperadmin(request); if ("error" in gate) return gate.error;
  try {
    const { businessId } = await params;
    const portal = await patchPortal(businessId, portalPatchSchema.parse(await readBody(request)));
    return jsonWithCache({ portal }, "noStore");
  } catch (error) { return routeError(error); }
}
