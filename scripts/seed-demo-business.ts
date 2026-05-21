// Seed demo business for manual testing
// Run with: npx ts-node scripts/seed-demo-business.ts

import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";
import type { BusinessConfig } from "../src/types";
import { getPlanPreset } from "../src/lib/ai/planPresets";
import { getVerticalTemplate } from "../src/lib/verticals/templates";

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
  path.join(process.cwd(), "firebase-service-account.json");

if (!fs.existsSync(serviceAccountPath)) {
  console.error(`Service account file not found at ${serviceAccountPath}`);
  console.error("Set FIREBASE_SERVICE_ACCOUNT_PATH or place file at project root");
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as any),
});

const db = admin.firestore();
const standardPreset = getPlanPreset("standard");
const roofingTemplate = getVerticalTemplate("roofing");

const demoBusiness: BusinessConfig = {
  businessId: "demo-roofing",
  businessName: "Apex Roofing",
  industry: "roofing",
  phoneNumber: process.env.TWILIO_PHONE_NUMBER || "+1 (000) 000-0000",
  serviceArea: ["Miami", "Coral Gables", "Doral", "Hialeah", "Kendall", "Homestead"],
  businessHours: {
    Monday: "08:00 - 17:00",
    Tuesday: "08:00 - 17:00",
    Wednesday: "08:00 - 17:00",
    Thursday: "08:00 - 17:00",
    Friday: "08:00 - 17:00",
    Saturday: "09:00 - 13:00",
    Sunday: "Closed",
  },
  approvedServices: roofingTemplate.approvedServices,
  approvedFaqs: roofingTemplate.approvedFaqs,
  emergencyRules: roofingTemplate.emergencyRules,
  bookingRules: roofingTemplate.bookingRules,
  disallowedTopics: roofingTemplate.disallowedTopics,
  escalationPhone: process.env.ESCALATION_PHONE || "+1 (305) 555-0000",
  notificationEmail: process.env.NOTIFICATION_EMAIL || "kwamwad@gmail.com",
  calendarProvider: "mock",
  planTier: standardPreset.planTier,
  aiProvider: "openai",
  liveModel: standardPreset.liveModel,
  backOfficeModel: standardPreset.backOfficeModel,
  agentName: roofingTemplate.agentName,
  agentIdentity: roofingTemplate.agentIdentity,
  greeting: roofingTemplate.greetingTemplate.replace("{businessName}", "Apex Roofing South Florida"),
  afterHoursGreeting: roofingTemplate.afterHoursGreetingTemplate.replace(
    "{businessName}",
    "Apex Roofing South Florida"
  ),
  agentVoice: standardPreset.agentVoice,
  agentTone: roofingTemplate.agentTone || standardPreset.agentTone,
  temperature: standardPreset.temperature,
  maxTokens: standardPreset.maxTokens,
  active: true,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

async function seedDatabase() {
  try {
    console.log("Seeding demo business...");

    // Create business document
    await db.collection("businesses").doc("demo-roofing").set(demoBusiness);
    console.log("✓ Created demo-roofing business");

    // Create empty subcollections
    await db
      .collection("businesses")
      .doc("demo-roofing")
      .collection("calls")
      .doc("_init")
      .set({ initialized: true });
    await db
      .collection("businesses")
      .doc("demo-roofing")
      .collection("calls")
      .doc("_init")
      .delete();
    console.log("✓ Created calls subcollection");

    await db
      .collection("businesses")
      .doc("demo-roofing")
      .collection("leads")
      .doc("_init")
      .set({ initialized: true });
    await db
      .collection("businesses")
      .doc("demo-roofing")
      .collection("leads")
      .doc("_init")
      .delete();
    console.log("✓ Created leads subcollection");

    await db
      .collection("businesses")
      .doc("demo-roofing")
      .collection("appointments")
      .doc("_init")
      .set({ initialized: true });
    await db
      .collection("businesses")
      .doc("demo-roofing")
      .collection("appointments")
      .doc("_init")
      .delete();
    console.log("✓ Created appointments subcollection");

    await db
      .collection("businesses")
      .doc("demo-roofing")
      .collection("agentActions")
      .doc("_init")
      .set({ initialized: true });
    await db
      .collection("businesses")
      .doc("demo-roofing")
      .collection("agentActions")
      .doc("_init")
      .delete();
    console.log("✓ Created agentActions subcollection");

    console.log("\nDemo seeding complete!");
    console.log("Business ID: demo-roofing");
    console.log("Business Name: Apex Roofing");
    process.exit(0);
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exit(1);
  }
}

seedDatabase();
