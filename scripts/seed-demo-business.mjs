// Plain ESM seed script — no TypeScript, no path aliases
// Run with: node scripts/seed-demo-business.mjs

import admin from "firebase-admin";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = join(__dirname, "..", "firebase-service-account.json");
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf-8"));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const demoBusiness = {
  businessId: "demo-roofing",
  businessName: "Apex Roofing South Florida",
  industry: "roofing",
  phoneNumber: "+16892042643",
  serviceArea: ["Miami", "Coral Gables", "Doral", "Hialeah", "Kendall", "Homestead"],
  timezone: "America/New_York",
  businessHours: {
    Monday: "08:00 - 17:00",
    Tuesday: "08:00 - 17:00",
    Wednesday: "08:00 - 17:00",
    Thursday: "08:00 - 17:00",
    Friday: "08:00 - 17:00",
    Saturday: "09:00 - 13:00",
    Sunday: "Closed",
  },
  approvedServices: [
    "Roof inspections and assessments",
    "Shingle replacement and repairs",
    "Metal roofing installation",
    "Emergency water leak repairs",
    "Flashing and valley repairs",
    "Gutter cleaning and installation",
  ],
  approvedFaqs: [
    {
      question: "Do you offer emergency services?",
      answer: "Yes, we can typically respond to emergency calls same-day. Please call us immediately if you have water damage or a leak.",
    },
    {
      question: "What areas do you service?",
      answer: "We service Miami, Coral Gables, Doral, Hialeah, Kendall, and Homestead. Provide your address and we'll confirm availability.",
    },
    {
      question: "How much does an inspection cost?",
      answer: "Inspection pricing depends on the job scope. Our team can confirm the current fee before booking.",
    },
    {
      question: "Do you offer warranties?",
      answer: "Warranty details vary by project and materials. We offer workmanship and manufacturer warranties — ask us for details.",
    },
    {
      question: "Do you work with insurance companies?",
      answer: "Yes, we work with most major insurers on storm damage claims. We can help document the damage for your claim.",
    },
  ],
  emergencyRules: [
    "If caller mentions active water entry, leak, or flooding: escalate immediately",
    "If caller mentions electrical hazards, fire damage, or safety risk: escalate immediately",
    "If caller mentions storm damage with exposed roof or interior damage: prioritize same-day follow-up",
    "If caller indicates immediate danger: advise them to contact emergency services first, then escalate",
  ],
  bookingRules: [
    "Only book appointments during business hours unless the call is an emergency",
    "Minimum 24-hour notice for non-emergency appointments",
    "Collect caller name, phone, service type, address, urgency, and preferred time before confirming",
    "Emergency appointments can be requested ASAP if same-day availability exists",
  ],
  disallowedTopics: [
    "detailed pricing without inspection",
    "insurance claim advice",
    "legal advice",
    "structural engineering conclusions",
    "financing terms unless explicitly configured",
  ],
  escalationPhone: "+13055550000",
  notificationEmail: "kwamwad@gmail.com",
  calendarProvider: "mock",
  planTier: "standard",
  aiProvider: "openai",
  liveModel: "gpt-4o-mini",
  backOfficeModel: "deepseek-chat",
  agentName: "Roofus",
  agentIdentity: "receptionist",
  greeting: "Thanks for calling Apex Roofing South Florida, this is Roofus. How can I help?",
  afterHoursGreeting: "Thanks for calling Apex Roofing South Florida, this is Roofus. The office is closed, but I can still help take a message or flag an urgent roof leak.",
  agentVoice: "Polly.Matthew-Generative",
  agentTone: "calm, friendly, concise, and efficient",
  temperature: 0.5,
  maxTokens: 150,
  // Brand identity (used in notification emails)
  brandColor: "#1e3a5f",        // navy — set per client during onboarding
  logoUrl: null,                // set to HTTPS URL of client logo when available
  contactPhone: "+1 (754) 283-7658",
  contactEmail: null,
  websiteUrl: null,

  // Vapi integration
  vapiAssistantId: "9267a84a-0f4f-416b-a328-1dc539f5265e",
  active: true,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  isDemo: true,
};

async function seed() {
  try {
    console.log("Seeding demo business...");

    // Preserve (or mint) the stable field key — the public /field QR carries it,
    // so regenerating on every seed would invalidate printed QR codes.
    const existing = await db.collection("businesses").doc("demo-roofing").get();
    const priorKey = existing.exists ? existing.data().fieldKey : undefined;
    demoBusiness.fieldKey =
      typeof priorKey === "string" && priorKey.length >= 16
        ? priorKey
        : (await import("crypto")).randomBytes(16).toString("hex");

    await db.collection("businesses").doc("demo-roofing").set(demoBusiness);
    console.log("✓ Created demo-roofing business (Apex Roofing South Florida)");
    console.log(`✓ Field key: ${demoBusiness.fieldKey} (QR link: /field?businessId=demo-roofing&key=${demoBusiness.fieldKey})`);

    // Create phone number mapping so incoming webhook can route calls
    await db.collection("businessPhoneNumbers").doc("demo-roofing-main").set({
      phoneNumberId: "demo-roofing-main",
      businessId: "demo-roofing",
      phoneNumber: "+16892042643",
      normalizedPhoneNumber: "+16892042643",
      label: "Main line",
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    console.log("✓ Created businessPhoneNumbers mapping (active: true)");

    // Create empty subcollections with init+delete pattern
    for (const sub of ["calls", "leads", "appointments", "agentActions", "faqSuggestions"]) {
      const ref = db.collection("businesses").doc("demo-roofing").collection(sub).doc("_init");
      await ref.set({ initialized: true });
      await ref.delete();
      console.log(`✓ Created ${sub} subcollection`);
    }

    console.log("\n✅ Seed complete!");
    console.log("   Business ID:   demo-roofing");
    console.log("   Business Name: Apex Roofing South Florida");
    console.log("   Agent:         Roofus");
    console.log("   Phone:         +16892042643");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  }
}

seed();
