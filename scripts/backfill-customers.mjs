#!/usr/bin/env node
// One-off operational script — NOT part of the app's runtime.
//
// Groups a business's existing jobs (which only ever had flat clientName/
// clientPhone/address strings, no customer entity) into
// businesses/{bid}/customers records, and back-fills job.customerId. Jobs
// created after Phase 2 shipped already carry customerId from the
// job-create combobox or the non-blocking /resolve call, so this only
// matters for jobs that predate it.
//
// Identity logic (normalize name + phone-last-7, prefix search tokens) is
// duplicated from src/lib/customers/search.ts in plain JS — this script has
// no path-alias/TS runtime, matching every other script in this directory.
// Keep the two in sync if the indexing scheme ever changes.
//
// Usage:
//   node scripts/backfill-customers.mjs --businessId=demo-roofing [--dry-run]
//
// --dry-run prints exactly what would be created/linked without writing
// anything. Safe to re-run: jobs that already carry a customerId are
// skipped, and matching by matchKey means a second run against the same
// data creates nothing new.

import admin from "firebase-admin";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function normalizeName(s) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
function digitsOnly(s) {
  return (s ?? "").replace(/\D/g, "");
}
function buildMatchKey({ name, phone }) {
  return `${normalizeName(name)}|${digitsOnly(phone).slice(-7)}`;
}
const STOPWORDS = new Set(["the", "inc", "llc", "corp", "co", "company", "and", "of", "a", "an", "&"]);
function wordsFrom(s) {
  return normalizeName(s).split(" ").filter(Boolean).filter((w) => !STOPWORDS.has(w));
}
function prefixesFor(word) {
  if (word.length < 2) return [word];
  const out = [];
  for (let len = 2; len <= Math.min(word.length, 12); len++) out.push(word.slice(0, len));
  return out;
}
function phoneTokens(phone) {
  const digits = digitsOnly(phone);
  const out = [];
  if (digits.length >= 4) out.push(digits.slice(-4));
  if (digits.length >= 7) out.push(digits.slice(-7));
  return out;
}
function buildSearchTokens({ name, phone, address }) {
  const tokens = [];
  const seen = new Set();
  const add = (list) => {
    for (const t of list) {
      if (tokens.length >= 250) return;
      if (!t || seen.has(t)) continue;
      seen.add(t);
      tokens.push(t);
    }
  };
  for (const w of wordsFrom(name)) add(prefixesFor(w));
  add(phoneTokens(phone));
  for (const w of wordsFrom(address)) add(prefixesFor(w));
  return tokens;
}

function parseArgs(argv) {
  const args = { dryRun: false, businessId: null };
  for (const raw of argv) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--businessId=")) args.businessId = raw.slice("--businessId=".length);
  }
  return args;
}

async function main() {
  const { businessId, dryRun } = parseArgs(process.argv.slice(2));
  if (!businessId) {
    console.error("Usage: node scripts/backfill-customers.mjs --businessId=<id> [--dry-run]");
    process.exit(1);
  }

  const serviceAccountPath = join(__dirname, "..", "firebase-service-account.json");
  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf-8"));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  const bizRef = db.collection("businesses").doc(businessId);
  const bizSnap = await bizRef.get();
  if (!bizSnap.exists) {
    console.error(`Business ${businessId} not found. Aborting — nothing changed.`);
    process.exit(1);
  }

  const jobsSnap = await bizRef.collection("jobs").get();
  console.log(`Scanning ${jobsSnap.size} job(s) for ${businessId}...`);

  const groups = new Map(); // matchKey -> { name, phone, address, jobs: [{ref, data}] }
  let alreadyLinked = 0;
  let unnamed = 0;

  for (const doc of jobsSnap.docs) {
    const job = doc.data();
    if (job.customerId) {
      alreadyLinked++;
      continue;
    }
    if (!job.clientName || !job.clientName.trim()) {
      unnamed++;
      continue;
    }
    const key = buildMatchKey({ name: job.clientName, phone: job.clientPhone });
    let group = groups.get(key);
    if (!group) {
      group = { name: job.clientName.trim(), phone: job.clientPhone || undefined, address: job.address || undefined, jobs: [] };
      groups.set(key, group);
    }
    // Prefer the most recent job's address/phone as the customer's default.
    if (job.createdAt >= (group.latestAt ?? 0)) {
      group.latestAt = job.createdAt;
      if (job.address) group.address = job.address;
      if (job.clientPhone) group.phone = job.clientPhone;
    }
    group.jobs.push({ ref: doc.ref, data: job });
  }

  console.log(`${alreadyLinked} already linked, ${unnamed} skipped (no client name), ${groups.size} distinct customer(s) found among the rest.`);

  let created = 0;
  let linked = 0;

  for (const [matchKey, group] of groups) {
    const existingSnap = await bizRef.collection("customers").where("matchKey", "==", matchKey).limit(1).get();
    let customerId;
    let customerRef;

    const jobCount = group.jobs.length;
    const lastJobAt = Math.max(...group.jobs.map((j) => j.data.createdAt ?? 0));

    if (!existingSnap.empty) {
      customerRef = existingSnap.docs[0].ref;
      customerId = customerRef.id;
      console.log(`${dryRun ? "[dry-run] " : ""}Reusing existing customer ${customerId} (${group.name}) for ${jobCount} job(s)`);
    } else {
      let counter;
      if (!dryRun) {
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(bizRef);
          counter = (snap.data()?.customerCounter ?? 999) + 1;
          tx.update(bizRef, { customerCounter: counter });
        });
        customerId = `C-${counter}`;
        customerRef = bizRef.collection("customers").doc(customerId);
        const now = Date.now();
        await customerRef.set({
          customerId,
          businessId,
          name: group.name,
          kind: "residential",
          ...(group.phone ? { phone: group.phone } : {}),
          ...(group.address ? { address: group.address } : {}),
          jobCount,
          lastJobAt,
          matchKey,
          searchTokens: buildSearchTokens({ name: group.name, phone: group.phone, address: group.address }),
          active: true,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        customerId = "C-(new)";
      }
      created++;
      console.log(`${dryRun ? "[dry-run] " : ""}Creating customer ${customerId} "${group.name}" for ${jobCount} job(s)`);
    }

    for (const { ref, data } of group.jobs) {
      if (!dryRun) await ref.update({ customerId, updatedAt: Date.now() });
      linked++;
      console.log(`  ${dryRun ? "[dry-run] " : ""}link ${data.jobId ?? ref.id} -> ${customerId}`);
    }

    if (!dryRun && !existingSnap.empty) {
      // Reused an existing customer created outside this run — top up its
      // rollups rather than overwrite (another backfill or a live job may
      // have already contributed to jobCount/lastJobAt).
      const admin_ = admin;
      await customerRef.update({
        jobCount: admin_.firestore.FieldValue.increment(jobCount),
        lastJobAt: Math.max(lastJobAt, existingSnap.docs[0].data().lastJobAt ?? 0),
        updatedAt: Date.now(),
      });
    }
  }

  console.log("");
  console.log(`Done${dryRun ? " (dry run — nothing was written)" : ""}: ${created} customer(s) created, ${linked} job(s) linked.`);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
