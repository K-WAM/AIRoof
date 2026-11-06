#!/usr/bin/env node
import admin from "firebase-admin";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeCsvBuffer, parseCsv, normalizeName, matchKey, mapCustomers, mapProperties, mapMaterials, mapInvoiceHistory, mapInspections } from "./lib/jobba-import.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).filter(x => x.startsWith("--")).map(x => { const [key,...value] = x.slice(2).split("="); return [key,value.length ? value.join("=") : true]; }));
const business = args.business;
const apply = args.apply === true;
if (typeof business !== "string" || business.startsWith("demo-") || !(business === "roofdoctors" || (process.env.FIRESTORE_EMULATOR_HOST && business.startsWith("e2e-"))) || (apply && args.confirm !== business)) {
  console.error("Invalid business or confirmation. Use --business=<allowed id> and --apply --confirm=<same id> to write."); process.exit(1);
}
const dir = resolve(root, typeof args.dir === "string" ? args.dir : "client-resources/roofdoctors/02-data-export-jobba");
const filenames = ["customers.csv", "properties.csv", "material-items.csv", "invoices.csv", "inspections.csv"];
const stopwords = new Set(["the", "inc", "llc", "corp", "co", "company", "and", "of", "a", "an", "&"]);
function searchTokens(name) { const tokens = []; for (const word of normalizeName(name).split(" ").filter(w => w && !stopwords.has(w))) { for (let len = word.length < 2 ? word.length : 2; len <= Math.min(word.length,12); len++) { const token = word.slice(0,len); if (!tokens.includes(token) && tokens.length < 250) tokens.push(token); } } return tokens; }
async function main() {
  if (process.env.FIRESTORE_EMULATOR_HOST) admin.initializeApp({projectId:process.env.GCLOUD_PROJECT || "demo-e2e"});
  else {
    // Production: `vercel env run -e production -- node scripts/import-jobba.mjs ...` keeps the key in memory (no file on
    // disk); a local firebase-service-account.json still works. A parse error never prints the value (it would quote it).
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || readFileSync(join(root,"firebase-service-account.json"),"utf8");
    let account; try { account = JSON.parse(raw); } catch { throw new Error("The service account JSON could not be parsed (value not shown)."); }
    admin.initializeApp({credential:admin.credential.cert(account)});
  }
  const db = admin.firestore(), biz = db.collection("businesses").doc(business), snap = await biz.get();
  if (!snap.exists) throw new Error("Business document does not exist.");
  // Owner rule (2026-11-04): use their data, never contact anyone with it. No write until the workspace's evaluation
  // guard is on (src/lib/comms/evaluationGuard.ts: the email allowlist switches on the email AND the phone side).
  const guardOn = Array.isArray(snap.data().outboundEmailAllowlist);
  console.log(`Evaluation guard: ${guardOn ? "ON" : "OFF"}`);
  if (apply && !guardOn) throw new Error("Evaluation guard is OFF for this business. Set outboundEmailAllowlist and outboundPhoneAllowlist on it before importing.");
  const tz = snap.data().timezone || "America/New_York";
  let replacement = 0;
  const files = filenames.map(name => { const text = decodeCsvBuffer(readFileSync(join(dir,name))); replacement += (text.match(/\uFFFD/g) || []).length; return parseCsv(text); });
  const customers = mapCustomers(files[0]), mappedProperties = mapProperties(files[1]), materials = mapMaterials(files[2]), invoices = mapInvoiceHistory(files[3],tz), inspections = mapInspections(files[4],tz);
  const existing = await biz.collection("customers").get(), customerMap = new Map();
  for (const doc of existing.docs) if (doc.data().matchKey && !customerMap.has(doc.data().matchKey)) customerMap.set(doc.data().matchKey,{id:doc.id,data:doc.data(),ref:doc.ref});
  const pricingRef = biz.collection("library").doc("pricing"), pricing = await pricingRef.get(), oldMaterials = pricing.data()?.materials ?? [];
  const materialNames = new Set(oldMaterials.map(m => m.name.toLowerCase()));
  const additions = materials.filter(m => !materialNames.has(m.name.toLowerCase()));
  const createCount = customers.filter(c => !customerMap.has(c.matchKey)).length;
  let attached = 0;
  for (const c of customers) { const entry = customerMap.get(c.matchKey); if (!entry || entry.data.properties == null) attached += (mappedProperties.properties.get(c.matchKey) ?? []).length; }
  const matches = records => records.filter(r => customerMap.has(matchKey({name:r.billTo ?? r.customerName})) || customers.some(c => c.matchKey === matchKey({name:r.billTo ?? r.customerName}))).length;
  const invoiceMatches = matches(invoices), inspectionMatches = matches(inspections);
  const lines = ["# Jobba import report", "", ...filenames.map((n,i) => `${n}: ${files[i].length} rows`), `Customers to create: ${createCount}`, `Customers already present: ${customers.length-createCount}`, `Properties attached: ${attached}`, `Properties cut: ${mappedProperties.cut}`, `Materials to add: ${additions.length}`, `Materials skipped as duplicates: ${files[2].filter(r => r.Enabled === "Yes" && r.Name?.trim()).length-additions.length}`, `Invoices matched: ${invoiceMatches}; unmatched: ${invoices.length-invoiceMatches}`, `Inspections matched: ${inspectionMatches}; unmatched: ${inspections.length-inspectionMatches}`, `Replacement characters remaining: ${replacement}`];
  console.log(lines.slice(2).join("\n"));
  const reportDir = resolve(dir,"..","05-crm-import"); mkdirSync(reportDir,{recursive:true}); const stamp = new Date().toISOString().replace(/[-:]/g,"").slice(0,13).replace("T","-"); writeFileSync(join(reportDir,`import-run-${stamp}.md`),lines.join("\n")+"\n");
  if (!apply) return;
  const now = Date.now();
  for (const c of customers) {
    let entry = customerMap.get(c.matchKey);
    if (!entry) {
      let id;
      await db.runTransaction(async tx => { const b = await tx.get(biz); const found = await tx.get(biz.collection("customers").where("matchKey","==",c.matchKey).limit(1)); if (!found.empty) { id = found.docs[0].id; return; } const counter = (b.data()?.customerCounter ?? 999)+1; id = `C-${counter}`; tx.update(biz,{customerCounter:counter}); tx.create(biz.collection("customers").doc(id),{customerId:id,businessId:business,name:c.name,kind:c.kind,jobCount:0,matchKey:c.matchKey,searchTokens:searchTokens(c.name),active:true,createdAt:now,updatedAt:now,properties:mappedProperties.properties.get(c.matchKey) ?? [],source:"jobba",importedAt:now}); });
      const ref = biz.collection("customers").doc(id), current = await ref.get(); entry = {id,ref,data:current.data()}; customerMap.set(c.matchKey,entry);
    }
    await db.runTransaction(async tx => { const current = await tx.get(entry.ref); const data = current.data(), updates = {}; if (data.properties == null) updates.properties = mappedProperties.properties.get(c.matchKey) ?? []; if (data.source == null) updates.source = "jobba"; if (data.importedAt == null) updates.importedAt = now; if (Object.keys(updates).length) tx.update(entry.ref,updates); });
  }
  if (additions.length) await db.runTransaction(async tx => { const doc = await tx.get(pricingRef), current = doc.data()?.materials ?? [], names = new Set(current.map(m => m.name.toLowerCase())); const newItems = materials.filter(m => !names.has(m.name.toLowerCase())); if (newItems.length) tx.set(pricingRef,{materials:[...current,...newItems]},{merge:true}); });
  const writes = [...invoices.map(record => ({collection:"invoiceHistory",record,name:record.billTo})),...inspections.map(record => ({collection:"jobHistory",record,name:record.customerName}))];
  for (let i=0;i<writes.length;i+=400) { const batch=db.batch(); for (const item of writes.slice(i,i+400)) { const customerId = customerMap.get(matchKey({name:item.name}))?.id; batch.set(biz.collection(item.collection).doc(item.record.id),{...item.record,importedAt:now,...(customerId ? {customerId} : {})},{merge:true}); } await batch.commit(); }
}
main().catch((err) => { console.error(`Import failed: ${String(err?.message ?? err).slice(0, 300)}`); process.exitCode=1; });
