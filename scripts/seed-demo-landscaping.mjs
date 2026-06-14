// Plain ESM seed script — no TypeScript, no path aliases
// Run with: node scripts/seed-demo-landscaping.mjs

import admin from "firebase-admin";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = join(__dirname, "..", "firebase-service-account.json");
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf-8"));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const BUSINESS_ID = "demo-landscaping";
const now = Date.now();

const business = {
  businessId: BUSINESS_ID,
  businessName: "Greenpath Landscaping Demo",
  industry: "landscaping",
  phoneNumber: null,
  serviceArea: ["Miami", "Coral Gables", "Pinecrest", "South Miami", "Coconut Grove"],
  timezone: "America/New_York",
  businessHours: {
    Monday: "07:00 - 17:00",
    Tuesday: "07:00 - 17:00",
    Wednesday: "07:00 - 17:00",
    Thursday: "07:00 - 17:00",
    Friday: "07:00 - 17:00",
    Saturday: "08:00 - 13:00",
    Sunday: "Closed",
  },
  approvedServices: [
    "Lawn maintenance and mowing",
    "Landscape design and installation",
    "Irrigation system installation and repair",
    "Tree trimming and removal",
    "Sod installation",
    "Mulching and edging",
  ],
  approvedFaqs: [
    {
      question: "Do you offer recurring maintenance plans?",
      answer: "Yes, we offer weekly, bi-weekly, and monthly maintenance plans. We can set you up with the right schedule during booking.",
    },
    {
      question: "Are you licensed and insured?",
      answer: "Yes, we are fully licensed and insured with up to $2M in liability coverage for your peace of mind.",
    },
    {
      question: "Do you work on HOA properties?",
      answer: "Absolutely. We're familiar with HOA requirements and can work within any community guidelines.",
    },
  ],
  emergencyRules: [
    "If caller mentions storm damage blocking driveway or access: prioritize same-week removal",
    "If caller reports fallen tree on structure or vehicle: escalate immediately",
  ],
  bookingRules: [
    "Always confirm service address and property size before booking",
    "First-time consultations require a site visit — schedule within 72 hours",
    "Collect HOA requirements if the property is in a managed community",
  ],
  disallowedTopics: [
    "pest control advice",
    "structural repairs",
    "pool service",
  ],
  escalationPhone: "+13055550002",
  notificationEmail: "kwamwad@gmail.com",
  calendarProvider: "mock",
  planTier: "standard",
  aiProvider: "openai",
  liveModel: "gpt-4o-mini",
  backOfficeModel: "deepseek-chat",
  agentName: "Maya",
  agentIdentity: "receptionist",
  greeting: "Hi, thanks for calling Greenpath Landscaping Demo! This is Maya. What can I help you with today?",
  afterHoursGreeting: "Thanks for calling Greenpath Landscaping Demo. The office is closed, but I'm Maya and I can still take your details or flag a storm emergency.",
  agentTone: "friendly, upbeat, and organized",
  temperature: 0.5,
  maxTokens: 150,
  brandColor: "#1e8449",
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
  { callerName: "David Chen", callerPhone: "+13055550201", serviceType: "Lawn maintenance", outcome: "scheduled", summary: "Signed up for bi-weekly lawn plan. First visit next Monday.", isAfterHours: false },
  { callerName: "Lisa Monroe", callerPhone: "+13055550202", serviceType: "Tree removal", outcome: "lead_captured", summary: "Storm knocked down oak tree blocking driveway — site visit booked for tomorrow.", isAfterHours: true },
  { callerName: "Paul Ramos", callerPhone: "+13055550203", serviceType: "Sod installation", outcome: "scheduled", summary: "Full backyard sod install — consultation booked for Thursday.", isAfterHours: false },
  { callerName: "Amy Kim", callerPhone: "+13055550204", serviceType: "Irrigation repair", outcome: "scheduled", summary: "Sprinkler heads broken — repair scheduled for Wednesday morning.", isAfterHours: false },
  { callerName: "Brian Wells", callerPhone: "+13055550205", serviceType: "Landscape design", outcome: "lead_captured", summary: "New build — full landscape design consultation requested.", isAfterHours: false },
  { callerName: "Unknown", callerPhone: "+13055550206", serviceType: "General inquiry", outcome: "no_action", summary: "Caller didn't leave details.", isAfterHours: false },
];

const syntheticLeads = [
  { callerName: "Lisa Monroe", callerPhone: "+13055550202", serviceRequested: "Emergency tree removal", urgency: "urgent", status: "converted", address: "45 Banyan Rd, Coral Gables, FL" },
  { callerName: "Brian Wells", callerPhone: "+13055550205", serviceRequested: "Full landscape design", urgency: "normal", status: "new", address: "200 Grove Ln, Coconut Grove, FL" },
  { callerName: "Carmen Ortiz", callerPhone: "+13055550207", serviceRequested: "Monthly lawn plan", urgency: "low", status: "contacted", address: "88 Oak Ave, Pinecrest, FL" },
  { callerName: "George Tan", callerPhone: "+13055550208", serviceRequested: "Mulching and edging", urgency: "low", status: "new", address: "33 Magnolia St, South Miami, FL" },
];

const syntheticAppointments = [
  { callerName: "David Chen", callerPhone: "+13055550201", serviceType: "Bi-weekly lawn maintenance", startTime: new Date(now + 86400000).toISOString(), status: "confirmed", address: "102 Palm Dr, Miami, FL" },
  { callerName: "Paul Ramos", callerPhone: "+13055550203", serviceType: "Sod installation consultation", startTime: new Date(now + 3 * 86400000).toISOString(), status: "confirmed", address: "777 Sunset Blvd, Coral Gables, FL" },
  { callerName: "Amy Kim", callerPhone: "+13055550204", serviceType: "Irrigation system repair", startTime: new Date(now + 2 * 86400000).toISOString(), status: "confirmed", address: "512 Fern St, South Miami, FL" },
];

async function seed() {
  try {
    console.log(`Seeding ${BUSINESS_ID}...`);

    await db.collection("businesses").doc(BUSINESS_ID).set(business);
    console.log(`✓ Created ${BUSINESS_ID} (Greenpath Landscaping Demo)`);

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
