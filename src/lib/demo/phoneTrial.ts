import { createHmac, randomInt } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { elevenLabsConversationDocId, ELEVENLABS_CONVERSATIONS_COLLECTION, ELEVENLABS_CONVERSATION_TTL_MS } from "@/lib/voice/elevenlabs/conversationRecords";
import { buildTrialPrompt } from "./trialPrompt";
import { isTrialBusiness, TRIAL_LIMITS, TRIAL_PREFIX, type RoofingTrial } from "./roofingTrial";
import type { BusinessConfig } from "@/types";

export const PHONE_CODE_TTL_MS = 5 * 60_000;
const MAX_CODES = 3;
const MAX_ATTEMPTS = 5;
export const PHONE_DEMO_BUSINESS = "demo-roofing";
const REFUSAL = { result: "NOT CONNECTED: That demo code could not be verified. Check the four digits on the page or get a new code. No private demo has been opened." };

function codeHash(code: string): string {
  const key = process.env.ELEVENLABS_TOOL_SECRET;
  if (!key) throw new Error("Phone demo is not configured");
  return createHmac("sha256", key).update(`private-phone-demo:${code}`).digest("hex");
}
function normalizeCode(value: unknown): string | null {
  if (typeof value !== "string" || !/^[\d -]{4,12}$/.test(value)) return null;
  const digits = value.replace(/[ -]/g, "");
  return /^\d{4}$/.test(digits) ? digits : null;
}
function activeTrial(trial: RoofingTrial | undefined, config: Record<string, unknown> | undefined, now: number): trial is RoofingTrial {
  return Boolean(trial && isTrialBusiness(trial.businessId) && trial.businessId === `${TRIAL_PREFIX}${trial.id}` &&
    Number.isFinite(trial.expiresAt) && trial.expiresAt > now && config?.isDemo === true && config.isDemoTrial === true &&
    typeof config.demoTrialExpiresAt === "number" && config.demoTrialExpiresAt > now);
}

/** Requires the existing HttpOnly private session; never selected using a caller/model business ID. */
export async function issuePhoneCode(trial: RoofingTrial, now = Date.now()) {
  const db = getAdminFirestore()!;
  const trialRef = db.collection("demoTrials").doc(trial.id);
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = String(randomInt(10_000)).padStart(4, "0"), digest = codeHash(code);
    const codeRef = db.collection("demoTrialBudgets").doc(`phone-code-${digest}`);
    const outcome = await db.runTransaction(async (tx) => {
      const [snapshot, business, collision] = await Promise.all([tx.get(trialRef), tx.get(db.collection("businesses").doc(trial.businessId)), tx.get(codeRef)]);
      const latest = snapshot.data() as RoofingTrial | undefined;
      if (!activeTrial(latest, business.data(), now) || latest.businessId !== trial.businessId) return { error: "This demo has expired. Start a new demo." };
      const issued = latest.phoneCodesIssued ?? 0;
      if (!Number.isInteger(issued) || issued < 0 || issued >= MAX_CODES || !Number.isInteger(latest.calls) || latest.calls < 0 || latest.calls >= TRIAL_LIMITS.calls) return { error: "This demo has reached its phone-code or call limit. Use your existing demo or contact Luxor." };
      // Four digits (owner, 2026-10-15): one use, five-minute life, five tries per call. An expired code's slot is free again.
      if (collision.exists && Number(collision.data()?.expiresAtMs) > now) return null;
      const expiresAt = Math.min(now + PHONE_CODE_TTL_MS, latest.expiresAt);
      tx.set(codeRef, { kind: "phone-demo-code", trialId: trial.id, businessId: trial.businessId, createdAt: now, expiresAtMs: expiresAt, expiresAt: Timestamp.fromMillis(expiresAt) });
      tx.update(trialRef, { phoneCodeHash: digest, phoneCodesIssued: issued + 1 });
      return { code, expiresAt };
    });
    if (outcome) return outcome;
  }
  return { error: "Could not prepare a phone code. Please try again." };
}

/** A model may present only the short code; the authenticated stored carrier conversation supplies all identity. */
export async function connectPhoneTrial(conversationId: string, input: unknown, now = Date.now()) {
  const db = getAdminFirestore()!;
  const conversationRef = db.collection(ELEVENLABS_CONVERSATIONS_COLLECTION).doc(elevenLabsConversationDocId(conversationId));
  const code = normalizeCode(input), digest = code ? codeHash(code) : null;
  const codeRef = digest ? db.collection("demoTrialBudgets").doc(`phone-code-${digest}`) : null;
  const connected = await db.runTransaction(async (tx) => {
    const conversation = (await tx.get(conversationRef)).data();
    if (!conversation || !(conversation.expiresAt?.toMillis?.() > now)) return null;
    const privateRetry = isTrialBusiness(String(conversation.businessId));
    if (!privateRetry && (conversation.businessId !== PHONE_DEMO_BUSINESS || !conversation.callSid || !conversation.calledNumber || conversation.phoneDemoJoinLocked === true)) return null;
    const attempts = conversation.phoneDemoAttempts ?? 0;
    if (!Number.isInteger(attempts) || attempts < 0 || attempts >= MAX_ATTEMPTS) return null;
    const record = codeRef ? (await tx.get(codeRef)).data() : undefined;
    const trialRef = typeof record?.trialId === "string" && /^[a-f0-9]{32}$/.test(record.trialId) ? db.collection("demoTrials").doc(record.trialId) : null;
    const trial = trialRef ? (await tx.get(trialRef)).data() as RoofingTrial | undefined : undefined;
    const config = trial && isTrialBusiness(trial.businessId) ? (await tx.get(db.collection("businesses").doc(trial.businessId))).data() : undefined;
    const source = (await tx.get(db.collection("businesses").doc(PHONE_DEMO_BUSINESS))).data();
    const valid = codeRef && record?.kind === "phone-demo-code" && record.expiresAtMs > now && trialRef && activeTrial(trial, config, now) &&
      record.businessId === trial.businessId && trial.phoneCodeHash === digest && source?.isDemo === true &&
      typeof conversation.agentId === "string" && Boolean(conversation.agentId) && source.elevenlabs?.agentId === conversation.agentId;
    if (!valid || (record.usedByConversationId && record.usedByConversationId !== conversationId) ||
        (privateRetry && (record.usedByConversationId !== conversationId || conversation.businessId !== trial.businessId))) {
      tx.update(conversationRef, { phoneDemoAttempts: attempts + 1 });
      return null;
    }
    if (record.usedByConversationId === conversationId) return { trial, config: config as unknown as BusinessConfig };
    if (!Number.isInteger(trial.calls) || trial.calls < 0 || trial.calls >= TRIAL_LIMITS.calls || !Array.isArray(trial.conversationIds)) {
      tx.update(conversationRef, { phoneDemoAttempts: attempts + 1 }); return null;
    }
    tx.update(codeRef, { usedByConversationId: conversationId, usedAt: now });
    tx.update(trialRef, { calls: trial.calls + 1, conversationIds: [...new Set([...trial.conversationIds, conversationId])] });
    tx.update(conversationRef, { businessId: trial.businessId, phoneDemoSourceBusinessId: PHONE_DEMO_BUSINESS, phoneDemoJoinedAt: now,
      toolExpiresAt: Math.min(trial.expiresAt, now + 10 * 60_000), expiresAt: Timestamp.fromMillis(now + ELEVENLABS_CONVERSATION_TTL_MS) });
    tx.set(db.collection("businesses").doc(trial.businessId).collection("calls").doc(`call_elevenlabs_${conversationId}`), {
      businessId: trial.businessId, callId: `call_elevenlabs_${conversationId}`, callerPhone: conversation.callerPhone || null,
      calledNumber: conversation.calledNumber, provider: "elevenlabs", providerIds: { elevenLabsConversationId: conversationId },
      status: "in_progress", startedAt: conversation.createdAt || now, demoPhone: true, updatedAt: now,
    }, { merge: true });
    tx.set(db.collection("businesses").doc(PHONE_DEMO_BUSINESS).collection("calls").doc(`call_elevenlabs_${conversationId}`), {
      status: "ended", endedAt: now, updatedAt: now, demoPhoneHandoff: true, summary: "Caller continued in a private demo.",
    }, { merge: true });
    return { trial, config: config as unknown as BusinessConfig };
  });
  if (!connected) return REFUSAL;
  return {
    result: "CONNECTED: The caller's private roofing demo is now active. Use only the trusted setup details below for the rest of this call. The shared intake checklist no longer applies.",
    sayToCaller: `You\u2019re connected to ${connected.trial.companyName} for your private demo.`,
    businessName: connected.trial.companyName, callerName: connected.trial.name, confirmationEmail: connected.trial.email,
    instructions: buildTrialPrompt(connected.config, connected.trial, new Date(now), "phone"),
  };
}

/** Serialize joining against a shared-demo write so one provider call cannot write into both businesses. */
export async function lockSharedPhoneDemo(conversationId: string): Promise<boolean> {
  const db = getAdminFirestore()!;
  const ref = db.collection(ELEVENLABS_CONVERSATIONS_COLLECTION).doc(elevenLabsConversationDocId(conversationId));
  return db.runTransaction(async (tx) => {
    const stored = (await tx.get(ref)).data();
    if (!stored || stored.businessId !== PHONE_DEMO_BUSINESS) return false;
    tx.update(ref, { phoneDemoJoinLocked: true });
    return true;
  });
}

/**
 * No-code phone join (owner decision D3, 2026-10-16): a call to the shared demo line joins the demo page that is open
 * on its Call step (newest arm wins; tapping "Or dial" arms longest). Runs in the initiation webhook, before the
 * greeting, so Alice answers with that business name. Bounded by the short arm window, one join per arm and the
 * trial's two-call cap. Returns null when no page is waiting — the caller gets the ordinary shared demo.
 */
export async function claimArmedTrial(conversationId: string, callerPhone: string | undefined, now = Date.now()) {
  const db = getAdminFirestore()!;
  const candidates = await db.collection("demoTrials").where("phoneArmedUntil", ">", now).orderBy("phoneArmedUntil", "desc").limit(3).get();
  const conversationRef = db.collection(ELEVENLABS_CONVERSATIONS_COLLECTION).doc(elevenLabsConversationDocId(conversationId));
  for (const candidate of candidates.docs) {
    const claimed = await db.runTransaction(async (tx) => {
      const trialRef = candidate.ref;
      const trial = (await tx.get(trialRef)).data() as RoofingTrial | undefined;
      const config = trial && isTrialBusiness(trial.businessId) ? (await tx.get(db.collection("businesses").doc(trial.businessId))).data() : undefined;
      const conversation = (await tx.get(conversationRef)).data();
      if (!activeTrial(trial, config, now) || !(Number(trial.phoneArmedUntil) > now) || !Number.isInteger(trial.calls) || trial.calls >= TRIAL_LIMITS.calls ||
          !Array.isArray(trial.conversationIds) || conversation?.businessId !== PHONE_DEMO_BUSINESS) return null;
      tx.update(trialRef, { calls: trial.calls + 1, conversationIds: [...new Set([...trial.conversationIds, conversationId])], phoneArmedUntil: 0, phoneCallAt: now });
      tx.update(conversationRef, { businessId: trial.businessId, phoneDemoSourceBusinessId: PHONE_DEMO_BUSINESS, phoneDemoJoinedAt: now,
        toolExpiresAt: Math.min(trial.expiresAt, now + 10 * 60_000), expiresAt: Timestamp.fromMillis(now + ELEVENLABS_CONVERSATION_TTL_MS) });
      if (callerPhone) tx.set(db.collection("demoProspects").doc(trial.id), { callerPhone }, { merge: true });
      return { trial: { ...trial, calls: trial.calls + 1, conversationIds: [...trial.conversationIds, conversationId] }, config: config as unknown as BusinessConfig };
    });
    if (claimed) return claimed;
  }
  return null;
}
