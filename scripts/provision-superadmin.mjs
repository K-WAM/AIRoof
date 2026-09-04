// One-time script to provision the superadmin account in Firebase.
// Sets the businessUsers/{uid} document with superadmin: true so Firestore
// rules grant full access without needing a custom Auth claim.
//
// Usage: node scripts/provision-superadmin.mjs [email]
//   Default email: connect@luxordev.com

import admin from "firebase-admin";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, "..", "firebase-service-account.json"), "utf-8")
);

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const SUPERADMIN_EMAIL = process.argv[2] ?? "connect@luxordev.com";

async function provision() {
  console.log(`Provisioning superadmin: ${SUPERADMIN_EMAIL}`);

  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(SUPERADMIN_EMAIL);
    console.log(`✓ Found Firebase Auth user: ${userRecord.uid}`);
  } catch {
    console.error(`❌ No Firebase Auth user found for ${SUPERADMIN_EMAIL}`);
    console.error("   Sign up / log in at least once via the app first.");
    process.exit(1);
  }

  // Set custom claim for token-based rule check (fastest path)
  await admin.auth().setCustomUserClaims(userRecord.uid, { superadmin: true });
  console.log("✓ Set custom Auth claim: superadmin=true");

  // Write businessUsers document (fallback path used by Firestore rules & AuthContext)
  await db.collection("businessUsers").doc(userRecord.uid).set(
    {
      uid: userRecord.uid,
      email: SUPERADMIN_EMAIL,
      superadmin: true,
      role: "superadmin",
      businessId: "demo-roofing",
      businessName: "Apex Roofing South Florida",
      updatedAt: Date.now(),
    },
    { merge: true }
  );
  console.log("✓ businessUsers document written");

  console.log("\n✅ Done. Sign out and back in for the token to refresh.");
  process.exit(0);
}

provision().catch((err) => {
  console.error("❌ Failed:", err.message ?? err);
  process.exit(1);
});
