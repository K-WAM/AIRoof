// Plain ESM seed script — no TypeScript, no path aliases
// Run with: node scripts/seed-demo-general-contractors.mjs

import admin from "firebase-admin";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = join(__dirname, "..", "firebase-service-account.json");
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf-8"));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const BUSINESS_ID = "demo-general-contractors";
const now = Date.now();

const business = {
  businessId: BUSINESS_ID,
  businessName: "Summit GC Demo",
  industry: "general-contractors",
  phoneNumber: null,
  serviceArea: ["Miami", "Fort Lauderdale", "Boca Raton", "Broward County", "Palm Beach County"],
  timezone: "America/New_York",
  businessHours: {
    Monday: "07:00 - 17:00",
    Tuesday: "07:00 - 17:00",
    Wednesday: "07:00 - 17:00",
    Thursday: "07:00 - 17:00",
    Friday: "07:00 - 17:00",
    Saturday: "08:00 - 12:00",
    Sunday: "Closed",
  },
  approvedServices: [
    "Project consultations and estimates",
    "Residential remodeling",
    "Commercial build-outs",
    "Kitchen and bathroom renovations",
    "Additions and structural work",
    "Permit coordination assistance",
  ],
  approvedFaqs: [
    {
      question: "Are you licensed and insured?",
      answer: "Yes, we carry a full general contractor license and liability insurance. We can provide documentation on request.",
    },
    {
      question: "How long will my project take?",
      answer: "Timeline depends on scope. We'll give you a detailed schedule after a consultation and site review.",
    },
    {
      question: "Do you use subcontractors?",
      answer: "Yes, we work with a vetted team of licensed, insured subcontractors for specialized trades like electrical and plumbing.",
    },
  ],
  emergencyRules: [
    "If caller reports structural failure or collapse risk: escalate immediately",
    "If caller reports active water intrusion through a construction site: escalate same-day",
    "If caller mentions a safety hazard on a job site: escalate immediately",
  ],
  bookingRules: [
    "Collect project type, address, rough scope, and budget range before scheduling",
    "Initial consultations are free — schedule within 5 business days",
    "Collect preferred contact method and best callback time",
  ],
  disallowedTopics: [
    "specific cost guarantees",
    "permit approval timelines",
    "legal subcontractor disputes",
    "detailed engineering specifications",
  ],
  escalationPhone: "+13055550005",
  notificationEmail: "kwamwad@gmail.com",
  calendarProvider: "mock",
  planTier: "standard",
  aiProvider: "openai",
  liveModel: "gpt-4o-mini",
  backOfficeModel: "deepseek-chat",
  agentName: "Rex",
  agentIdentity: "receptionist",
  greeting: "Thanks for calling Summit GC Demo, this is Rex. How can I help?",
  afterHoursGreeting: "Thanks for calling Summit GC Demo. The office is closed, but I'm Rex — I can take your project details and have someone call you first thing.",
  agentTone: "direct, professional, and project-aware",
  temperature: 0.5,
  maxTokens: 150,
  brandColor: "#b45309",
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
  { callerName: "Patricia Morales", callerPhone: "+13055550501", serviceType: "Kitchen remodel estimate", outcome: "scheduled", summary: "Full kitchen remodel — consultation booked for Monday 9am.", isAfterHours: false },
  { callerName: "Gary Freeman", callerPhone: "+13055550502", serviceType: "Commercial build-out", outcome: "lead_captured", summary: "Office space build-out ~3,000 sqft — lead captured, estimator to follow up.", isAfterHours: false },
  { callerName: "Sarah Kim", callerPhone: "+13055550503", serviceType: "Bathroom renovation", outcome: "scheduled", summary: "Master bath gut renovation — site visit booked for Thursday.", isAfterHours: false },
  { callerName: "Dan Morrison", callerPhone: "+13055550504", serviceType: "Home addition", outcome: "lead_captured", summary: "2-bedroom addition — caller wants budget estimate first, team to call back.", isAfterHours: false },
  { callerName: "Lucy Pham", callerPhone: "+13055550505", serviceType: "Permit coordination", outcome: "scheduled", summary: "Permit issue on existing project — consultant call booked for Friday.", isAfterHours: false },
  { callerName: "Unknown", callerPhone: "+13055550506", serviceType: "General inquiry", outcome: "no_action", summary: "Caller disconnected before providing project details.", isAfterHours: false },
];

const syntheticLeads = [
  { callerName: "Gary Freeman", callerPhone: "+13055550502", serviceRequested: "Commercial build-out 3,000 sqft", urgency: "normal", status: "new", address: "800 Brickell Ave Suite 400, Miami, FL" },
  { callerName: "Dan Morrison", callerPhone: "+13055550504", serviceRequested: "2-bedroom home addition", urgency: "normal", status: "contacted", address: "22 Coral Way, Coral Gables, FL" },
  { callerName: "Bill Harmon", callerPhone: "+13055550507", serviceRequested: "Kitchen and bath remodel", urgency: "normal", status: "new", address: "510 SW 9th Ave, Fort Lauderdale, FL" },
  { callerName: "Patricia Morales", callerPhone: "+13055550501", serviceRequested: "Full kitchen remodel", urgency: "normal", status: "converted", address: "130 NW 4th St, Miami, FL" },
];

const syntheticAppointments = [
  { callerName: "Patricia Morales", callerPhone: "+13055550501", serviceType: "Kitchen remodel consultation", startTime: new Date(now + 4 * 86400000).toISOString(), status: "confirmed", address: "130 NW 4th St, Miami, FL" },
  { callerName: "Sarah Kim", callerPhone: "+13055550503", serviceType: "Bathroom renovation site visit", startTime: new Date(now + 3 * 86400000).toISOString(), status: "confirmed", address: "77 Ponce De Leon, Coral Gables, FL" },
  { callerName: "Lucy Pham", callerPhone: "+13055550505", serviceType: "Permit coordination call", startTime: new Date(now + 86400000).toISOString(), status: "confirmed", address: "200 SE 3rd Ave, Fort Lauderdale, FL" },
];

async function seed() {
  try {
    console.log(`Seeding ${BUSINESS_ID}...`);

    await db.collection("businesses").doc(BUSINESS_ID).set(business);
    console.log(`✓ Created ${BUSINESS_ID} (Summit GC Demo)`);

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
