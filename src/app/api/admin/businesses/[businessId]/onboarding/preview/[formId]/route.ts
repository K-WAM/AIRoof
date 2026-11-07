import type { NextRequest } from "next/server";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { formIdSchema } from "@/lib/onboarding/admin";
import { ONBOARDING_FORMS } from "@/lib/onboarding/forms";
import { resolvePrefill } from "@/lib/onboarding/prefill";
import { portalRef, OnboardingError } from "@/lib/onboarding/store";
import { formDefinition } from "@/lib/onboarding/presentation";
import { routeError } from "@/lib/onboarding/http";
export async function GET(request: NextRequest, { params }: { params: Promise<{ businessId: string; formId: string }> }) {
  const gate = await verifySuperadmin(request); if ("error" in gate) return gate.error;
  try {
    const { businessId, formId: raw } = await params; const formId = formIdSchema.parse(raw);
    const portal = (await portalRef(businessId).get()).data();
    if (!portal) throw new OnboardingError("Open the portal first.", 404);
    return jsonWithCache({ definition: formDefinition(ONBOARDING_FORMS[formId], portal.settings?.paymentsSetupFeePerCompany), prefill: await resolvePrefill(businessId) }, "noStore");
  } catch (error) { return routeError(error); }
}
