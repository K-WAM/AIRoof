// Seed demo-roofing with realistic calls, leads, and appointments
// Run with: node scripts/seed-demo-activity.mjs

import admin from "firebase-admin";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(__dirname, "..", "firebase-service-account.json"), "utf-8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const BIZ = "demo-roofing";
const now = Date.now();
const H = 3600000;
const D = 86400000;

// ── Calls (with transcripts + summaries) ─────────────────────────────────────
const calls = [
  {
    callId: "call-001",
    status: "completed", duration: 187,
    startedAt: now - 1 * D - 2 * H, endedAt: now - 1 * D - 2 * H + 187000,
    summary: "Caller reported shingle damage after last night's storm. Lead captured. Inspection booked for Thursday 10am.",
    messages: [
      { role: "agent", text: "Thanks for calling Apex Roofing South Florida, this is Alice. How can I help?", timestamp: now - 1 * D - 2 * H },
      { role: "caller", text: "Hi yeah my roof took some damage in the storm last night. I've got some missing shingles.", timestamp: now - 1 * D - 2 * H + 8000 },
      { role: "agent", text: "I'm sorry to hear that — let me help get someone out to look at it. Can I get your name and address?", timestamp: now - 1 * D - 2 * H + 12000 },
      { role: "caller", text: "Sure, it's Carlos Mendez. 4821 Coral Way, Miami.", timestamp: now - 1 * D - 2 * H + 18000 },
      { role: "agent", text: "Thank you Carlos. Are you seeing any water getting in, or is this just surface shingle damage?", timestamp: now - 1 * D - 2 * H + 24000 },
      { role: "caller", text: "Just surface as far as I can tell. But there's a section near the chimney that looks pretty rough.", timestamp: now - 1 * D - 2 * H + 31000 },
      { role: "agent", text: "Got it. I've got Thursday at 10am available for an inspection. Does that work for you?", timestamp: now - 1 * D - 2 * H + 38000 },
      { role: "caller", text: "Thursday 10 works great.", timestamp: now - 1 * D - 2 * H + 44000 },
      { role: "agent", text: "Perfect, I've booked that for you. You'll get a confirmation email shortly. Is there anything else?", timestamp: now - 1 * D - 2 * H + 50000 },
      { role: "caller", text: "No that's it, thank you.", timestamp: now - 1 * D - 2 * H + 56000 },
    ],
  },
  {
    callId: "call-002",
    status: "escalated", duration: 95,
    startedAt: now - 1 * D - 5 * H, endedAt: now - 1 * D - 5 * H + 95000,
    summary: "Caller reporting active water entry through roof. Emergency escalated to on-call technician.",
    messages: [
      { role: "agent", text: "Thanks for calling Apex Roofing, this is Alice. How can I help?", timestamp: now - 1 * D - 5 * H },
      { role: "caller", text: "I need someone NOW. Water is coming through my ceiling, it's dripping on my furniture.", timestamp: now - 1 * D - 5 * H + 6000 },
      { role: "agent", text: "I understand — active water entry is an emergency. I'm escalating this right now. Can I get your address?", timestamp: now - 1 * D - 5 * H + 10000 },
      { role: "caller", text: "7203 Bird Road, Miami. Please hurry.", timestamp: now - 1 * D - 5 * H + 16000 },
      { role: "agent", text: "I've alerted our emergency team. They'll call you back within 15 minutes. Is there anything leaking on electrical fixtures?", timestamp: now - 1 * D - 5 * H + 22000 },
      { role: "caller", text: "No, it's in the living room. Just the drywall.", timestamp: now - 1 * D - 5 * H + 28000 },
      { role: "agent", text: "Good. Keep some towels under it and stay clear of the wet area. Our team is on their way to you.", timestamp: now - 1 * D - 5 * H + 34000 },
    ],
  },
  {
    callId: "call-003",
    status: "completed", duration: 142,
    startedAt: now - 2 * D - 1 * H, endedAt: now - 2 * D - 1 * H + 142000,
    summary: "Caller inquired about metal roofing cost and timeline. FAQ answered. Lead captured for follow-up quote.",
    messages: [
      { role: "agent", text: "Thanks for calling Apex Roofing, this is Alice!", timestamp: now - 2 * D - 1 * H },
      { role: "caller", text: "Hi, I'm interested in getting a metal roof installed. How long does it take and what's the ballpark cost?", timestamp: now - 2 * D - 1 * H + 8000 },
      { role: "agent", text: "Great question. Metal roofing timelines depend on the size of your home and current roof, but most installs run 2 to 4 days. For pricing we'd need to do an inspection first — can I book a free estimate for you?", timestamp: now - 2 * D - 1 * H + 14000 },
      { role: "caller", text: "Sure, I'm free this weekend.", timestamp: now - 2 * D - 1 * H + 22000 },
      { role: "agent", text: "We have Saturday at 9am and 1pm available. Which works better?", timestamp: now - 2 * D - 1 * H + 28000 },
      { role: "caller", text: "9am Saturday works.", timestamp: now - 2 * D - 1 * H + 33000 },
      { role: "agent", text: "Booked! Can I get your name and address for the appointment?", timestamp: now - 2 * D - 1 * H + 38000 },
      { role: "caller", text: "Jennifer Walsh, 321 Brickell Ave, Miami.", timestamp: now - 2 * D - 1 * H + 44000 },
    ],
  },
  {
    callId: "call-004",
    status: "completed", duration: 68,
    startedAt: now - 3 * D, endedAt: now - 3 * D + 68000,
    summary: "Caller confirmed upcoming appointment time. No changes needed.",
    messages: [
      { role: "agent", text: "Apex Roofing, this is Alice!", timestamp: now - 3 * D },
      { role: "caller", text: "Hi, I just wanted to confirm my appointment tomorrow at 2pm.", timestamp: now - 3 * D + 7000 },
      { role: "agent", text: "Let me check that for you — can I get your name?", timestamp: now - 3 * D + 12000 },
      { role: "caller", text: "Robert Kim.", timestamp: now - 3 * D + 16000 },
      { role: "agent", text: "Yes Robert, I show you confirmed for tomorrow at 2pm at your address on SW 8th. You're all set!", timestamp: now - 3 * D + 22000 },
      { role: "caller", text: "Great, thank you.", timestamp: now - 3 * D + 28000 },
    ],
  },
  {
    callId: "call-005",
    status: "completed", duration: 211,
    startedAt: now - 4 * D - 3 * H, endedAt: now - 4 * D - 3 * H + 211000,
    summary: "Caller requested inspection for gutter damage and possible leak. Inspection scheduled for Monday morning.",
    messages: [
      { role: "agent", text: "Thanks for calling Apex Roofing, this is Alice. How can I help?", timestamp: now - 4 * D - 3 * H },
      { role: "caller", text: "Yeah I think my gutters might be pulling away from the fascia. And there might be a small leak somewhere because my attic smells musty.", timestamp: now - 4 * D - 3 * H + 10000 },
      { role: "agent", text: "That musty smell could definitely indicate moisture. We'd want to check both the gutters and do a full roof scan. I can book a comprehensive inspection — would Monday work?", timestamp: now - 4 * D - 3 * H + 18000 },
      { role: "caller", text: "Monday morning would be great.", timestamp: now - 4 * D - 3 * H + 24000 },
      { role: "agent", text: "I have 8am available. Does that work?", timestamp: now - 4 * D - 3 * H + 29000 },
      { role: "caller", text: "8am is perfect. I'm Maria Santos, at 5502 SW 137th Avenue.", timestamp: now - 4 * D - 3 * H + 35000 },
    ],
  },
  {
    callId: "call-006",
    status: "completed", duration: 55,
    startedAt: now - 5 * D - 2 * H, endedAt: now - 5 * D - 2 * H + 55000,
    summary: "Out-of-service-area inquiry from caller in Key West. Politely declined and directed to local providers.",
    messages: [
      { role: "agent", text: "Apex Roofing, this is Alice!", timestamp: now - 5 * D - 2 * H },
      { role: "caller", text: "Hi, are you able to come out to Key West for a roof inspection?", timestamp: now - 5 * D - 2 * H + 6000 },
      { role: "agent", text: "I appreciate you reaching out! Unfortunately our service area covers Miami-Dade — Key West would be a bit too far for us right now. I'd suggest searching for licensed roofers in Monroe County. Is there anything else I can help with?", timestamp: now - 5 * D - 2 * H + 12000 },
      { role: "caller", text: "No problem, thanks anyway.", timestamp: now - 5 * D - 2 * H + 20000 },
    ],
  },
  {
    callId: "call-007",
    status: "completed", duration: 165,
    startedAt: now - 6 * D, endedAt: now - 6 * D + 165000,
    summary: "Insurance claim follow-up. Caller wants a written inspection report for their adjuster. Scheduled next-day inspection.",
    messages: [
      { role: "agent", text: "Apex Roofing, this is Alice!", timestamp: now - 6 * D },
      { role: "caller", text: "Hi, my insurance company is asking for an inspection report for storm damage. Can you come out and provide that?", timestamp: now - 6 * D + 8000 },
      { role: "agent", text: "Absolutely — we work with insurance claims frequently and can provide a full written assessment. Can I get your details?", timestamp: now - 6 * D + 15000 },
      { role: "caller", text: "James Patel, 9871 Kendall Drive.", timestamp: now - 6 * D + 21000 },
      { role: "agent", text: "Thanks James. I have tomorrow at 11am available. Does that work?", timestamp: now - 6 * D + 27000 },
      { role: "caller", text: "Yes, 11am tomorrow is great.", timestamp: now - 6 * D + 33000 },
    ],
  },
  {
    callId: "call-008",
    status: "missed", duration: 0,
    startedAt: now - 7 * D - 6 * H, endedAt: now - 7 * D - 6 * H,
    summary: null, messages: [],
  },
  {
    callId: "call-009",
    status: "completed", duration: 178,
    startedAt: now - 8 * D, endedAt: now - 8 * D + 178000,
    summary: "Caller interested in getting a full roof replacement quote. Large single-family home. Appointment set.",
    messages: [
      { role: "agent", text: "Apex Roofing, this is Alice!", timestamp: now - 8 * D },
      { role: "caller", text: "I've been putting off replacing my roof for two years now. It's about 2800 square feet, 20 years old. Time to bite the bullet.", timestamp: now - 8 * D + 9000 },
      { role: "agent", text: "Smart move before hurricane season! For a full replacement at that size we'd want to do a detailed assessment first. I can schedule a free estimate — what's your availability?", timestamp: now - 8 * D + 17000 },
      { role: "caller", text: "Weekday mornings work best.", timestamp: now - 8 * D + 23000 },
      { role: "agent", text: "I have next Tuesday at 9am. Your name and address?", timestamp: now - 8 * D + 28000 },
      { role: "caller", text: "Linda Nguyen, 3301 Coral Gables Drive.", timestamp: now - 8 * D + 34000 },
    ],
  },
  {
    callId: "call-010",
    status: "completed", duration: 91,
    startedAt: now - 10 * D, endedAt: now - 10 * D + 91000,
    summary: "Caller asked about service area for Homestead. Confirmed coverage. Lead captured.",
    messages: [
      { role: "agent", text: "Apex Roofing, this is Alice!", timestamp: now - 10 * D },
      { role: "caller", text: "Do you guys come out to Homestead?", timestamp: now - 10 * D + 7000 },
      { role: "agent", text: "Yes — Homestead is in our service area. What kind of work are you looking for?", timestamp: now - 10 * D + 12000 },
      { role: "caller", text: "I need a few sections of shingles replaced. Storm peeled them back.", timestamp: now - 10 * D + 18000 },
      { role: "agent", text: "We can definitely help with that. Can I get your name and address to book a time?", timestamp: now - 10 * D + 24000 },
      { role: "caller", text: "David Chen, 14400 SW 288th Street.", timestamp: now - 10 * D + 30000 },
    ],
  },
];

// ── Leads ────────────────────────────────────────────────────────────────────
const leads = [
  { leadId: "lead-001", callerName: "Carlos Mendez", callerPhone: "+13055550101", serviceRequested: "Storm damage inspection", address: "4821 Coral Way, Miami", urgency: "urgent", status: "booked", notes: "Missing shingles near chimney after storm.", createdAt: now - 1 * D - 2 * H },
  { leadId: "lead-002", callerName: "Unknown", callerPhone: "+13055550102", serviceRequested: "Emergency water leak", address: "7203 Bird Road, Miami", urgency: "urgent", status: "contacted", notes: "Active water entry — escalated to emergency team.", createdAt: now - 1 * D - 5 * H },
  { leadId: "lead-003", callerName: "Jennifer Walsh", callerPhone: "+13055550103", serviceRequested: "Metal roofing estimate", address: "321 Brickell Ave, Miami", urgency: "standard", status: "booked", notes: "Interested in full metal roof replacement.", createdAt: now - 2 * D - 1 * H },
  { leadId: "lead-004", callerName: "Maria Santos", callerPhone: "+13055550104", serviceRequested: "Gutter inspection + leak check", address: "5502 SW 137th Ave, Miami", urgency: "standard", status: "booked", notes: "Musty attic smell — possible moisture intrusion.", createdAt: now - 4 * D - 3 * H },
  { leadId: "lead-005", callerName: "James Patel", callerPhone: "+13055550105", serviceRequested: "Insurance inspection report", address: "9871 Kendall Drive, Miami", urgency: "standard", status: "booked", notes: "Adjuster needs written assessment.", createdAt: now - 6 * D },
  { leadId: "lead-006", callerName: "Linda Nguyen", callerPhone: "+13055550106", serviceRequested: "Full roof replacement estimate", address: "3301 Coral Gables Drive", urgency: "standard", status: "new", notes: "2800 sqft, 20-year-old roof. Pre-hurricane season replacement.", createdAt: now - 8 * D },
  { leadId: "lead-007", callerName: "David Chen", callerPhone: "+13055550107", serviceRequested: "Shingle repair", address: "14400 SW 288th St, Homestead", urgency: "standard", status: "contacted", notes: "Storm peeled back multiple shingle sections.", createdAt: now - 10 * D },
  { leadId: "lead-008", callerName: "Patricia Okafor", callerPhone: "+13055550108", serviceRequested: "Roof inspection", address: "1802 Alhambra Plaza, Coral Gables", urgency: "standard", status: "new", notes: "Buying property — wants pre-purchase inspection.", createdAt: now - 12 * D },
];

// ── Appointments ─────────────────────────────────────────────────────────────
const appointments = [
  { appointmentId: "appt-001", callerName: "Carlos Mendez", callerPhone: "+13055550101", serviceType: "Storm damage inspection", address: "4821 Coral Way, Miami", startTime: now + 2 * D + 10 * H, endTime: now + 2 * D + 11 * H, status: "confirmed", notes: "Missing shingles near chimney." },
  { appointmentId: "appt-002", callerName: "Jennifer Walsh", callerPhone: "+13055550103", serviceType: "Metal roofing estimate", address: "321 Brickell Ave, Miami", startTime: now + 3 * D + 9 * H, endTime: now + 3 * D + 10 * H, status: "confirmed", notes: null },
  { appointmentId: "appt-003", callerName: "Maria Santos", callerPhone: "+13055550104", serviceType: "Gutter + leak inspection", address: "5502 SW 137th Ave", startTime: now + 1 * D + 8 * H, endTime: now + 1 * D + 9 * H, status: "confirmed", notes: "Bring moisture meter." },
  { appointmentId: "appt-004", callerName: "James Patel", callerPhone: "+13055550105", serviceType: "Insurance inspection report", address: "9871 Kendall Drive", startTime: now + 1 * D + 11 * H, endTime: now + 1 * D + 12 * H, status: "confirmed", notes: "Adjuster report required — bring camera." },
  { appointmentId: "appt-005", callerName: "Robert Kim", callerPhone: "+13055550109", serviceType: "Annual roof inspection", address: "5501 SW 8th Street, Miami", startTime: now - 1 * D + 14 * H, endTime: now - 1 * D + 15 * H, status: "completed", notes: null },
  { appointmentId: "appt-006", callerName: "Linda Nguyen", callerPhone: "+13055550106", serviceType: "Full replacement estimate", address: "3301 Coral Gables Drive", startTime: now + 6 * D + 9 * H, endTime: now + 6 * D + 10 * H, status: "pending", notes: "2800 sqft — full inspection needed." },
];

async function main() {
  console.log("Seeding demo-roofing activity...\n");

  const bizRef = db.collection("businesses").doc(BIZ);

  // Clear existing activity
  for (const sub of ["calls", "leads", "appointments"]) {
    const snap = await bizRef.collection(sub).get();
    if (snap.size > 0) {
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      console.log(`  cleared ${snap.size} old ${sub}`);
    }
  }

  // Write new data
  const batch = db.batch();
  calls.forEach(c => {
    batch.set(bizRef.collection("calls").doc(c.callId), { ...c, businessId: BIZ, createdAt: c.startedAt });
  });
  leads.forEach(l => {
    batch.set(bizRef.collection("leads").doc(l.leadId), { ...l, businessId: BIZ, updatedAt: l.createdAt });
  });
  appointments.forEach(a => {
    batch.set(bizRef.collection("appointments").doc(a.appointmentId), { ...a, businessId: BIZ, createdAt: a.startTime - D });
  });
  await batch.commit();

  console.log(`  ✓ ${calls.length} calls with transcripts`);
  console.log(`  ✓ ${leads.length} leads`);
  console.log(`  ✓ ${appointments.length} appointments (mix of upcoming + past)`);
  console.log("\n✅ Done. Open /company/dashboard?preview=demo-roofing to see it.");
  process.exit(0);
}

main().catch(err => { console.error("❌", err); process.exit(1); });
