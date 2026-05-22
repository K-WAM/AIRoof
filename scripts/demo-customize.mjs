// Pre-demo customization: point the demo business at a prospect's email
// and update the greeting + company name so Alice represents their brand
// during the call.
//
// Usage:
//   node scripts/demo-customize.mjs <email> "<Company Name>"
//
// Example:
//   node scripts/demo-customize.mjs john@acmeroofing.com "Acme Roofing"
//
// After the demo, reset with:
//   node scripts/demo-customize.mjs --reset

import admin from "firebase-admin";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(readFileSync(join(__dirname, "..", "firebase-service-account.json"), "utf-8"));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const BUSINESS_ID = "demo-roofing";
const DEFAULT_EMAIL = "kwamwad@gmail.com";
const DEFAULT_NAME = "Apex Roofing South Florida";
const DEFAULT_GREETING = "Hello. Thanks for calling Apex Roofing. This is Alice. How can I help?";

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_ASSISTANT_ID = "9267a84a-0f4f-416b-a328-1dc539f5265e";

const [arg1, arg2] = process.argv.slice(2);

if (arg1 === "--reset") {
  await customize(DEFAULT_EMAIL, DEFAULT_NAME, DEFAULT_GREETING);
  console.log("\n✓ Reset to defaults");
  process.exit(0);
}

if (!arg1 || !arg2) {
  console.error('Usage: node scripts/demo-customize.mjs <email> "<Company Name>"');
  console.error('       node scripts/demo-customize.mjs --reset');
  process.exit(1);
}

const email = arg1;
const companyName = arg2;
const greeting = `Hello. Thanks for calling ${companyName}. This is Alice. How can I help?`;

await customize(email, companyName, greeting);
console.log(`\n✓ Demo configured for ${companyName} → ${email}`);
console.log(`  Have them call: +1 (754) 283-7658`);
console.log(`  After the demo: node scripts/demo-customize.mjs --reset`);
process.exit(0);

async function customize(email, name, greeting) {
  // 1. Update Firestore (notification email + business name in subject lines)
  await db.collection("businesses").doc(BUSINESS_ID).update({
    notificationEmail: email,
    businessName: name,
    greeting,
    updatedAt: Date.now(),
  });
  console.log(`  Firestore: notificationEmail = ${email}`);
  console.log(`  Firestore: businessName     = ${name}`);

  // 2. Update Vapi assistant's first message via their API
  if (!VAPI_API_KEY) {
    console.warn("\n⚠ VAPI_API_KEY not set locally — skipping Vapi first-message update.");
    console.warn("  To enable, set it in your shell: $env:VAPI_API_KEY=\"<key>\"");
    console.warn("  Or manually update Alice's First Message in Vapi UI to:");
    console.warn(`    ${greeting}`);
    return;
  }

  const res = await fetch(`https://api.vapi.ai/assistant/${VAPI_ASSISTANT_ID}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${VAPI_API_KEY}`,
    },
    body: JSON.stringify({ firstMessage: greeting }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`  ✗ Vapi update failed: ${res.status} ${body}`);
    return;
  }
  console.log(`  Vapi:      firstMessage updated`);
}
