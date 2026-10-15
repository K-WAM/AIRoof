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
export type TrialCounter = keyof typeof TRIAL_LIMITS;
export interface RoofingTrial {
  id: string; uid: string; businessId: string; secretHash: string; name: string; companyName: string;
  email: string | null; createdAt: number; expiresAt: number; calls: number; notes: number; tools: number; corrections: number;
  conversationIds: string[]; confirmationAppointmentId?: string;
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
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!name || !companyName || name.length > 80 || companyName.length > 80 || /[\u0000-\u001f\u007f]/.test(name + companyName) ||
      (body.email !== undefined && typeof body.email !== "string") || (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))) return null;
  return { name, companyName, email: email || null };
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
  const limits = [{ key: `${day}-global`, max: 20 }, { key: `${day}-ip-${hash(ip)}`, max: 3 },
    ...(details.email ? [{ key: `${day}-email-${hash(details.email)}`, max: 2 }] : [])];
  const allowed = await db.runTransaction(async (tx) => {
    const refs = limits.map((limit) => db.collection("demoTrialBudgets").doc(limit.key));
    const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));
    if (snapshots.some((snap, i) => { const count = Number(snap.data()?.count ?? 0); return !Number.isFinite(count) || count < 0 || count >= limits[i].max; })) return false;
    refs.forEach((ref, i) => tx.set(ref, { count: Number(snapshots[i].data()?.count || 0) + 1, expiresAt: Timestamp.fromMillis(now + 2 * 86400_000) }));
    return true;
  });
  if (!allowed) return null;
  const id = randomBytes(16).toString("hex"), secret = randomBytes(32).toString("hex");
  const trial: RoofingTrial = { ...details, id, uid: `demo-trial-${id}`, businessId: `${TRIAL_PREFIX}${id}`, secretHash: hash(secret),
    createdAt: now, expiresAt: now + TRIAL_TTL_MS, calls: 0, notes: 0, tools: 0, corrections: 0, conversationIds: [] };
  await auth.createUser({ uid: trial.uid, displayName: trial.name });
  try {
    const batch = db.batch(), base = db.collection("businesses").doc(trial.businessId);
    batch.create(db.collection("demoTrials").doc(id), trial);
    batch.create(base, { ...trialConfig(trial, randomBytes(24).toString("hex")), isDemoTrial: true, demoTrialExpiresAt: trial.expiresAt,
      active: true, subscriptionStatus: "active", accountPurpose: "test", createdAt: now, jobCounter: 1001 });
    batch.create(db.collection("businessUsers").doc(trial.uid), { uid: trial.uid, businessId: trial.businessId, businessName: trial.companyName,
      email: trial.email || "", displayName: trial.name, role: "viewer", active: true, isDemoTrial: true,
      demoTrialExpiresAt: trial.expiresAt, demoTrialExpiry: Timestamp.fromMillis(trial.expiresAt), createdAt: now });
    batch.create(base.collection("jobs").doc("J-1001"), { businessId: trial.businessId, jobId: "J-1001", title: "Your Demo Roof Inspection",
      status: "inspection", clientName: trial.name, clientEmail: trial.email, address: "Book an inspection to add its address", findings: [], createdAt: now, updatedAt: now });
    batch.create(base.collection("crews").doc("demo-crew"), { businessId: trial.businessId, crewId: "demo-crew", name: "Demo Crew", active: true, createdAt: now });
    const kit = starterKitFor("roofing");
    batch.create(base.collection("library").doc("pricing"), kit ? mergeStarterKit({ materials: [], laborRates: [], documents: [] }, kit, true, "roofing", now).library : { materials: [], laborRates: [], documents: [] });
    batch.create(base.collection("library").doc("workCatalog"), { items: [] });
    batch.create(db.collection("demoProspects").doc(id), { name: trial.name, companyName: trial.companyName, email: trial.email,
      source: "roofing-self-guided-demo", businessId: trial.businessId, createdAt: now, status: "new", marketingConsent: false });
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
  const prompt = `${initiation.conversation_config_override.agent?.prompt?.prompt || ""}\n## Private browser demo\nThis is a private demonstration, not a real service order. The visitor's name is ${JSON.stringify(trial.name)}; their demo confirmation email is ${JSON.stringify(trial.email)}. Do not ask again for those supplied details. Use a fictional inspection address. There is no carrier caller ID in this browser call: never invent a phone number. No phone number is required for this browser demo: do not ask for one, and omit callbackPhone unless the visitor volunteers a number. This replaces the general callback-number collection instruction for this private demo only. Book through the real tools and use their exact result. No emergency dispatch or outbound calls are available in this demo.`;
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
