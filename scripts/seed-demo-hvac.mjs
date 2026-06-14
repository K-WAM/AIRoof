// Plain ESM seed script — no TypeScript, no path aliases
// Run with: node scripts/seed-demo-hvac.mjs

import admin from "firebase-admin";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = join(__dirname, "..", "firebase-service-account.json");
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf-8"));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const BUSINESS_ID = "demo-hvac";
const now = Date.now();

const business = {
  businessId: BUSINESS_ID,
  businessName: "Summit HVAC Demo",
  industry: "hvac",
  phoneNumber: null,
  serviceArea: ["Miami", "Fort Lauderdale", "Boca Raton", "West Palm Beach"],
  timezone: "America/New_York",
  businessHours: {
    Monday: "07:00 - 18:00",
    Tuesday: "07:00 - 18:00",
    Wednesday: "07:00 - 18:00",
    Thursday: "07:00 - 18:00",
    Friday: "07:00 - 18:00",
    Saturday: "08:00 - 14:00",
    Sunday: "Closed",
  },
  approvedServices: [
    "AC installation and replacement",
    "Heating system installation",
    "AC repair and maintenance",
    "Duct cleaning and sealing",
    "Smart thermostat installation",
    "Emergency AC repair",
  ],
  approvedFaqs: [
    {
      question: "How fast can you respond to an emergency?",
      answer: "We offer same-day emergency service, typically within 2–4 hours. Call us right away and we'll get a tech dispatched.",
    },
    {
      question: "What brands do you service?",
      answer: "We service all major brands including Carrier, Trane, Lennox, Goodman, and more.",
    },
    {
      question: "What's included in a tune-up?",
      answer: "A standard tune-up includes coil cleaning, refrigerant check, filter replacement, electrical inspection, and a written report.",
    },
  ],
  emergencyRules: [
    "If caller has no cooling during extreme heat: escalate immediately",
    "If caller mentions elderly person or infant in home without AC: prioritize same-day response",
    "If caller reports gas smell near HVAC unit: advise calling the gas company immediately, then escalate",
  ],
  bookingRules: [
    "Collect full address, system brand and age, and issue description before confirming booking",
    "Emergency slots available same-day; standard tune-ups require 48-hour notice",
    "Always confirm preferred contact number before ending the call",
  ],
  disallowedTopics: [
    "detailed pricing without a site visit",
    "warranty legal advice",
    "DIY refrigerant handling",
  ],
  escalationPhone: "+13055550001",
  notificationEmail: "kwamwad@gmail.com",
  calendarProvider: "mock",
  planTier: "standard",
  aiProvider: "openai",
  liveModel: "gpt-4o-mini",
  backOfficeModel: "deepseek-chat",
  agentName: "Claire",
  agentIdentity: "receptionist",
  greeting: "Thanks for calling Summit HVAC Demo, this is Claire. How can I help?",
  afterHoursGreeting: "Thanks for calling Summit HVAC Demo. The office is closed but I'm Claire — I can still take a message or flag an AC emergency.",
  agentTone: "warm, professional, and safety-aware",
  temperature: 0.5,
  maxTokens: 150,
  brandColor: "#1a5276",
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
  { callerName: "Tom Briggs", callerPhone: "+13055550101", serviceType: "AC repair", outcome: "scheduled", summary: "AC not cooling — booked inspection for tomorrow 9am.", isAfterHours: false },
  { callerName: "Sandra Lee", callerPhone: "+13055550102", serviceType: "Emergency AC repair", outcome: "escalated", summary: "No AC with elderly parent at home in 95°F heat — escalated immediately.", isAfterHours: true },
  { callerName: "Kevin Park", callerPhone: "+13055550103", serviceType: "Tune-up", outcome: "scheduled", summary: "Annual tune-up booked for Friday 10am.", isAfterHours: false },
  { callerName: "Maria Gonzalez", callerPhone: "+13055550104", serviceType: "Smart thermostat install", outcome: "lead_captured", summary: "Interested in upgrading to a Nest — captured lead, team to follow up.", isAfterHours: false },
  { callerName: "James Chu", callerPhone: "+13055550105", serviceType: "Duct cleaning", outcome: "scheduled", summary: "Full duct cleaning booked for next week.", isAfterHours: false },
  { callerName: "Unknown Caller", callerPhone: "+13055550106", serviceType: "General inquiry", outcome: "no_action", summary: "Caller hung up before providing details.", isAfterHours: false },
];

const syntheticLeads = [
  { callerName: "Maria Gonzalez", callerPhone: "+13055550104", serviceRequested: "Smart thermostat installation", urgency: "normal", status: "new", address: "890 Palm Ave, Boca Raton, FL" },
  { callerName: "Nina Torres", callerPhone: "+13055550107", serviceRequested: "AC replacement quote", urgency: "normal", status: "contacted", address: "412 Ocean Blvd, Fort Lauderdale, FL" },
  { callerName: "Ray Hoffman", callerPhone: "+13055550108", serviceRequested: "Heating system install", urgency: "low", status: "new", address: "56 Maple St, West Palm Beach, FL" },
  { callerName: "Sandra Lee", callerPhone: "+13055550102", serviceRequested: "Emergency AC repair", urgency: "urgent", status: "converted", address: "22 Sunset Dr, Miami, FL" },
];

const syntheticAppointments = [
  { callerName: "Tom Briggs", callerPhone: "+13055550101", serviceType: "AC repair", startTime: new Date(now + 86400000).toISOString(), status: "confirmed", address: "301 Bay St, Fort Lauderdale, FL" },
  { callerName: "Kevin Park", callerPhone: "+13055550103", serviceType: "Annual tune-up", startTime: new Date(now + 3 * 86400000).toISOString(), status: "confirmed", address: "78 Harbor View, Miami, FL" },
  { callerName: "James Chu", callerPhone: "+13055550105", serviceType: "Duct cleaning", startTime: new Date(now + 7 * 86400000).toISOString(), status: "requested", address: "501 Pine Rd, Boca Raton, FL" },
];

async function seed() {
  try {
    console.log(`Seeding ${BUSINESS_ID}...`);

    await db.collection("businesses").doc(BUSINESS_ID).set(business);
    console.log(`✓ Created ${BUSINESS_ID} (Summit HVAC Demo)`);

    // Empty subcollection init
    for (const sub of ["calls", "leads", "appointments", "agentActions", "faqSuggestions"]) {
      const ref = db.collection("businesses").doc(BUSINESS_ID).collection(sub).doc("_init");
      await ref.set({ initialized: true });
      await ref.delete();
    }
    console.log("✓ Initialized subcollections");

    // Synthetic calls
    for (const call of syntheticCalls) {
      await db.collection("businesses").doc(BUSINESS_ID).collection("calls").add({
        ...call,
        businessId: BUSINESS_ID,
        duration: Math.floor(Math.random() * 180 + 60),
        createdAt: now - Math.floor(Math.random() * 7 * 86400000),
      });
    }
    console.log(`✓ Added ${syntheticCalls.length} synthetic calls`);

    // Synthetic leads
    for (const lead of syntheticLeads) {
      await db.collection("businesses").doc(BUSINESS_ID).collection("leads").add({
        ...lead,
        businessId: BUSINESS_ID,
        createdAt: now - Math.floor(Math.random() * 5 * 86400000),
      });
    }
    console.log(`✓ Added ${syntheticLeads.length} synthetic leads`);

    // Synthetic appointments
    for (const appt of syntheticAppointments) {
      await db.collection("businesses").doc(BUSINESS_ID).collection("appointments").add({
        ...appt,
        businessId: BUSINESS_ID,
        createdAt: now - Math.floor(Math.random() * 2 * 86400000),
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
