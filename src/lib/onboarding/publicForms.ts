import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonWithCache } from "@/lib/http/cache";
import type { OnboardingPortal, OnboardingSubmission, OnboardingLinkRecord } from "@/types/onboarding";
import { formIdSchema } from "./admin";
import { claimWrite, cookieLink, validRecord } from "./link";
import { onboardingDb, OnboardingError, portalRef, submissionRef } from "./store";
import { resolvePrefill } from "./prefill";
import { ONBOARDING_FORMS } from "./forms";
import { initialAnswers, validateAnswers } from "./validate";
import { maskAnswers } from "./mask";
import { formDefinition } from "./presentation";
import { readBody, sameOrigin } from "./http";
import { notifySubmission } from "./notify";

export async function readForm(request: NextRequest, raw: string) {
  const link = await cookieLink(request); const formId = formIdSchema.parse(raw);
  if (!link.portal.forms[formId].enabled) throw new OnboardingError("This form isn't available. Return to your portal.", 404);
  const prefill = await resolvePrefill(link.record.businessId);
  const submission = await onboardingDb().runTransaction(async tx => {
    const [currentLink, portalSnap, doc] = await Promise.all([tx.get(link.ref), tx.get(portalRef(link.record.businessId)), tx.get(submissionRef(link.record.businessId, formId))]);
    if (!validRecord(currentLink.data() as OnboardingLinkRecord | undefined)) throw new OnboardingError("Open your client link again.", 401);
    const portal = portalSnap.data() as OnboardingPortal;
    if (!portal.forms[formId].enabled) throw new OnboardingError("This form isn't available.", 404);
    if (!portal.forms[formId].firstOpenedAt) {
      const state = portal.forms[formId];
      portal.forms[formId] = { ...state, firstOpenedAt: Date.now(), status: state.status === "submitted" || state.status === "reviewed" ? state.status : "in_progress" };
      tx.set(portalRef(portal.businessId), { ...portal, updatedAt: Date.now() });
    }
    return doc.data() as OnboardingSubmission | undefined;
  });
  const definition = formDefinition(ONBOARDING_FORMS[formId], link.portal.settings.paymentsSetupFeePerCompany);
  return jsonWithCache({ definition, prefill, answers: maskAnswers(definition, initialAnswers(definition, prefill, submission?.answers)), state: submission?.state ?? "draft", revision: submission?.revision ?? 0 }, "noStore");
}
export async function writeForm(request: NextRequest, raw: string, submit: boolean) {
  const link = await cookieLink(request);
  sameOrigin(request);
  const formId = formIdSchema.parse(raw);
  if (!link.portal.forms[formId].enabled) throw new OnboardingError("This form isn't available.", 404);
  await claimWrite(link.hash);
  const body = z.object({ answers: z.record(z.string(), z.unknown()), revision: z.number().int().min(0) }).strict().parse(await readBody(request));
  const prefill = await resolvePrefill(link.record.businessId);
  const definition = ONBOARDING_FORMS[formId];
  const result = await onboardingDb().runTransaction(async tx => {
    const pRef = portalRef(link.record.businessId); const sRef = submissionRef(link.record.businessId, formId);
    const [currentLink, portalSnap, doc] = await Promise.all([tx.get(link.ref), tx.get(pRef), tx.get(sRef)]);
    if (!validRecord(currentLink.data() as OnboardingLinkRecord | undefined)) throw new OnboardingError("Open your client link again.", 401);
    const portal = portalSnap.data() as OnboardingPortal;
    if (!portal.forms[formId].enabled) throw new OnboardingError("This form isn't available.", 404);
    const saved = doc.data() as OnboardingSubmission | undefined;
    if (body.revision !== (saved?.revision ?? 0)) throw new OnboardingError("This form changed in another tab. Reload to see the latest answers before editing.", 409);
    const validation = validateAnswers(definition, body.answers, submit ? "submit" : "draft", prefill, saved?.answers);
    if (!validation.valid) return { errors: validation.errors };
    const now = Date.now();
    const submission: OnboardingSubmission = {
      businessId: portal.businessId, formId, answers: validation.answers, revision: body.revision + 1,
      state: submit ? "submitted" : "draft", updatedAt: now,
      ...(saved?.submittedAt ? { submittedAt: saved.submittedAt, submittedBy: saved.submittedBy } : {}),
      ...(submit ? { submittedAt: now, submittedBy: String(validation.answers.submittedBy) } : {}),
    };
    tx.set(sRef, submission);
    const { reviewedAt: _reviewed, ...state } = portal.forms[formId];
    portal.forms[formId] = { ...state, status: submit ? "submitted" : "in_progress", ...(submit ? { submittedAt: now, submittedBy: submission.submittedBy } : {}) };
    tx.set(pRef, { ...portal, updatedAt: now });
    return { submission, notify: submit && !saved?.submittedAt, clientName: portal.clientName };
  });
  if ("errors" in result) return jsonWithCache({ error: "Check the marked answers before continuing.", errors: result.errors }, "noStore", { status: 400 });
  if (result.notify) await notifySubmission(link.record.businessId, result.clientName, definition.title);
  return jsonWithCache({ answers: maskAnswers(definition, result.submission.answers), revision: result.submission.revision, state: result.submission.state }, "noStore");
}
