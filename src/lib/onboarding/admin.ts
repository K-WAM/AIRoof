import { z } from "zod";
import type { OnboardingPortal } from "@/types/onboarding";
import { onboardingDb, portalRef, OnboardingError } from "./store";
import { hashToken, LINK_TTL, newToken } from "./link";

export const formIdSchema = z.enum(["texting", "payments", "team", "company", "documents"]);
const id = z.string().regex(/^[a-z0-9-]{1,40}$/);
const short = z.string().max(80);
const step = z.object({ id, title: short.min(1), detail: z.string().max(240), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), timeLabel: z.string().max(20).optional(), status: z.enum(["done", "current", "upcoming"]) }).strict();
const checklist = z.object({ id, group: short.min(1), title: short.min(1), detail: z.string().max(240).optional(), status: z.enum(["received", "partial", "waiting", "not_needed"]), formId: formIdSchema.optional(), sendByEmail: z.boolean().optional(), internalNote: z.string().max(500).optional() }).strict();
const editableForm = z.object({ enabled: z.boolean().optional(), status: z.enum(["not_sent", "sent", "in_progress", "submitted", "reviewed"]).optional() }).strict();
export const portalPatchSchema = z.object({
  clientName: z.string().min(1).max(120).optional(),
  steps: z.array(step).min(1).max(12).refine(a => new Set(a.map(s => s.id)).size === a.length, "Use unique step names.").optional(),
  checklist: z.array(checklist).max(60).refine(a => new Set(a.map(s => s.id)).size === a.length, "Use unique checklist names.").optional(),
  settings: z.object({ paymentsSetupFeePerCompany: z.number().finite().int().min(0).optional(), contactName: short.optional(), contactEmail: z.union([z.string().email().max(200), z.literal("")]).optional(), nextMeetingLabel: z.string().max(240).optional() }).strict().optional(),
  dataReview: z.object({ title: short, intro: z.string().max(500), sections: z.array(z.object({ heading: short, body: z.string().max(4000) }).strict()).max(20) }).strict().optional(),
  forms: z.object({ texting: editableForm.optional(), payments: editableForm.optional(), team: editableForm.optional(), company: editableForm.optional(), documents: editableForm.optional() }).strict().optional(),
}).strict();
export function applyPortalPatch(portal: OnboardingPortal, patch: z.infer<typeof portalPatchSchema>, now = Date.now()): OnboardingPortal {
  const { dataReview: _review, forms: _forms, ...rest } = patch;
  const result: OnboardingPortal = { ...portal, ...rest, forms: { ...portal.forms }, updatedAt: now };
  if (patch.steps) {
    result.steps = patch.steps.map(s => ({ ...s, ...(s.status === "done" ? { completedAt: portal.steps.find(old => old.id === s.id)?.completedAt ?? now } : {}) }));
    const newlyDone = result.steps.findIndex(s => s.status === "done" && portal.steps.find(old => old.id === s.id)?.status !== "done");
    if (newlyDone >= 0 && !result.steps.some(s => s.status === "current")) {
      const next = result.steps.find((s, i) => i > newlyDone && s.status === "upcoming");
      if (next) next.status = "current";
    }
  }
  if (patch.checklist) result.checklist = patch.checklist.map(i => ({ ...i, ...(i.status === "received" ? { receivedAt: portal.checklist.find(old => old.id === i.id)?.receivedAt ?? now } : {}) }));
  if (patch.dataReview) result.dataReview = { ...patch.dataReview, updatedAt: now };
  for (const [id, state] of Object.entries(patch.forms ?? {})) {
    const key = formIdSchema.parse(id);
    result.forms[key] = { ...portal.forms[key], ...state };
  }
  return result;
}
export async function patchPortal(businessId: string, patch: z.infer<typeof portalPatchSchema>) {
  const db = onboardingDb();
  return db.runTransaction(async tx => {
    const ref = portalRef(businessId); const doc = await tx.get(ref);
    if (!doc.exists) throw new OnboardingError("Open the portal before editing it.", 404);
    const portal = applyPortalPatch(doc.data() as OnboardingPortal, patch);
    tx.set(ref, portal); return portal;
  });
}
export type AuditActor = { uid: string; email?: string };
export function auditData(actor: AuditActor, businessId: string, action: string, targetPath: string) {
  return { actorUid: actor.uid, actorEmail: actor.email ?? "", businessId, action, targetPath, before: null, after: null, createdAt: Date.now() };
}
export async function changeLink(businessId: string, actor: AuditActor, revoke: boolean) {
  const db = onboardingDb();
  return db.runTransaction(async tx => {
    const ref = portalRef(businessId); const snap = await tx.get(ref);
    if (!snap.exists) throw new OnboardingError("Open the portal before creating a link.", 404);
    const portal = snap.data() as OnboardingPortal;
    const now = Date.now();
    const old = portal.link;
    if (old) tx.delete(db.collection("clientOnboardingLinks").doc(hashToken(old.token)));
    if (revoke) {
      if (old) portal.link = { ...old, revokedAt: now };
    } else {
      const token = newToken();
      portal.link = { token, hint: token.slice(-4), createdAt: now, expiresAt: now + LINK_TTL };
      tx.set(db.collection("clientOnboardingLinks").doc(hashToken(token)), { businessId, createdAt: now, expiresAt: now + LINK_TTL });
      for (const form of Object.values(portal.forms)) if (form.enabled && form.status === "not_sent") { form.status = "sent"; form.sentAt = now; }
    }
    portal.updatedAt = now; tx.set(ref, portal);
    const audit = db.collection("adminAuditEvents").doc();
    tx.set(audit, { auditEventId: audit.id, ...auditData(actor, businessId, revoke ? "onboarding.link_revoked" : old ? "onboarding.link_rotated" : "onboarding.link_created", ref.path) });
    return portal;
  });
}
