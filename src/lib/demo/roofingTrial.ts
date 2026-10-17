import { buildTrialPrompt } from "./trialPrompt";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { VERTICAL_TEMPLATES } from "@/lib/verticals/templates";
import { buildInitiationResponse } from "@/lib/voice/elevenlabs/initiationConfig";
import { persistElevenLabsConversation } from "@/lib/voice/elevenlabs/conversationRecords";
import { isE2EHarness } from "@/lib/e2e/harness";
import { mintFieldExchangeToken } from "@/lib/auth/verifyRole";
import { starterKitFor, mergeStarterKit } from "@/lib/verticals/starterKits";
import type { BusinessConfig } from "@/types";

export const TRIAL_COOKIE = "luxor_roofing_demo";
export const TRIAL_PREFIX = "demo-trial-roofing-";
export const TRIAL_TTL_MS = 60 * 60_000;
export const TRIAL_LIMITS = { calls: 2, notes: 3, tools: 24, corrections: 6 } as const;
export const DEMO_DAILY_LIMIT = 20;
export const DEMO_MONTHLY_LIMIT = 300;
export type TrialCounter = keyof typeof TRIAL_LIMITS;
export interface RoofingTrial {
  id: string; uid: string; businessId: string; secretHash: string; name: string; companyName: string;
  email: string | null; createdAt: number; expiresAt: number; calls: number; notes: number; tools: number; corrections: number;
  conversationIds: string[]; confirmationAppointmentId?: string; phoneCodeHash?: string; phoneCodesIssued?: number;
  /** Optional phone given at setup (lead contact only — never used for calls or texts). */
  phone?: string | null;
  /** While in the future, a call to the shared demo line joins this trial (no code). Set by the page's heartbeat. */
  phoneArmedUntil?: number;
  /** A visitor who asked to be reached keeps their demo data this long (owner, 2026-10-16: 7 days). */
  keepUntil?: number;
  /** When a shared-line phone call joined this trial (no code). */
  phoneCallAt?: number;
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function isTrialBusiness(id: string): boolean { return /^demo-trial-roofing-[a-f0-9]{32}$/.test(id); }
export function signedCallIdentity(signedUrl: unknown, agentId: string): { signedUrl: string; conversationId: string } | null {
  if (typeof signedUrl !== "string") return null;
  try {
    const url = new URL(signedUrl), conversationId = url.searchParams.get("conversation_id");
    if (url.protocol !== "wss:" || url.hostname !== "api.elevenlabs.io" || url.pathname !== "/v1/convai/conversation" ||
        url.searchParams.get("agent_id") !== agentId || !url.searchParams.get("conversation_signature") || !conversationId || !/^conv_[a-z0-9_]{8,150}$/.test(conversationId)) return null;
    return { signedUrl, conversationId };
  } catch { return null; }
}
export function validTrialDetails(body: Record<string, unknown>) {
  // Owner (2026-10-16): business name is the only required field; the caller gives their name to Alice on the call.
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body.phone === "string" ? normalizeDemoPhone(body.phone) : null;
  if (!companyName || name.length > 80 || companyName.length > 80 || /[\u0000-\u001f\u007f]/.test(name + companyName) ||
      (body.name !== undefined && typeof body.name !== "string") ||
      (body.email !== undefined && typeof body.email !== "string") || (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) ||
      (body.phone !== undefined && body.phone !== "" && !phone)) return null;
  return { name, companyName, email: email || null, phone };
}
/** Digits with an optional leading +, 7–15 digits; anything else is not a phone number. */
export function normalizeDemoPhone(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 30 || !/^[+\d\s().-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? (trimmed.startsWith("+") ? `+${digits}` : digits) : null;
}
export function trialConfig(trial: Pick<RoofingTrial, "businessId" | "companyName" | "name" | "expiresAt">, fieldKey: string): BusinessConfig {
  const t = VERTICAL_TEMPLATES.roofing;
  return { businessId: trial.businessId, businessName: trial.companyName, industry: "roofing", contactName: trial.name,
    serviceArea: ["South Florida"], timezone: "America/New_York",
    businessHours: { Monday: "08:00 - 17:00", Tuesday: "08:00 - 17:00", Wednesday: "08:00 - 17:00", Thursday: "08:00 - 17:00", Friday: "08:00 - 17:00", Saturday: "Closed", Sunday: "Closed" },
    approvedServices: t.approvedServices, approvedFaqs: t.approvedFaqs, emergencyRules: t.emergencyRules, bookingRules: t.bookingRules,
    disallowedTopics: t.disallowedTopics, agentName: "Alice", agentIdentity: t.agentIdentity, agentTone: t.agentTone,
    greeting: `Thanks for calling ${trial.companyName}, this is Alice. How can I help?`,
    fieldKey, voiceProvider: "elevenlabs", brandColor: "#0f766e", contactEmail: "connect@luxordev.com", isDemo: true,
    active: true, createdAt: Date.now(), updatedAt: Date.now(),
  };
}
export async function readTrial(request: NextRequest): Promise<RoofingTrial | null> {
  const parts = request.cookies.get(TRIAL_COOKIE)?.value.split(".");
  if (!parts || parts.length !== 2 || !/^[a-f0-9]{32}$/.test(parts[0]) || !/^[a-f0-9]{64}$/.test(parts[1])) return null;
  const db = getAdminFirestore();
  if (!db) return null;
  const data = (await db.collection("demoTrials").doc(parts[0]).get()).data() as RoofingTrial | undefined;
  if (!data || data.id !== parts[0] || data.businessId !== `${TRIAL_PREFIX}${data.id}` || !Number.isFinite(data.expiresAt) || data.expiresAt <= Date.now() || !/^[a-f0-9]{64}$/.test(data.secretHash)) return null;
  return timingSafeEqual(Buffer.from(data.secretHash, "hex"), Buffer.from(hash(parts[1]), "hex")) ? data : null;
}
export async function consumeTrialBudget(businessId: string, counter: TrialCounter): Promise<NextResponse | null> {
  if (!businessId.startsWith(TRIAL_PREFIX)) return null;
  const db = getAdminFirestore();
  if (!db || !isTrialBusiness(businessId)) return NextResponse.json({ error: "Demo unavailable" }, { status: 403 });
  const ref = db.collection("demoTrials").doc(businessId.slice(TRIAL_PREFIX.length));
  const ok = await db.runTransaction(async (tx) => {
    const trial = (await tx.get(ref)).data() as RoofingTrial | undefined;
    if (!trial || trial.businessId !== businessId || !Number.isFinite(trial.expiresAt) || trial.expiresAt <= Date.now()) return false;
    const count = Number(trial[counter]);
    if (!Number.isFinite(count) || count < 0 || count >= TRIAL_LIMITS[counter]) return false;
    tx.update(ref, { [counter]: count + 1 });
    return true;
  });
  return ok ? null : NextResponse.json({ error: "This demo has reached its limit or expired. Contact connect@luxordev.com for a guided demo." }, { status: 429 });
}
export async function createTrial(request: NextRequest, details: NonNullable<ReturnType<typeof validTrialDetails>>) {
  const db = getAdminFirestore(), auth = getAdminAuth();
  if (!db || !auth) throw new Error("Demo unavailable");
  const now = Date.now(), day = new Date(now).toISOString().slice(0, 10);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
  // Cost guard (owner, 2026-10-16): each demo is at most 2 calls × 3 min (≈ $0.60 of ElevenLabs at $0.10/min), so
  // 20/day caps the worst day near $12 and 300/month near $180. The monthly key outlives the daily cleanup.
  const month = day.slice(0, 7);
  const limits = [{ key: `${day}-global`, max: DEMO_DAILY_LIMIT, ttl: 2 }, { key: `${month}-global-month`, max: DEMO_MONTHLY_LIMIT, ttl: 40 },
    { key: `${day}-ip-${hash(ip)}`, max: 3, ttl: 2 },
    ...(details.email ? [{ key: `${day}-email-${hash(details.email)}`, max: 2, ttl: 2 }] : [])];
  const allowed = await db.runTransaction(async (tx) => {
    const refs = limits.map((limit) => db.collection("demoTrialBudgets").doc(limit.key));
    const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));
    if (snapshots.some((snap, i) => { const count = Number(snap.data()?.count ?? 0); return !Number.isFinite(count) || count < 0 || count >= limits[i].max; })) return false;
    refs.forEach((ref, i) => tx.set(ref, { count: Number(snapshots[i].data()?.count || 0) + 1, expiresAt: Timestamp.fromMillis(now + limits[i].ttl * 86400_000) }));
    return true;
  });
  if (!allowed) return null;
  const id = randomBytes(16).toString("hex"), secret = randomBytes(32).toString("hex");
  const trial: RoofingTrial = { ...details, id, uid: `demo-trial-${id}`, businessId: `${TRIAL_PREFIX}${id}`, secretHash: hash(secret),
    createdAt: now, expiresAt: now + TRIAL_TTL_MS, calls: 0, notes: 0, tools: 0, corrections: 0, conversationIds: [] };
  await auth.createUser({ uid: trial.uid, displayName: trial.name || trial.companyName });
  try {
    const batch = db.batch(), base = db.collection("businesses").doc(trial.businessId);
    batch.create(db.collection("demoTrials").doc(id), trial);
    batch.create(base, { ...trialConfig(trial, randomBytes(24).toString("hex")), isDemoTrial: true, demoTrialExpiresAt: trial.expiresAt,
      active: true, subscriptionStatus: "active", accountPurpose: "test", createdAt: now, jobCounter: 1001 });
    batch.create(db.collection("businessUsers").doc(trial.uid), { uid: trial.uid, businessId: trial.businessId, businessName: trial.companyName,
      email: trial.email || "", displayName: trial.name || trial.companyName, role: "viewer", active: true, isDemoTrial: true,
      demoTrialExpiresAt: trial.expiresAt, demoTrialExpiry: Timestamp.fromMillis(trial.expiresAt), createdAt: now });
    batch.create(base.collection("jobs").doc("J-1001"), { businessId: trial.businessId, jobId: "J-1001", title: "Your Demo Roof Inspection",
      status: "inspection", clientName: trial.name, clientEmail: trial.email, address: "Book an inspection to add its address", findings: [], createdAt: now, updatedAt: now });
    batch.create(base.collection("crews").doc("demo-crew"), { businessId: trial.businessId, crewId: "demo-crew", name: "Demo Crew", active: true, createdAt: now });
    const kit = starterKitFor("roofing");
    batch.create(base.collection("library").doc("pricing"), kit ? mergeStarterKit({ materials: [], laborRates: [], documents: [] }, kit, true, "roofing", now).library : { materials: [], laborRates: [], documents: [] });
    batch.create(base.collection("library").doc("workCatalog"), { items: [] });
    batch.create(db.collection("demoProspects").doc(id), { name: trial.name, companyName: trial.companyName, email: trial.email,
      phone: trial.phone ?? null, source: "self-led-demo", businessId: trial.businessId, createdAt: now, status: "new", marketingConsent: false });
    await batch.commit();
  } catch (error) { await auth.deleteUser(trial.uid); throw error; }
  return { trial, cookie: `${id}.${secret}` };
}
export async function startTrialCall(trial: RoofingTrial) {
  const limited = await consumeTrialBudget(trial.businessId, "calls");
  if (limited) return limited;
  let signedUrl: string, conversationId: string;
  if (isE2EHarness()) {
    conversationId = `conv_e2e_${randomBytes(8).toString("hex")}`;
    // Browser specs intercept this exact invalid agent/signature at the WebSocket boundary.
    // The complete harness guard above prevents this fixture from running on Vercel.
    signedUrl = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=e2e-never-live&conversation_signature=e2e-fixture&conversation_id=${conversationId}`;
  } else {
    const agentId = process.env.DEMO_TRIAL_AGENT_ID, key = process.env.ELEVENLABS_API_KEY;
    if (!agentId || !key) return NextResponse.json({ error: "Browser calling is not ready. Contact connect@luxordev.com." }, { status: 503 });
    const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}&include_conversation_id=true`, {
      headers: { "xi-api-key": key }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
    if (!response.ok) return NextResponse.json({ error: "Could not connect the receptionist. Please try again." }, { status: 503 });
    const data = await response.json();
    const identity = signedCallIdentity(data.signed_url, agentId);
    if (!identity) throw new Error("Invalid browser call response");
    ({ signedUrl, conversationId } = identity);
  }
  const db = getAdminFirestore()!;
  const config = (await db.collection("businesses").doc(trial.businessId).get()).data() as BusinessConfig;
  const initiation = buildInitiationResponse(config, undefined);
  const prompt = buildTrialPrompt(config, trial);
  await persistElevenLabsConversation({ businessId: trial.businessId, conversationId, agentId: process.env.DEMO_TRIAL_AGENT_ID,
    expiresAt: Math.min(trial.expiresAt, Date.now() + 10 * 60_000) });
  const trialRef = db.collection("demoTrials").doc(trial.id);
  await db.runTransaction(async (tx) => {
    const latest = (await tx.get(trialRef)).data() as RoofingTrial;
    tx.update(trialRef, { conversationIds: [...new Set([...latest.conversationIds, conversationId])] });
  });
  await db.collection("businesses").doc(trial.businessId).collection("calls").doc(`call_elevenlabs_${conversationId}`).set({
    businessId: trial.businessId, callId: `call_elevenlabs_${conversationId}`, status: "in_progress", startedAt: Date.now(), provider: "elevenlabs",
    callerPhone: null, elevenLabsConversationId: conversationId });
  return NextResponse.json({ signedUrl, conversationId, prompt, firstMessage: initiation.conversation_config_override.agent?.first_message,
    dynamicVariables: initiation.dynamic_variables, maxSeconds: 180 });
}

export async function activeTrialForBusiness(businessId: string): Promise<RoofingTrial | null> {
  if (!isTrialBusiness(businessId)) return null;
  const data = (await getAdminFirestore()!.collection("demoTrials").doc(businessId.slice(TRIAL_PREFIX.length)).get()).data() as RoofingTrial | undefined;
  return data?.businessId === businessId && data.expiresAt > Date.now() ? data : null;
}
export async function trialFieldGrant(trial: RoofingTrial) {
  const db = getAdminFirestore()!;
  const data = (await db.collection("businesses").doc(trial.businessId).get()).data();
  if (data?.isDemoTrial !== true || data.demoTrialExpiresAt <= Date.now()) return NextResponse.json({ error: "Demo expired" }, { status: 403 });
  const grant = mintFieldExchangeToken(trial.businessId, data.fieldKey, "J-1001");
  return NextResponse.json({ url: `/api/field/exchange?grant=${encodeURIComponent(grant.token)}` });
}

// ── Self-led demo (docs/SELF-LED-DEMO-PLAN.md) ────────────────────────────────────────────────────────────────────
/** A page on the Call step re-arms every 15 s; tapping "Or dial" arms longer because the phone app hides the page. */
export const PHONE_ARM_MS = 45_000;
export const PHONE_DIAL_ARM_MS = 120_000;

/** Lets the next call to the shared demo line join this trial without a code (owner decision D3, 2026-10-16). */
export async function armTrialPhone(trial: RoofingTrial, dial: boolean, now = Date.now()): Promise<boolean> {
  const db = getAdminFirestore()!;
  const ref = db.collection("demoTrials").doc(trial.id);
  const until = Math.min(trial.expiresAt, now + (dial ? PHONE_DIAL_ARM_MS : PHONE_ARM_MS));
  return db.runTransaction(async (tx) => {
    const latest = (await tx.get(ref)).data() as RoofingTrial | undefined;
    if (!latest || latest.expiresAt <= now || !(latest.calls < TRIAL_LIMITS.calls)) return false;
    if ((latest.phoneArmedUntil ?? 0) < until) tx.update(ref, { phoneArmedUntil: until });
    return true;
  });
}

/** What the demo page shows live: the booking the call made (if any) and whether a phone call joined. */
export async function trialLiveState(trial: RoofingTrial) {
  const base = getAdminFirestore()!.collection("businesses").doc(trial.businessId);
  const job = (await base.collection("jobs").doc("J-1001").get()).data();
  const appointmentId = typeof job?.sourceAppointmentId === "string" ? job.sourceAppointmentId : null;
  const appointment = appointmentId ? (await base.collection("appointments").doc(appointmentId).get()).data() : undefined;
  return {
    booked: Boolean(appointment),
    callerName: typeof appointment?.callerName === "string" ? appointment.callerName : null,
    startTime: typeof appointment?.startTime === "string" || typeof appointment?.startTime === "number" ? appointment.startTime : null,
    address: typeof appointment?.address === "string" ? appointment.address : null,
    serviceType: typeof appointment?.serviceType === "string" ? appointment.serviceType : null,
    phoneCallAt: typeof trial.phoneCallAt === "number" ? trial.phoneCallAt : null,
  };
}

export const REACH_KEEP_MS = 7 * 86400_000;
const LUXOR_INBOX = "connect@luxordev.com";

/** "Have us reach you": stores the contact, keeps the demo 7 days and emails Luxor at once. */
export async function requestTrialReach(trial: RoofingTrial, raw: unknown, now = Date.now()) {
  const text = typeof raw === "string" ? raw.trim() : "";
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) && text.length <= 254 ? text.toLowerCase() : null;
  const contact = email ?? normalizeDemoPhone(text);
  if (!contact) return null;
  const db = getAdminFirestore()!;
  const live = await trialLiveState(trial);
  await db.collection("demoProspects").doc(trial.id).set({ reachContact: contact, reachRequestedAt: now, status: "wants-contact" }, { merge: true });
  await db.collection("demoTrials").doc(trial.id).update({ keepUntil: now + REACH_KEEP_MS });
  const { escapeHtml } = await import("@/lib/documents/letterhead");
  const { sendWithLedger } = await import("@/lib/comms/send");
  const rows = [["Business", trial.companyName], ["Reach them at", contact], ["Setup email", trial.email ?? "—"], ["Setup phone", trial.phone ?? "—"],
    ["Caller on the demo", live.callerName ?? "—"], ["Booked", live.booked ? `${live.serviceType ?? "Visit"} · ${live.startTime ?? ""} · ${live.address ?? ""}` : "No booking"]];
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px"><p><strong>A demo visitor wants to be reached.</strong> Their demo is kept for 7 days.</p><table>${
    rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#5f6f85">${escapeHtml(k)}</td><td style="padding:4px 0">${escapeHtml(String(v))}</td></tr>`).join("")
  }</table><p style="color:#5f6f85">Hub → Demo → Demo Enquiries lists every demo.</p></div>`;
  const delivered = await sendWithLedger({ firestore: db, businessId: trial.businessId, to: LUXOR_INBOX, subject: `Demo lead: ${trial.companyName} wants to be reached`,
    html, messageType: "demo-reach-request", entityId: trial.id, entityRef: { collection: "demoProspects", id: trial.id } });
  return { delivered };
}
