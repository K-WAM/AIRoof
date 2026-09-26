// Seeds the local emulators with the smoke-test world: 2 tenants + 6 accounts. Idempotent: safe to run again.
// Run standalone (emulators must be up):  node scripts/e2e/seed.mjs [--reset]
const admin = require("firebase-admin");
const { randomBytes } = require("node:crypto");
const { ACCOUNTS, AUTH_HOST, FIRESTORE_HOST, PASSWORD, PROJECT_ID, TENANTS, emulatorEnv } = require("./config.cjs");

Object.assign(process.env, emulatorEnv());
if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT_ID });
const adminApp = admin;

const ALL_DAY = Object.fromEntries(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d) => [d, "00:00 - 23:59"]));

const VERTICAL = {
  roofing: {
    approvedServices: ["Roof inspections", "Shingle and tile repair", "Metal roofing", "Emergency leak repair", "Flashing repair"],
    emergencyRules: ["Active leak while it is raining: escalate for emergency tarping", "Water near lights or outlets: escalate immediately"],
    agentName: "Roofus",
  },
  dental: {
    approvedServices: ["Cleanings and exams", "Fillings", "Whitening", "Emergency tooth pain"],
    emergencyRules: ["Severe swelling or uncontrolled bleeding: escalate immediately"],
    agentName: "Denise",
  },
};

function businessDoc(tenant) {
  const v = VERTICAL[tenant.industry];
  const now = Date.now();
  return {
    businessId: tenant.id, businessName: tenant.name, industry: tenant.industry,
    phoneNumber: tenant.phone, contactPhone: tenant.contactPhone, contactEmail: tenant.contactEmail, notificationEmail: tenant.contactEmail,
    address: tenant.address, brandColor: tenant.brandColor, logoUrl: null, websiteUrl: null,
    timezone: "America/New_York", serviceArea: ["Miami", "Coral Gables", "Doral"],
    businessHours: ALL_DAY, // always open so booking tests never depend on the clock
    approvedServices: v.approvedServices, approvedFaqs: [{ question: "Do you offer free estimates?", answer: "Yes, an inspection is free." }],
    emergencyRules: v.emergencyRules, bookingRules: ["Collect name, phone, service and address before booking"],
    disallowedTopics: ["legal advice", "medical advice"],
    escalationPhone: "+15550999", calendarProvider: "mock", planTier: "standard", aiProvider: "openai",
    liveModel: "gpt-4o-mini", backOfficeModel: "deepseek-chat",
    agentName: v.agentName, agentIdentity: "receptionist", greeting: `Thanks for calling ${tenant.name}, how can I help?`,
    agentTone: "calm, friendly, concise", temperature: 0.5, maxTokens: 150,
    voiceProvider: "elevenlabs", elevenlabs: { agentId: tenant.agentId, phoneNumber: tenant.phone },
    fieldKey: randomBytes(16).toString("hex"),
    subscriptionStatus: "active", seatLimit: 10, active: true, isE2E: true, ...(tenant.id === "demo-roofing" ? { isDemo: true } : {}), createdAt: now, updatedAt: now,
  };
}

/** Wipe every document and every Auth user in the emulators (only ever reachable on loopback ports). */
async function resetEmulators() {
  await fetch(`http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
}

async function seed({ reset = false } = {}) {
  if (reset) await resetEmulators();
  const db = admin.firestore();
  const auth = admin.auth();

  for (const tenant of Object.values(TENANTS)) {
    const ref = db.collection("businesses").doc(tenant.id);
    const existing = await ref.get();
    const doc = businessDoc(tenant);
    if (existing.exists && existing.data().fieldKey) doc.fieldKey = existing.data().fieldKey;
    await ref.set(doc);
    await db.collection("businessPhoneNumbers").doc(`${tenant.id}-main`).set({
      phoneNumberId: `${tenant.id}-main`, businessId: tenant.id, phoneNumber: tenant.phone, normalizedPhoneNumber: tenant.phone,
      label: "Main line", active: true, createdAt: Date.now(), updatedAt: Date.now(),
    });
  }

  for (const [key, account] of Object.entries(ACCOUNTS)) {
    try { await auth.deleteUser(account.uid); } catch { /* not there yet */ }
    await auth.createUser({ uid: account.uid, email: account.email, password: PASSWORD, emailVerified: true, displayName: account.displayName ?? key });
    if (account.superadmin) {
      await auth.setCustomUserClaims(account.uid, { superadmin: true });
      await db.collection("businessUsers").doc(account.uid).set({
        uid: account.uid, email: account.email, role: "superadmin", superadmin: true, businessId: TENANTS.roofing.id, businessName: TENANTS.roofing.name, active: true, updatedAt: Date.now(),
      });
      continue;
    }
    const tenant = TENANTS[account.tenant];
    await db.collection("businessUsers").doc(account.uid).set({
      uid: account.uid, businessId: tenant.id, businessName: tenant.name, email: account.email, role: account.role, active: true, lockedAt: null, lockedBy: null,
      displayName: account.displayName, ...(account.trade ? { trade: account.trade } : {}), createdAt: Date.now(),
    });
  }
  return { tenants: Object.keys(TENANTS).length, accounts: Object.keys(ACCOUNTS).length };
}

if (require.main === module) {
  seed({ reset: process.argv.includes("--reset") })
    .then((r) => { console.log(`seeded ${r.tenants} tenants, ${r.accounts} accounts`); process.exit(0); })
    .catch((e) => { console.error("seed failed:", e?.message ?? e); process.exit(1); });
}

module.exports = { adminApp, businessDoc, resetEmulators, seed };
