#!/usr/bin/env node
import admin from "firebase-admin";
import { missingCustomerListFields, historyForCustomer } from "./lib/customer-list-fields.mjs";

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const [key, value] = process.argv[i].replace(/^--/, "").split("=");
  args[key] = value ?? (process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[++i] : true);
}
const businessId = args.business;
const apply = args.apply === true;
if (typeof businessId !== "string" || businessId.startsWith("demo-") || !(businessId === "roofdoctors" || (process.env.FIRESTORE_EMULATOR_HOST && businessId.startsWith("e2e-"))) || (apply && args.confirm !== businessId)) throw new Error("Use --business <allowed id>; writes require --apply --confirm <same id>.");
if (process.env.FIRESTORE_EMULATOR_HOST) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-e2e" });
else {
  let account;
  try { account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || ""); } catch { throw new Error("Service account JSON is unavailable or invalid (value not shown)."); }
  admin.initializeApp({ credential: admin.credential.cert(account) });
}
const db = admin.firestore(), biz = db.collection("businesses").doc(businessId);
const snap = await biz.get();
if (!snap.exists) throw new Error("Business not found.");
if (apply && !Array.isArray(snap.data().outboundEmailAllowlist)) throw new Error("Evaluation guard must be enabled before applying.");
const [customers, invoices, inspections, jobs] = await Promise.all([biz.collection("customers").get(), biz.collection("invoiceHistory").get(), biz.collection("jobHistory").get(), biz.collection("jobs").get()]);
const history = [...invoices.docs, ...inspections.docs].map(d => d.data());
const changes = customers.docs.map(doc => ({ ref: doc.ref, fields: missingCustomerListFields(doc.data(), { businessId, customerId: doc.id, now: Date.now(), history: historyForCustomer(doc.data(), doc.id, history), jobCount: jobs.docs.filter(j => j.data().customerId === doc.id).length }) })).filter(c => Object.keys(c.fields).length);
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", customers: customers.size, changes: changes.length, samples: changes.slice(0, 3).map(c => ({ fields: Object.keys(c.fields), lastJobAt: c.fields.lastJobAt })) }, null, 2));
if (apply) for (let i = 0; i < changes.length; i += 400) {
  // Transactions re-check missing fields, preserving edits made after the dry-run/read.
  await db.runTransaction(async tx => {
    const chunk = changes.slice(i, i + 400);
    const current = await tx.getAll(...chunk.map(c => c.ref));
    current.forEach((doc, index) => {
      if (!doc.exists) return;
      const fields = Object.fromEntries(Object.entries(chunk[index].fields).filter(([key]) => !Object.hasOwn(doc.data(), key)));
      if (Object.keys(fields).length) tx.update(doc.ref, fields);
    });
  });
}
await admin.app().delete();
