#!/usr/bin/env node
// Sample work for a client's blank screens (T-376): 7 jobs, 1 phone booking and 2 requests at the client's real
// properties, on their crews, priced from their catalog, all marked provenance.origin "luxor-sample" (Example tag;
// Admin -> Clients -> Edit -> Sample data removes them). What gets written: scripts/lib/sample-work.mjs.
//
// Usage:
//   node scripts/seed-sample-work.mjs --business=roofdoctors                       dry run: prints the plan
//   node scripts/seed-sample-work.mjs --business=roofdoctors --day=2026-11-13      lay it out around that day
//   node scripts/seed-sample-work.mjs --business=roofdoctors --replace ...         start over (see below)
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-sample-work.mjs --business=e2e-roofing --apply --confirm=e2e-roofing
//   vercel env run -e production -- node scripts/seed-sample-work.mjs --business=roofdoctors --apply --confirm=roofdoctors
//
// Timing: the default "today" of the story is today if it is an open day and before 5 pm (business time), else the
// next open day. Run it the evening before a demo (or that morning) so this week's schedule is around the demo.
//
// Safety: dry run unless --apply --confirm=<business>; allowed ids are roofdoctors and e2e-* on the emulator; demo-* is
// always refused; roofing only (the sample wording is roofing); in production writing needs the evaluation guard ON
// (outboundEmailAllowlist), so a demo click on Send can never reach a real customer. Refuses when sample work already
// exists unless --replace, which first removes the earlier sample jobs / bookings / requests and everything made from
// them — the same rules as src/lib/sampleData/scan.ts findSampleDependents — and nothing else (not the client's
// records, not other samples such as guessed crews). Writes jobs + their notes, the booking, the requests and
// jobCounter in one transaction. Never writes a customer record. Prints no phone numbers or emails.
import admin from "firebase-admin";
import { serviceAccount, ScriptError } from "./lib/adminCredential.mjs";
import { buildSampleWork, describeSampleWork } from "./lib/sample-work.mjs";

const args = Object.fromEntries(process.argv.slice(2).filter((x) => x.startsWith("--")).map((x) => { const [key, ...value] = x.slice(2).split("="); return [key, value.length ? value.join("=") : true]; }));
const business = args.business;
const apply = args.apply === true;
const replace = args.replace === true;
const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
if (typeof business !== "string" || business.startsWith("demo-") || !(business === "roofdoctors" || (emulator && business.startsWith("e2e-"))) || (apply && args.confirm !== business)) {
  console.error("Invalid business or confirmation. Use --business=<allowed id> and --apply --confirm=<same id> to write.");
  process.exit(1);
}
if (args.day !== undefined && typeof args.day !== "string") { console.error("--day needs a value: --day=YYYY-MM-DD"); process.exit(1); }

const SAMPLE = "luxor-sample";
const JOB_COUNT = 7;

/** Earlier sample work and what was made from it (mirror of src/lib/sampleData/scan.ts findSampleDependents). */
async function existingSampleWork(db, biz) {
  const ids = async (name) => (await biz.collection(name).where("provenance.origin", "==", SAMPLE).get()).docs.map((d) => d.id);
  const [jobs, appointments, leads] = await Promise.all([ids("jobs"), ids("appointments"), ids("leads")]);
  const matching = async (collection, field, values) => {
    const found = new Set();
    for (const value of values) for (const doc of (await biz.collection(collection).where(field, "==", value).get()).docs) found.add(doc.id);
    return [...found];
  };
  const [invoices, quotes, punches, schedulingLocks, markersByJob] = await Promise.all([
    matching("invoices", "jobId", jobs), matching("quotes", "jobId", jobs), matching("punches", "jobId", jobs),
    matching("schedulingLocks", "entityId", [...jobs, ...appointments]), matching("requestJobs", "jobId", jobs),
  ]);
  const requestJobs = new Set(markersByJob);
  const markerIds = [...appointments.map((id) => `appointment_${id}`), ...leads.map((id) => `lead_${id}`)];
  if (markerIds.length) for (const snap of await db.getAll(...markerIds.map((id) => biz.collection("requestJobs").doc(id)))) if (snap.exists) requestJobs.add(snap.id);
  const fieldLinkIndex = [], fieldLinks = new Set();
  for (const jobId of jobs) {
    const index = await db.collection("fieldJobLinkIndex").doc(`${biz.id}__${jobId}`).get();
    if (index.exists) fieldLinkIndex.push(index.id);
    for (const doc of (await db.collection("fieldJobLinks").where("jobId", "==", jobId).get()).docs) if (doc.data().businessId === biz.id) fieldLinks.add(doc.id);
  }
  return { jobs, appointments, leads, dependents: { invoices, quotes, punches, schedulingLocks, requestJobs: [...requestJobs], fieldLinkIndex, fieldLinks: [...fieldLinks] } };
}

async function removeSampleWork(db, biz, found) {
  const refs = [
    ...found.dependents.invoices.map((id) => biz.collection("invoices").doc(id)),
    ...found.dependents.quotes.map((id) => biz.collection("quotes").doc(id)),
    ...found.dependents.punches.map((id) => biz.collection("punches").doc(id)),
    ...found.dependents.schedulingLocks.map((id) => biz.collection("schedulingLocks").doc(id)),
    ...found.dependents.requestJobs.map((id) => biz.collection("requestJobs").doc(id)),
    ...found.dependents.fieldLinkIndex.map((id) => db.collection("fieldJobLinkIndex").doc(id)),
    ...found.dependents.fieldLinks.map((id) => db.collection("fieldJobLinks").doc(id)),
    ...found.appointments.map((id) => biz.collection("appointments").doc(id)),
    ...found.leads.map((id) => biz.collection("leads").doc(id)),
  ];
  for (let start = 0; start < refs.length; start += 400) {
    const batch = db.batch();
    for (const ref of refs.slice(start, start + 400)) batch.delete(ref);
    await batch.commit();
  }
  for (const id of found.jobs) await db.recursiveDelete(biz.collection("jobs").doc(id));
}

const jobNumber = (id) => Number(String(id).replace(/^J-/, "")) || 0;

async function main() {
  if (emulator) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-e2e" });
  else admin.initializeApp({ credential: admin.credential.cert(serviceAccount()) });
  const db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });
  const biz = db.collection("businesses").doc(business);
  const snap = await biz.get();
  if (!snap.exists) throw new ScriptError("Business document does not exist.");
  const b = snap.data();
  if (b.industry !== "roofing") throw new ScriptError(`Sample work is written for roofing only (this business is "${b.industry ?? "unknown"}").`);
  const guardOn = Array.isArray(b.outboundEmailAllowlist);
  console.log(`Evaluation guard: ${guardOn ? "ON" : "OFF"}${emulator ? " (emulator)" : ""}`);
  if (apply && !emulator && !guardOn) throw new ScriptError("Evaluation guard is OFF for this business. Set outboundEmailAllowlist and outboundPhoneAllowlist before adding sample work.");

  const found = await existingSampleWork(db, biz);
  const existingCount = found.jobs.length + found.appointments.length + found.leads.length;
  const dependentCount = Object.values(found.dependents).reduce((sum, list) => sum + list.length, 0);
  if (existingCount > 0) {
    console.log(`Existing sample work: ${found.jobs.length} jobs, ${found.appointments.length} bookings, ${found.leads.length} requests; made from them: ${dependentCount} records`);
    if (!replace) throw new ScriptError("Sample work already exists. Add --replace to remove it (and what was made from it) and write a fresh set.");
  }

  const [crewSnap, customerSnap, historySnap, pricingSnap, catalogSnap] = await Promise.all([
    biz.collection("crews").get(),
    biz.collection("customers").get(),
    biz.collection("jobHistory").select("customerId").get(),
    biz.collection("library").doc("pricing").get(),
    biz.collection("library").doc("workCatalog").get(),
  ]);
  const crews = crewSnap.docs.map((d) => ({ crewId: d.id, name: d.data().name, active: d.data().active, kind: d.data().kind }));
  const workOrders = new Map();
  for (const doc of historySnap.docs) { const id = doc.data().customerId; if (typeof id === "string") workOrders.set(id, (workOrders.get(id) ?? 0) + 1); }
  const customers = customerSnap.docs
    .filter((d) => d.data().provenance?.origin !== SAMPLE && d.data().active !== false)
    .map((d) => ({ customerId: d.id, name: d.data().name, address: d.data().address, properties: d.data().properties, workOrders: workOrders.get(d.id) ?? 0 }));

  // Job ids: reuse the earlier sample jobs' numbers when starting over, the rest from jobCounter (like POST /api/jobs).
  const counter = typeof b.jobCounter === "number" ? b.jobCounter : 999;
  const reuse = replace ? [...found.jobs].filter((id) => /^J-\d+$/.test(id)).sort((x, y) => jobNumber(x) - jobNumber(y)).slice(0, JOB_COUNT) : [];
  const fresh = Array.from({ length: JOB_COUNT - reuse.length }, (_, i) => `J-${counter + 1 + i}`);
  const jobIds = [...reuse, ...fresh];
  const nextCounter = fresh.length ? counter + fresh.length : counter;

  const now = Date.now();
  const timeZone = typeof b.timezone === "string" && b.timezone ? b.timezone : "America/New_York";
  const work = buildSampleWork({
    now, businessId: business, timeZone, businessHours: b.businessHours, day: args.day, crews, customers,
    materials: pricingSnap.data()?.materials, laborRates: pricingSnap.data()?.laborRates, categories: catalogSnap.data()?.categories,
    companies: b.billingCompanies, jobIds,
  });
  for (const line of describeSampleWork(work, timeZone, crews)) console.log(line);
  const noteCount = work.jobs.reduce((sum, job) => sum + job.updates.length, 0);
  console.log(`${apply ? "Writing" : "Would write"}: ${work.jobs.length} jobs (${noteCount} notes), ${work.appointments.length} booking, ${work.leads.length} requests; jobCounter ${counter} -> ${nextCounter}${existingCount ? `; after removing the earlier sample work (${existingCount} records + ${dependentCount} made from them)` : ""}`);
  if (!apply) { console.log("Dry run: nothing written. Add --apply --confirm=<business> to write."); return; }

  if (existingCount > 0) await removeSampleWork(db, biz, found);
  await db.runTransaction(async (tx) => {
    const current = (await tx.get(biz)).data() ?? {};
    const currentCounter = typeof current.jobCounter === "number" ? current.jobCounter : 999;
    if (currentCounter !== counter) throw new ScriptError("A job was created while this ran (jobCounter moved). Run it again.");
    for (const { doc, updates } of work.jobs) {
      const jobRef = biz.collection("jobs").doc(doc.jobId);
      tx.create(jobRef, doc);
      for (const update of updates) tx.create(jobRef.collection("updates").doc(update.updateId), update);
    }
    for (const { id, doc } of work.appointments) tx.create(biz.collection("appointments").doc(id), doc);
    for (const { id, doc } of work.leads) tx.create(biz.collection("leads").doc(id), doc);
    if (nextCounter !== currentCounter) tx.update(biz, { jobCounter: nextCounter });
  });
  console.log(`Written. Remove it any time: Admin -> Clients -> Edit -> Sample data -> Remove all samples.`);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error instanceof ScriptError ? error.message : `Failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exit(1);
});
