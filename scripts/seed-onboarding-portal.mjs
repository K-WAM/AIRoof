#!/usr/bin/env node
// Seed or update one client's onboarding portal (T-360) from a JSON file kept OUTSIDE git (client data never enters the repo).
//
//   Dry run (default):  vercel env run -e production -- node scripts/seed-onboarding-portal.mjs --business=roofdoctors \
//                         --file=client-resources/roofdoctors/08-onboarding/portal-seed.json
//   Apply:              … --apply --confirm=roofdoctors
//   Emulator:           FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-onboarding-portal.mjs --business=e2e-roofing --file=…
//
// Writes ONLY clientOnboarding/{businessId} (src/types/onboarding.ts → OnboardingPortal). Replaces steps, checklist, settings,
// dataReview and clientName from the file; keeps the existing forms map, link and createdAt. A missing portal is created with
// every form enabled and "not_sent". Never touches the client link, form answers or any other collection; never sends anything;
// never prints secrets. Allowed businesses: "roofdoctors", or "e2e-*" when FIRESTORE_EMULATOR_HOST is set; never demo-*.
import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).filter((x) => x.startsWith("--")).map((x) => {
  const [key, ...value] = x.slice(2).split("=");
  return [key, value.length ? value.join("=") : true];
}));
const business = args.business;
const apply = args.apply === true;
const allowed = typeof business === "string" && !business.startsWith("demo-")
  && (business === "roofdoctors" || (process.env.FIRESTORE_EMULATOR_HOST && business.startsWith("e2e-")));
if (!allowed || (apply && args.confirm !== business) || typeof args.file !== "string") {
  console.error("Use --business=<allowed id> --file=<json> [--apply --confirm=<same id>].");
  process.exit(1);
}

const FORM_IDS = ["texting", "payments", "team", "company", "documents"];
const STEP_STATUS = new Set(["done", "current", "upcoming"]);
const ITEM_STATUS = new Set(["received", "partial", "waiting", "not_needed"]);
const ID = /^[a-z0-9-]{1,40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function check(seed) {
  const problems = [];
  const cap = (v, n, where) => { if (typeof v !== "string" || !v.trim() || v.length > n) problems.push(`${where}: text missing or over ${n} chars`); };
  if (!Array.isArray(seed.steps) || seed.steps.length > 12) problems.push("steps: 1 to 12 required");
  for (const [i, s] of (seed.steps ?? []).entries()) {
    if (!ID.test(s.id ?? "")) problems.push(`steps[${i}].id`);
    cap(s.title, 80, `steps[${i}].title`); cap(s.detail, 240, `steps[${i}].detail`);
    if (s.date !== undefined && !DATE.test(s.date)) problems.push(`steps[${i}].date`);
    if (!STEP_STATUS.has(s.status)) problems.push(`steps[${i}].status`);
  }
  if ((seed.steps ?? []).filter((s) => s.status === "current").length > 1) problems.push("steps: more than one current step");
  if (!Array.isArray(seed.checklist) || seed.checklist.length > 60) problems.push("checklist: up to 60 items");
  for (const [i, c] of (seed.checklist ?? []).entries()) {
    if (!ID.test(c.id ?? "")) problems.push(`checklist[${i}].id`);
    cap(c.group, 80, `checklist[${i}].group`); cap(c.title, 80, `checklist[${i}].title`);
    if (c.detail !== undefined) cap(c.detail, 240, `checklist[${i}].detail`);
    if (!ITEM_STATUS.has(c.status)) problems.push(`checklist[${i}].status`);
    if (c.formId !== undefined && !FORM_IDS.includes(c.formId)) problems.push(`checklist[${i}].formId`);
  }
  const ids = [...(seed.steps ?? []), ...(seed.checklist ?? [])].map((x) => x.id);
  if (new Set(ids).size !== ids.length) problems.push("duplicate ids");
  if (seed.dataReview) {
    cap(seed.dataReview.title, 120, "dataReview.title"); cap(seed.dataReview.intro, 1000, "dataReview.intro");
    for (const [i, s] of (seed.dataReview.sections ?? []).entries()) { cap(s.heading, 120, `dataReview.sections[${i}].heading`); cap(s.body, 4000, `dataReview.sections[${i}].body`); }
    if (JSON.stringify(seed.dataReview).includes("PLACEHOLDER")) problems.push("dataReview still contains a PLACEHOLDER");
  }
  return problems;
}

async function main() {
  const seed = JSON.parse(readFileSync(resolve(root, args.file), "utf8"));
  const problems = check(seed);
  if (problems.length) { console.error(`Seed file has ${problems.length} problem(s):\n- ${problems.join("\n- ")}`); process.exit(1); }

  if (process.env.FIRESTORE_EMULATOR_HOST) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-e2e" });
  else {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || readFileSync(join(root, "firebase-service-account.json"), "utf8");
    let account; try { account = JSON.parse(raw); } catch { throw new Error("The service account JSON could not be parsed (value not shown)."); }
    admin.initializeApp({ credential: admin.credential.cert(account) });
  }
  const db = admin.firestore();
  if (!(await db.collection("businesses").doc(business).get()).exists) throw new Error("Business document does not exist.");
  const ref = db.collection("clientOnboarding").doc(business);
  const existing = await ref.get();
  const now = Date.now();
  const old = existing.exists ? existing.data() : null;
  const keepDone = (id, field) => [...(old?.steps ?? []), ...(old?.checklist ?? [])].find((x) => x.id === id)?.[field];
  const steps = seed.steps.map((s) => ({ ...s, ...(s.status === "done" ? { completedAt: keepDone(s.id, "completedAt") ?? now } : {}) }));
  const checklist = seed.checklist.map((c) => ({ ...c, ...(c.status === "received" ? { receivedAt: keepDone(c.id, "receivedAt") ?? now } : {}) }));
  const forms = old?.forms ?? Object.fromEntries(FORM_IDS.map((id) => [id, { id, enabled: true, status: "not_sent" }]));
  const portal = {
    businessId: business,
    clientName: seed.clientName ?? old?.clientName ?? business,
    steps, checklist, forms,
    ...(seed.dataReview ? { dataReview: { ...seed.dataReview, updatedAt: now } } : old?.dataReview ? { dataReview: old.dataReview } : {}),
    settings: { ...(old?.settings ?? {}), ...(seed.settings ?? {}) },
    ...(old?.link ? { link: old.link } : {}),
    createdAt: old?.createdAt ?? now,
    updatedAt: now,
  };
  const received = checklist.filter((c) => c.status === "received").length;
  console.log(`${existing.exists ? "Update" : "Create"} clientOnboarding/${business}: ${steps.length} steps (${steps.filter((s) => s.status === "done").length} done), `
    + `${checklist.length} checklist items (${received} received), data review ${portal.dataReview ? `${portal.dataReview.sections.length} sections` : "none"}; `
    + `forms ${existing.exists ? "kept" : "created"}; link ${old?.link ? "kept" : "none"}.`);
  if (!apply) { console.log("Dry run: nothing written. Add --apply --confirm=<business> to write."); return; }
  await ref.set(portal);
  console.log("Written.");
}
main().catch((err) => { console.error(err.message); process.exit(1); });
