// Delete test/junk business documents from Firestore
// Run with: node scripts/cleanup-test-businesses.mjs

import admin from "firebase-admin";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(readFileSync(join(__dirname, "..", "firebase-service-account.json"), "utf-8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const TO_DELETE = ["ra2", "osiris", "luxor"];
const SUBCOLLECTIONS = ["calls", "leads", "appointments", "agentActions", "faqSuggestions"];

async function deleteBusinessAndSubcollections(bizId) {
  for (const sub of SUBCOLLECTIONS) {
    const snap = await db.collection(`businesses/${bizId}/${sub}`).get();
    if (snap.size > 0) {
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      console.log(`  deleted ${snap.size} docs from ${bizId}/${sub}`);
    }
  }
  await db.collection("businesses").doc(bizId).delete();
  console.log(`  ✓ deleted businesses/${bizId}`);
}

async function main() {
  for (const bizId of TO_DELETE) {
    const doc = await db.collection("businesses").doc(bizId).get();
    if (!doc.exists) {
      console.log(`  skip ${bizId} (not found)`);
      continue;
    }
    console.log(`Deleting ${bizId}...`);
    await deleteBusinessAndSubcollections(bizId);
  }
  console.log("\n✅ Cleanup complete.");
  process.exit(0);
}

main().catch(err => { console.error("❌", err); process.exit(1); });
