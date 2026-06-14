// Plain ESM seed script — no TypeScript, no path aliases
// Run with: node scripts/seed-demo-property-management.mjs

import admin from "firebase-admin";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = join(__dirname, "..", "firebase-service-account.json");
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf-8"));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const BUSINESS_ID = "demo-property-management";
const now = Date.now();

const business = {
  businessId: BUSINESS_ID,
  businessName: "Harbor Property Mgmt Demo",
  industry: "property-management",
  phoneNumber: null,
  serviceArea: ["Miami", "Brickell", "Wynwood", "Edgewater", "Downtown Miami"],
  timezone: "America/New_York",
  businessHours: {
    Monday: "09:00 - 17:00",
    Tuesday: "09:00 - 17:00",
    Wednesday: "09:00 - 17:00",
    Thursday: "09:00 - 17:00",
    Friday: "09:00 - 17:00",
    Saturday: "Closed",
    Sunday: "Closed",
  },
  approvedServices: [
    "Maintenance request intake",
    "Tenant onboarding scheduling",
    "Move-in and move-out coordination",
    "Work order follow-up",
    "Owner inquiry routing",
    "After-hours emergency escalation",
  ],
  approvedFaqs: [
    {
      question: "How do I submit a maintenance request?",
      answer: "You can submit a request right here with me, or through the tenant portal. I'll log everything and make sure it reaches the right team.",
    },
    {
      question: "What counts as a maintenance emergency?",
      answer: "Flooding, gas leaks, fire, no heat in winter, or a broken entry lock are all emergencies. Tell me what's happening and I'll escalate immediately.",
    },
    {
      question: "I have a question about my rent payment.",
      answer: "Rent payment questions go to the accounting team. Let me take your name and number and have someone call you back.",
    },
  ],
  emergencyRules: [
    "If caller reports flooding, gas leak, fire, or no heat in winter: escalate immediately",
    "If caller reports a broken entry lock or security breach: escalate immediately",
    "If caller mentions a medical emergency on the property: advise calling 911 first, then escalate",
  ],
  bookingRules: [
    "Log unit number, tenant name, and issue description for every maintenance request",
    "Owner inquiries require callback scheduling — do not share financial data verbally",
    "After-hours emergency calls go directly to the on-call manager",
  ],
  disallowedTopics: [
    "lease legal advice",
    "rent negotiation",
    "eviction procedures",
    "financial statements",
  ],
  escalationPhone: "+13055550004",
  notificationEmail: "kwamwad@gmail.com",
  calendarProvider: "mock",
  planTier: "standard",
  aiProvider: "openai",
  liveModel: "gpt-4o-mini",
  backOfficeModel: "deepseek-chat",
  agentName: "Val",
  agentIdentity: "receptionist",
  greeting: "Thanks for calling Harbor Property Mgmt Demo — this is Val. How can I direct your call?",
  afterHoursGreeting: "Thanks for calling Harbor Property Mgmt Demo. The office is closed, but I'm Val — I can take a maintenance request or escalate an emergency right now.",
  agentTone: "clear, structured, and escalation-aware",
  temperature: 0.5,
  maxTokens: 150,
  brandColor: "#5a3ea1",
  logoUrl: null,
  contactPhone: null,
  contactEmail: null,
  websiteUrl: null,
  vapiAssistantId: null,
  vapiPhoneNumberId: null,
  active: true,
  createdAt: now,
  updatedAt: now,
};

const syntheticCalls = [
  { callerName: "Carlos Vega", callerPhone: "+13055550401", serviceType: "Maintenance request", outcome: "lead_captured", summary: "Leaking faucet in unit 4B — work order created, maintenance team notified.", isAfterHours: false },
  { callerName: "Jen Malik", callerPhone: "+13055550402", serviceType: "Emergency escalation", outcome: "escalated", summary: "Burst pipe flooding unit 7A at 2am — escalated to on-call manager immediately.", isAfterHours: true },
  { callerName: "Robert Shaw", callerPhone: "+13055550403", serviceType: "Owner inquiry", outcome: "lead_captured", summary: "Owner asked about Q3 occupancy — callback scheduled with property manager.", isAfterHours: false },
  { callerName: "Maria Santos", callerPhone: "+13055550404", serviceType: "Move-in coordination", outcome: "scheduled", summary: "Move-in walkthrough booked for next Friday 10am.", isAfterHours: false },
  { callerName: "Tim Brown", callerPhone: "+13055550405", serviceType: "Work order follow-up", outcome: "no_action", summary: "Checking status on AC repair — referred to work order portal.", isAfterHours: false },
  { callerName: "Anna Liu", callerPhone: "+13055550406", serviceType: "Maintenance request", outcome: "lead_captured", summary: "Broken elevator in Building C — work order escalated.", isAfterHours: false },
];

const syntheticLeads = [
  { callerName: "Carlos Vega", callerPhone: "+13055550401", serviceRequested: "Maintenance — leaking faucet unit 4B", urgency: "normal", status: "contacted", address: "400 Brickell Ave Unit 4B, Miami, FL" },
  { callerName: "Anna Liu", callerPhone: "+13055550406", serviceRequested: "Maintenance — elevator Building C", urgency: "urgent", status: "new", address: "88 NE 1st Ave, Miami, FL" },
  { callerName: "Robert Shaw", callerPhone: "+13055550403", serviceRequested: "Owner inquiry — occupancy report", urgency: "low", status: "new", address: "1000 Edgewater Dr, Miami, FL" },
  { callerName: "Jen Malik", callerPhone: "+13055550402", serviceRequested: "Emergency — burst pipe unit 7A", urgency: "urgent", status: "converted", address: "210 SW 2nd St Unit 7A, Miami, FL" },
];

const syntheticAppointments = [
  { callerName: "Maria Santos", callerPhone: "+13055550404", serviceType: "Move-in walkthrough", startTime: new Date(now + 5 * 86400000).toISOString(), status: "confirmed", address: "300 Wynwood Ave Unit 2C, Miami, FL" },
  { callerName: "Robert Shaw", callerPhone: "+13055550403", serviceType: "Owner callback — occupancy review", startTime: new Date(now + 2 * 86400000).toISOString(), status: "confirmed", address: "1000 Edgewater Dr, Miami, FL" },
  { callerName: "New Tenant", callerPhone: "+13055550407", serviceType: "Move-out inspection", startTime: new Date(now + 8 * 86400000).toISOString(), status: "requested", address: "55 Downtown Blvd Unit 12, Miami, FL" },
];

async function seed() {
  try {
    console.log(`Seeding ${BUSINESS_ID}...`);

    await db.collection("businesses").doc(BUSINESS_ID).set(business);
    console.log(`✓ Created ${BUSINESS_ID} (Harbor Property Mgmt Demo)`);

    for (const sub of ["calls", "leads", "appointments", "agentActions", "faqSuggestions"]) {
      const ref = db.collection("businesses").doc(BUSINESS_ID).collection(sub).doc("_init");
      await ref.set({ initialized: true });
      await ref.delete();
    }
    console.log("✓ Initialized subcollections");

    for (const call of syntheticCalls) {
      await db.collection("businesses").doc(BUSINESS_ID).collection("calls").add({
        ...call, businessId: BUSINESS_ID, duration: Math.floor(Math.random() * 180 + 60),
        createdAt: now - Math.floor(Math.random() * 7 * 86400000),
      });
    }
    console.log(`✓ Added ${syntheticCalls.length} synthetic calls`);

    for (const lead of syntheticLeads) {
      await db.collection("businesses").doc(BUSINESS_ID).collection("leads").add({
        ...lead, businessId: BUSINESS_ID, createdAt: now - Math.floor(Math.random() * 5 * 86400000),
      });
    }
    console.log(`✓ Added ${syntheticLeads.length} synthetic leads`);

    for (const appt of syntheticAppointments) {
      await db.collection("businesses").doc(BUSINESS_ID).collection("appointments").add({
        ...appt, businessId: BUSINESS_ID, createdAt: now - Math.floor(Math.random() * 2 * 86400000),
      });
    }
    console.log(`✓ Added ${syntheticAppointments.length} synthetic appointments`);

    console.log(`\n✅ Seed complete! Business ID: ${BUSINESS_ID}`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  }
}

seed();
