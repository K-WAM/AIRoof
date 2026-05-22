// Run ONCE after you first sign in with connect@luxordev.com:
//   node scripts/grant-superadmin.mjs <uid>
//
// Get your UID from Firebase Console → Authentication → Users → copy UID column

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

const uid = process.argv[2];
if (!uid) {
  console.error("Usage: node scripts/grant-superadmin.mjs <firebase-uid>");
  process.exit(1);
}

await db.collection("businessUsers").doc(uid).set({
  uid,
  email: "connect@luxordev.com",
  role: "superadmin",
  superadmin: true,
  createdAt: Date.now(),
}, { merge: true });

console.log(`✅ Superadmin granted for UID: ${uid}`);
console.log("   You can now access /admin after signing in with connect@luxordev.com");
process.exit(0);
