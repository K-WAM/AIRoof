// Plain ESM seed script — no TypeScript, no path aliases
// Run with: node scripts/seed-demo-dental.mjs

import admin from "firebase-admin";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = join(__dirname, "..", "firebase-service-account.json");
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf-8"));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const BUSINESS_ID = "demo-dental";
const now = Date.now();

const business = {
  businessId: BUSINESS_ID,
  businessName: "Bright Smile Dental Demo",
  industry: "dental",
  phoneNumber: null,
  serviceArea: ["Miami", "Coral Gables", "Brickell", "Coconut Grove", "Doral"],
  timezone: "America/New_York",
  businessHours: {
    Monday: "08:00 - 17:00",
    Tuesday: "08:00 - 17:00",
    Wednesday: "08:00 - 17:00",
    Thursday: "08:00 - 17:00",
    Friday: "08:00 - 15:00",
    Saturday: "09:00 - 13:00",
    Sunday: "Closed",
  },
  approvedServices: [
    "New patient appointments",
    "Routine cleanings and exams",
    "Emergency dental appointments",
    "Teeth whitening consultations",
    "Orthodontic consultations",
    "Denture and crown consultations",
  ],
  approvedFaqs: [
    {
      question: "Do you accept my insurance?",
      answer: "Insurance acceptance varies by plan. Our team can verify your coverage — just have your provider and member ID ready when you call.",
    },
    {
      question: "What do I need to do before my first visit?",
      answer: "New patients will need to complete an intake form before their appointment. We'll send it to you by email after booking.",
    },
    {
      question: "Can I get seen today for a dental emergency?",
      answer: "Yes, we prioritize dental emergencies and keep same-day slots available. Let us know your situation and we'll get you in as soon as possible.",
    },
  ],
  emergencyRules: [
    "If caller describes severe tooth pain, swelling, or trauma: offer a same-day emergency slot",
    "If caller reports a broken or knocked-out tooth: advise them to come in immediately",
    "If caller mentions difficulty swallowing or breathing: advise calling 911 immediately",
  ],
  bookingRules: [
    "Collect patient name, date of birth, and insurance provider before confirming",
    "New patients require a minimum 60-minute appointment slot",
    "Dental emergencies take priority over routine scheduling",
  ],
  disallowedTopics: [
    "diagnosis or treatment recommendations",
    "medication advice",
    "insurance claim advice",
    "HIPAA-protected records details",
  ],
  escalationPhone: "+13055550003",
  notificationEmail: "kwamwad@gmail.com",
  calendarProvider: "mock",
  planTier: "standard",
  aiProvider: "openai",
  liveModel: "gpt-4o-mini",
  backOfficeModel: "deepseek-chat",
  agentName: "Aria",
  agentIdentity: "receptionist",
  greeting: "Thank you for calling Bright Smile Dental Demo, this is Aria. How can I help you today?",
  afterHoursGreeting: "Thanks for calling Bright Smile Dental Demo. The office is closed, but I'm Aria — I can take your name and number so we call you back first thing in the morning.",
  agentTone: "calm, reassuring, and privacy-conscious",
  temperature: 0.5,
  maxTokens: 150,
  brandColor: "#0e6fa7",
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
  { callerName: "Rachel Adams", callerPhone: "+13055550301", serviceType: "Emergency tooth pain", outcome: "scheduled", summary: "Severe toothache — booked same-day emergency slot at 2pm.", isAfterHours: false },
  { callerName: "Mike Torres", callerPhone: "+13055550302", serviceType: "New patient exam", outcome: "scheduled", summary: "New patient exam booked for next Tuesday at 10am.", isAfterHours: false },
  { callerName: "Diana Pryce", callerPhone: "+13055550303", serviceType: "Teeth whitening consult", outcome: "lead_captured", summary: "Interested in whitening before a wedding — lead captured, follow-up scheduled.", isAfterHours: false },
  { callerName: "Sam Okafor", callerPhone: "+13055550304", serviceType: "Routine cleaning", outcome: "scheduled", summary: "Annual cleaning booked for Thursday 9am.", isAfterHours: false },
  { callerName: "Cara Flynn", callerPhone: "+13055550305", serviceType: "Orthodontic consult", outcome: "scheduled", summary: "Invisalign consultation booked for next Monday.", isAfterHours: false },
  { callerName: "Unknown", callerPhone: "+13055550306", serviceType: "Insurance question", outcome: "no_action", summary: "Caller wanted specific insurance details — redirected to team.", isAfterHours: false },
];

const syntheticLeads = [
  { callerName: "Diana Pryce", callerPhone: "+13055550303", serviceRequested: "Teeth whitening consultation", urgency: "normal", status: "new", address: "200 Brickell Ave, Miami, FL" },
  { callerName: "Nina Hart", callerPhone: "+13055550307", serviceRequested: "New patient exam", urgency: "normal", status: "contacted", address: "88 Palm Dr, Coral Gables, FL" },
  { callerName: "Tom Bradley", callerPhone: "+13055550308", serviceRequested: "Crown consultation", urgency: "normal", status: "new", address: "45 Grove St, Coconut Grove, FL" },
  { callerName: "Rachel Adams", callerPhone: "+13055550301", serviceRequested: "Emergency dental", urgency: "urgent", status: "converted", address: "12 Ocean Dr, Miami Beach, FL" },
];

const syntheticAppointments = [
  { callerName: "Rachel Adams", callerPhone: "+13055550301", serviceType: "Emergency tooth pain", startTime: new Date(now + 3600000).toISOString(), status: "confirmed", address: "12 Ocean Dr, Miami Beach, FL" },
  { callerName: "Mike Torres", callerPhone: "+13055550302", serviceType: "New patient exam", startTime: new Date(now + 6 * 86400000).toISOString(), status: "confirmed", address: "300 SW 1st Ave, Miami, FL" },
  { callerName: "Sam Okafor", callerPhone: "+13055550304", serviceType: "Routine cleaning", startTime: new Date(now + 3 * 86400000).toISOString(), status: "confirmed", address: "55 Coral Way, Coral Gables, FL" },
];

async function seed() {
  try {
    console.log(`Seeding ${BUSINESS_ID}...`);

    await db.collection("businesses").doc(BUSINESS_ID).set(business);
    console.log(`✓ Created ${BUSINESS_ID} (Bright Smile Dental Demo)`);

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
