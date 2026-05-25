// Seed two polished demo client businesses with realistic activity data
// Run with: node scripts/seed-demo-clients.mjs

import admin from "firebase-admin";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = join(__dirname, "..", "firebase-service-account.json");
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf-8"));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const now = Date.now();
const DAY = 86400000;

// ── Business 1: Premier HVAC Services (Tampa) ──────────────────────────────
const hvac = {
  businessId: "premier-hvac",
  businessName: "Premier HVAC Services",
  industry: "hvac",
  phoneNumber: "+18133000000",
  serviceArea: ["Tampa", "St. Petersburg", "Clearwater", "Brandon", "Riverview"],
  businessHours: {
    Monday: "07:00 - 18:00", Tuesday: "07:00 - 18:00", Wednesday: "07:00 - 18:00",
    Thursday: "07:00 - 18:00", Friday: "07:00 - 18:00",
    Saturday: "08:00 - 14:00", Sunday: "Closed",
  },
  approvedServices: [
    "AC installation and replacement", "Heating system installation",
    "AC repair and maintenance", "Duct cleaning and sealing",
    "Smart thermostat installation", "Emergency AC repair",
  ],
  approvedFaqs: [
    { question: "How quickly can you respond to an emergency?", answer: "We offer same-day emergency service. Our on-call techs can typically arrive within 2-4 hours." },
    { question: "Do you service all AC brands?", answer: "Yes — we service all major brands including Carrier, Trane, Lennox, Goodman, and more." },
    { question: "What's included in a tune-up?", answer: "Coil cleaning, refrigerant check, filter replacement, electrical inspection, and a full system efficiency report." },
  ],
  emergencyRules: [
    "If caller has no cooling during extreme heat: escalate immediately",
    "If caller mentions elderly or infant in the home without AC: prioritize same-day",
  ],
  bookingRules: [
    "Collect full address, system brand/age, and describe the issue before confirming",
    "Emergency slots available same-day; standard tune-ups require 48hr notice",
  ],
  disallowedTopics: ["detailed pricing without inspection", "warranty legal advice"],
  escalationPhone: "+18135550001",
  notificationEmail: "kwamwad@gmail.com",
  calendarProvider: "mock",
  planTier: "professional",
  aiProvider: "openai",
  liveModel: "gpt-4o-mini",
  backOfficeModel: "deepseek-chat",
  agentName: "Claire",
  agentIdentity: "receptionist",
  greeting: "Thanks for calling Premier HVAC Services, this is Claire. How can I help you today?",
  afterHoursGreeting: "Thanks for calling Premier HVAC, this is Claire. The office is closed, but I can take a message or flag an AC emergency.",
  agentVoice: "Polly.Joanna-Generative",
  agentTone: "warm, professional, and reassuring",
  temperature: 0.5,
  maxTokens: 150,
  brandColor: "#1a5276",
  logoUrl: null,
  contactPhone: "+1 (813) 300-0000",
  contactEmail: "service@premierhvac.example",
  websiteUrl: null,
  vapiAssistantId: null,
  active: true,
  createdAt: now - 45 * DAY,
  updatedAt: now - 2 * DAY,
};

// ── Business 2: Coastal Landscaping Group (Fort Lauderdale) ─────────────────
const landscaping = {
  businessId: "coastal-landscaping",
  businessName: "Coastal Landscaping Group",
  industry: "landscaping",
  phoneNumber: "+19543000000",
  serviceArea: ["Fort Lauderdale", "Hollywood", "Pompano Beach", "Deerfield Beach", "Boca Raton"],
  businessHours: {
    Monday: "07:00 - 17:00", Tuesday: "07:00 - 17:00", Wednesday: "07:00 - 17:00",
    Thursday: "07:00 - 17:00", Friday: "07:00 - 17:00",
    Saturday: "08:00 - 13:00", Sunday: "Closed",
  },
  approvedServices: [
    "Lawn maintenance and mowing", "Landscape design and installation",
    "Irrigation system installation and repair", "Tree trimming and removal",
    "Sod installation", "Mulching and edging",
  ],
  approvedFaqs: [
    { question: "Do you offer weekly maintenance plans?", answer: "Yes — we have weekly, bi-weekly, and monthly plans. Most residential clients choose bi-weekly." },
    { question: "Are you licensed and insured?", answer: "Yes, fully licensed in Broward County and insured up to $2M. We can provide certificates on request." },
    { question: "Do you handle HOA properties?", answer: "Absolutely — we work with several HOAs in the area and understand the standards required." },
  ],
  emergencyRules: [
    "If caller mentions storm damage blocking access: prioritize same-week removal",
    "If caller mentions fallen tree on structure: escalate immediately",
  ],
  bookingRules: [
    "Always confirm service address and property size (sq ft or lot size) before booking",
    "First-time consultations require a site visit — book within 72 hours",
  ],
  disallowedTopics: ["pest control advice", "structural repairs", "pool service"],
  escalationPhone: "+19545550002",
  notificationEmail: "kwamwad@gmail.com",
  calendarProvider: "mock",
  planTier: "standard",
  aiProvider: "openai",
  liveModel: "gpt-4o-mini",
  backOfficeModel: "deepseek-chat",
  agentName: "Maya",
  agentIdentity: "receptionist",
  greeting: "Hi, thanks for calling Coastal Landscaping! This is Maya. What can I help you with today?",
  afterHoursGreeting: "Thanks for calling Coastal Landscaping. The office is closed, but I'm Maya and I can still take your details or flag an emergency.",
  agentVoice: "Polly.Salli-Generative",
  agentTone: "friendly, upbeat, and efficient",
  temperature: 0.5,
  maxTokens: 150,
  brandColor: "#1e8449",
  logoUrl: null,
  contactPhone: "+1 (954) 300-0000",
  contactEmail: "hello@coastallandscaping.example",
  websiteUrl: null,
  vapiAssistantId: null,
  active: true,
  createdAt: now - 22 * DAY,
  updatedAt: now - 1 * DAY,
};

// ── Sample activity data generators ──────────────────────────────────────────

function sampleCalls(businessId, count) {
  const statuses = ["completed", "completed", "completed", "escalated", "missed"];
  const durations = [65, 120, 95, 210, 45, 180, 78, 155, 88, 230];
  return Array.from({ length: count }, (_, i) => ({
    callId: `call-${businessId}-${i + 1}`,
    businessId,
    status: statuses[i % statuses.length],
    duration: durations[i % durations.length],
    startedAt: now - (count - i) * 1.8 * DAY,
    endedAt: now - (count - i) * 1.8 * DAY + durations[i % durations.length] * 1000,
    recordingUrl: null,
    summary: i % 3 === 0 ? "Caller requested a service appointment. Lead captured and appointment booked." : null,
    createdAt: now - (count - i) * 1.8 * DAY,
  }));
}

function sampleLeads(businessId, count, services) {
  const names = ["Carlos Mendez", "Jennifer Walsh", "Robert Kim", "Patricia Okafor", "David Chen", "Maria Santos", "James Patel", "Linda Nguyen"];
  const urgencies = ["standard", "standard", "urgent", "standard", "standard"];
  const statuses = ["new", "contacted", "booked", "new", "contacted"];
  return Array.from({ length: count }, (_, i) => ({
    leadId: `lead-${businessId}-${i + 1}`,
    businessId,
    callerName: names[i % names.length],
    callerPhone: `+1305${String(5550000 + i).padStart(7, "0")}`,
    serviceRequested: services[i % services.length],
    address: `${1000 + i * 47} Palm Dr`,
    urgency: urgencies[i % urgencies.length],
    status: statuses[i % statuses.length],
    notes: i % 4 === 0 ? "Caller mentioned previous service provider wasn't responding." : null,
    createdAt: now - (count - i) * 2.1 * DAY,
    updatedAt: now - (count - i) * 2 * DAY,
  }));
}

function sampleAppointments(businessId, count, services) {
  const names = ["Carlos Mendez", "Jennifer Walsh", "Robert Kim", "Patricia Okafor", "David Chen"];
  const statuses = ["confirmed", "confirmed", "pending", "confirmed", "completed"];
  return Array.from({ length: count }, (_, i) => {
    const start = now + (i - 2) * 2 * DAY + 10 * 3600000;
    return {
      appointmentId: `appt-${businessId}-${i + 1}`,
      businessId,
      callerName: names[i % names.length],
      callerPhone: `+1305${String(5560000 + i).padStart(7, "0")}`,
      serviceType: services[i % services.length],
      address: `${2000 + i * 33} Sunrise Blvd`,
      startTime: start,
      endTime: start + 3600000,
      status: statuses[i % statuses.length],
      notes: null,
      createdAt: now - (count - i) * 1.5 * DAY,
    };
  });
}

async function seedBusiness(biz, callCount, leadCount, apptCount, services) {
  const ref = db.collection("businesses").doc(biz.businessId);
  const existing = await ref.get();
  if (existing.exists) {
    console.log(`  ⚠ ${biz.businessId} already exists — updating...`);
  }
  await ref.set(biz);
  console.log(`  ✓ ${biz.businessName} (${biz.businessId})`);

  const calls = sampleCalls(biz.businessId, callCount);
  const leads = sampleLeads(biz.businessId, leadCount, services);
  const appts = sampleAppointments(biz.businessId, apptCount, services);

  const batch = db.batch();
  calls.forEach(c => batch.set(ref.collection("calls").doc(c.callId), c));
  leads.forEach(l => batch.set(ref.collection("leads").doc(l.leadId), l));
  appts.forEach(a => batch.set(ref.collection("appointments").doc(a.appointmentId), a));
  await batch.commit();

  console.log(`     ${callCount} calls · ${leadCount} leads · ${apptCount} appointments`);
}

async function main() {
  console.log("Seeding demo client businesses...\n");

  await seedBusiness(
    hvac, 31, 14, 9,
    ["AC repair", "Tune-up", "Emergency repair", "New installation", "Duct cleaning"]
  );

  await seedBusiness(
    landscaping, 18, 8, 6,
    ["Weekly maintenance", "Lawn mowing", "Irrigation repair", "Tree trimming", "Sod install"]
  );

  console.log("\n✅ Done! Two demo clients seeded.");
  console.log("   Refresh /admin/businesses to see them.");
  process.exit(0);
}

main().catch(err => { console.error("❌ Failed:", err); process.exit(1); });
