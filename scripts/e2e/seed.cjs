// Seeds the local emulators with the smoke-test world: 2 tenants + 6 accounts. Idempotent: safe to run again.
// Run standalone (emulators must be up):  node scripts/e2e/seed.cjs [--reset]  (npm run e2e:seed)
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

  /* K2 roofdoctors showcase */
  const calendarStart = Date.now();
  await db.collection("businesses").doc(TENANTS.roofing.id).collection("crews").doc("k2-crew").set({ name: "Sample crew", active: true, kind: "crew", color: "#0f766e", createdAt: calendarStart, updatedAt: calendarStart });
  await db.collection("businesses").doc(TENANTS.roofing.id).collection("appointments").doc("k2-calendar-booking").set({
    appointmentId: "k2-calendar-booking", businessId: TENANTS.roofing.id, callerName: "Casey Sample",
    callerPhone: "+15550001234", service: "Roof inspection", status: "pending",
    startTime: calendarStart, endTime: calendarStart + 3600000, createdAt: calendarStart, updatedAt: calendarStart,
  });
  const roof = db.collection("businesses").doc(TENANTS.roofing.id);
  await roof.set({ showcase: { finances: true, payroll: true } }, { merge: true });
  await roof.collection("customers").doc("C-K2").set({ customerId: "C-K2", businessId: TENANTS.roofing.id, name: "Sample Property Group", kind: "commercial", properties: [{ name: "North", address: "10 Example Way" }, { name: "South", address: "20 Example Way" }], matchKey: "sample property group|", searchTokens: ["sample"], active: true, jobCount: 0, createdAt: calendarStart, updatedAt: calendarStart });
  const batch = db.batch();
  for (let i = 0; i < 40; i++) {
    const issuedAt = calendarStart - (i * 2 + 1) * 86400000; const amount = 800 + i * 43; const paid = i % 4 === 0;
    const id = `jobba-k2-${i}`;
    batch.set(roof.collection("invoiceHistory").doc(id), { id, source: "jobba", sourceInvoiceId: `SAMPLE-${i}`, issuedAt, workName: i % 2 ? "Maintenance" : "Repair", billTo: `Sample Customer ${i % 8 + 1}`, amount, tax: 0, credits: 0, amountDue: paid ? 0 : amount, ...(paid ? { paidAt: issuedAt + 86400000 } : {}), voided: false, status: paid ? "Paid" : "Open", importedAt: calendarStart });
  }
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(calendarStart));
  const today = Date.parse(`${todayKey}T12:00:00Z`);
  for (let i = 0; i < 7; i++) {
    const day = new Date(today - i * 86400000); const dayKey = day.toISOString().slice(0, 10);
    for (const [suffix, type, hour] of [["in", "office_in", 14], ["out", "office_out", 21]]) {
      const at = Date.parse(`${dayKey}T${hour}:00:00Z`); const punchId = `k2-${dayKey}-${suffix}`;
      batch.set(roof.collection("punches").doc(punchId), { punchId, businessId: TENANTS.roofing.id, workerKey: "name:sample worker", workerName: "Sample Worker", type, at, dayKey, source: "field-app", createdAt: at });
    }
  }
  await batch.commit();
  /* K2 roofdoctors showcase */

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

  /* K5 role accounts */
  // The role test tenant: seat limit, the three showcase modules, and the evaluation email guard (everything
  // except the owner's address is skipped in the captured outbox). The e2e seed had no crew-link example of its
  // own, so the crew document below copies the demo seed's shape (writeDemoSeed.ts: crewId in the crew doc,
  // members linked by a crewId field on their businessUsers doc).
  const prosBusinessId = TENANTS.pros.id;
  await db.collection("businesses").doc(prosBusinessId).update({
    seatLimit: 15,
    showcase: { finances: true, payroll: true, payments: true },
    outboundEmailAllowlist: ["owner@roofpros.e2e.test"],
  });
  const prosCrewId = "crew_e2e_roofpros_field";
  await db.collection("businesses").doc(prosBusinessId).collection("crews").doc(prosCrewId).set({
    crewId: prosCrewId, businessId: prosBusinessId, name: "Pros Field Crew", color: "#0f766e",
    active: true, kind: "crew", createdAt: Date.now(),
  });
  for (const uid of [ACCOUNTS.proForeman.uid, ACCOUNTS.proTechnician.uid, ACCOUNTS.proInspector.uid]) {
    await db.collection("businessUsers").doc(uid).update({ crewId: prosCrewId });
  }
  /* end K5 */

  return { tenants: Object.keys(TENANTS).length, accounts: Object.keys(ACCOUNTS).length };
}

if (require.main === module) {
  seed({ reset: process.argv.includes("--reset") })
    .then((r) => { console.log(`seeded ${r.tenants} tenants, ${r.accounts} accounts`); process.exit(0); })
    .catch((e) => { console.error("seed failed:", e?.message ?? e); process.exit(1); });
}

module.exports = { adminApp, businessDoc, resetEmulators, seed };
