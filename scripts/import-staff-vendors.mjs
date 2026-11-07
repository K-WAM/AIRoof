#!/usr/bin/env node
// Import staff (Jobba "Company contacts.csv", crew leads from "Crews.csv") and vendors ("vendors.csv") into one workspace.
//
// Usage:
//   node scripts/import-staff-vendors.mjs --business=roofdoctors
//   node scripts/import-staff-vendors.mjs --business=roofdoctors --only=staff
//   node scripts/import-staff-vendors.mjs --business=roofdoctors --dir=<export directory>
//   node scripts/import-staff-vendors.mjs --business=roofdoctors --apply --confirm=roofdoctors
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/import-staff-vendors.mjs --business=e2e-example
//   vercel env run -e production -- node scripts/import-staff-vendors.mjs --business=roofdoctors --apply --confirm=roofdoctors
//
// Safety: dry run unless --apply --confirm=<business>; allowed ids are roofdoctors and e2e-* on the emulator; demo-* is
// always refused; writing needs the evaluation guard on; never prints a name, email or phone; never sends anything;
// writes only businesses/{id}/staff and businesses/{id}/vendors in batches of at most 400; safe to run twice.
import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeCsvBuffer, parseCsv } from "./lib/jobba-import.mjs";
import { cleanEmail, mapStaff, mapVendors, planWrites, staffIdFor, vendorIdFor } from "./lib/staff-vendors.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).filter(x => x.startsWith("--")).map(x => { const [key, ...value] = x.slice(2).split("="); return [key, value.length ? value.join("=") : true]; }));
const business = args.business;
const apply = args.apply === true;
const only = args.only;
if (only !== undefined && only !== "staff" && only !== "vendors") {
  console.error("Invalid --only value. Use --only=staff or --only=vendors.");
  process.exit(1);
}
if (typeof business !== "string" || business.startsWith("demo-") || !(business === "roofdoctors" || (process.env.FIRESTORE_EMULATOR_HOST && business.startsWith("e2e-"))) || (apply && args.confirm !== business)) {
  console.error("Invalid business or confirmation. Use --business=<allowed id> and --apply --confirm=<same id> to write."); process.exit(1);
}
const dir = resolve(root, typeof args.dir === "string" ? args.dir : "client-resources/roofdoctors/02-data-export-jobba");
const wantStaff = only !== "vendors";
const wantVendors = only !== "staff";

const text = value => String(value ?? "").trim();
const enabledRow = row => text(row?.Enabled).toLowerCase() === "yes";
const fullNameOf = row => `${text(row?.["First Name"])} ${text(row?.["Last Name"])}`.replace(/\s+/g, " ").trim();
const readCsv = name => parseCsv(decodeCsvBuffer(readFileSync(join(dir, name))));
const countAction = (plans, action) => plans.filter(plan => plan.action === action).length;

async function writePlans(db, biz, collection, plans) {
  const writes = plans.filter(plan => plan.action !== "skip");
  for (let index = 0; index < writes.length; index += 400) {
    const batch = db.batch();
    for (const plan of writes.slice(index, index + 400)) {
      const ref = biz.collection(collection).doc(plan.id);
      if (plan.action === "create") batch.set(ref, plan.fields);
      else batch.update(ref, plan.fields);
    }
    await batch.commit();
  }
}

async function main() {
  if (process.env.FIRESTORE_EMULATOR_HOST) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-e2e" });
  else {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || readFileSync(join(root, "firebase-service-account.json"), "utf8");
    let account; try { account = JSON.parse(raw); } catch { throw new Error("The service account JSON could not be parsed (value not shown)."); }
    admin.initializeApp({ credential: admin.credential.cert(account) });
  }
  const db = admin.firestore(), biz = db.collection("businesses").doc(business), snap = await biz.get();
  if (!snap.exists) throw new Error("Business document does not exist.");
  const guardOn = Array.isArray(snap.data().outboundEmailAllowlist);
  console.log(`Evaluation guard: ${guardOn ? "ON" : "OFF"}`);
  if (apply && !guardOn) throw new Error("Evaluation guard is OFF for this business. Set outboundEmailAllowlist and outboundPhoneAllowlist on it before importing.");

  const now = Date.now();
  const contactRows = wantStaff ? readCsv("Company contacts.csv") : [];
  const crewRows = wantStaff ? readCsv("Crews.csv") : [];
  const vendorRows = wantVendors ? readCsv("vendors.csv") : [];

  let staff = [], staffPlans = [], notes = [];
  if (wantStaff) {
    const crewDocs = await biz.collection("crews").get();
    const existingCrews = crewDocs.docs
      .filter(doc => text(doc.data().name))
      .map(doc => ({ crewId: doc.id, name: text(doc.data().name) }));
    const mapped = mapStaff(contactRows, crewRows, existingCrews, now);
    staff = mapped.staff;
    notes = mapped.notes;
    const existingStaff = new Map();
    for (const doc of (await biz.collection("staff").get()).docs) existingStaff.set(doc.id, doc.data());
    staffPlans = planWrites(staff, existingStaff);

    const breakdown = new Map();
    for (const record of staff) if (record.userType) breakdown.set(record.userType, (breakdown.get(record.userType) ?? 0) + 1);
    const guesses = staff.filter(record => record.crewProvenance?.origin === "luxor-sample");
    const byNameGuess = guesses.filter(record => record.crewProvenance.note === "Matched by crew name; confirm in the Team form").length;
    const droppedEmails = contactRows.filter(row => enabledRow(row) && text(row.Email) && !cleanEmail(row.Email)).length;
    const pseudoSkipped = contactRows.filter(row => enabledRow(row) && /power\s*board/i.test(fullNameOf(row))).length;

    console.log(`Staff: create ${countAction(staffPlans, "create")} / fill ${countAction(staffPlans, "fill")} / skip ${countAction(staffPlans, "skip")}`);
    console.log(`userType: ${[...breakdown.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([type, count]) => `${type} ${count}`).join(", ") || "none"}`);
    console.log(`crew leads set ${staff.filter(record => record.crewLead).length}`);
    console.log(`crew guesses ${guesses.length} (by name match ${byNameGuess}, round-robin ${guesses.length - byNameGuess})`);
    console.log(`emails dropped ${droppedEmails}`);
    console.log(`pseudo-users skipped ${pseudoSkipped}`);
    const staffById = new Map(staff.map(record => [record.staffId, record]));
    const planById = new Map(staffPlans.map(plan => [plan.id, plan]));
    const seen = new Set();
    contactRows.forEach((row, index) => {
      if (!enabledRow(row)) return;
      const name = fullNameOf(row);
      if (!name || /power\s*board/i.test(name)) return;
      const id = staffIdFor(name);
      if (seen.has(id)) return;
      seen.add(id);
      const record = staffById.get(id), plan = planById.get(id);
      console.log(`  contact row ${index + 2}: ${plan?.action ?? "skip"} userType=${record?.userType ?? "-"} crewGuess=${record?.crewProvenance ? "yes" : "no"}`);
    });
    if (notes.length) console.log(`notes: ${notes.length}`);
  }

  let vendors = [], vendorPlans = [];
  if (wantVendors) {
    vendors = mapVendors(vendorRows, now);
    const existingVendors = new Map();
    for (const doc of (await biz.collection("vendors").get()).docs) existingVendors.set(doc.id, doc.data());
    vendorPlans = planWrites(vendors, existingVendors);
    console.log(`Vendors: create ${countAction(vendorPlans, "create")} / fill ${countAction(vendorPlans, "fill")} / skip ${countAction(vendorPlans, "skip")}`);
    const planById = new Map(vendorPlans.map(plan => [plan.id, plan]));
    const seen = new Set();
    vendorRows.forEach((row, index) => {
      const name = text(row?.Name);
      if (!name) return;
      const id = vendorIdFor(name);
      if (seen.has(id)) return;
      seen.add(id);
      console.log(`  vendor row ${index + 2}: ${planById.get(id)?.action ?? "skip"}`);
    });
  }

  if (apply) {
    if (wantStaff) await writePlans(db, biz, "staff", staffPlans);
    if (wantVendors) await writePlans(db, biz, "vendors", vendorPlans);
    console.log("Applied.");
  } else {
    console.log("Dry run: nothing written. Add --apply --confirm=<business> to write.");
  }
  await admin.app().delete();
}

main().catch((err) => { console.error(`Import failed: ${String(err?.message ?? err).slice(0, 300)}`); process.exitCode = 1; });
