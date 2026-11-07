import type { NextRequest } from "next/server";
import { z } from "zod";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { auditData, formIdSchema } from "@/lib/onboarding/admin";
import { onboardingDb, OnboardingError, portalRef, submissionRef } from "@/lib/onboarding/store";
import { ONBOARDING_FORMS } from "@/lib/onboarding/forms";
import { maskAnswers } from "@/lib/onboarding/mask";
import { readBody, routeError } from "@/lib/onboarding/http";
import type { OnboardingPortal, OnboardingSubmission } from "@/types/onboarding";
type Context = { params: Promise<{ businessId: string; formId: string }> };
export async function GET(request: NextRequest, { params }: Context) {
  const gate = await verifySuperadmin(request); if ("error" in gate) return gate.error;
  try {
    const { businessId, formId: raw } = await params; const formId = formIdSchema.parse(raw);
    const submission = (await submissionRef(businessId, formId).get()).data() as OnboardingSubmission | undefined;
    if (!submission) throw new OnboardingError("No answers have been saved yet.", 404);
    const reveal = request.nextUrl.searchParams.get("reveal") === "ein";
    if (reveal) {
      const ref = onboardingDb().collection("adminAuditEvents").doc();
      await ref.set({ auditEventId: ref.id, ...auditData(gate.user, businessId, "onboarding.reveal_ein", submissionRef(businessId, formId).path) });
    }
    return jsonWithCache({ submission: { ...submission, answers: reveal ? submission.answers : maskAnswers(ONBOARDING_FORMS[formId], submission.answers) } }, "noStore");
  } catch (error) { return routeError(error); }
}
export async function PATCH(request: NextRequest, { params }: Context) {
  const gate = await verifySuperadmin(request); if ("error" in gate) return gate.error;
  try {
    z.object({ status: z.literal("reviewed") }).strict().parse(await readBody(request));
    const { businessId, formId: raw } = await params; const formId = formIdSchema.parse(raw);
    await onboardingDb().runTransaction(async tx => {
      const ref = portalRef(businessId); const [doc, answer] = await Promise.all([tx.get(ref), tx.get(submissionRef(businessId, formId))]);
      if (!doc.exists || !answer.exists || answer.data()?.state !== "submitted") throw new OnboardingError("The client needs to submit this form first.", 409);
      const portal = doc.data() as OnboardingPortal;
      portal.forms[formId] = { ...portal.forms[formId], status: "reviewed", reviewedAt: Date.now() };
      tx.set(ref, { ...portal, updatedAt: Date.now() });
    });
    return jsonWithCache({ success: true }, "noStore");
  } catch (error) { return routeError(error); }
}
