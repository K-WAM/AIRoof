// Account purpose review (Phase 32, T-166 — contract C-A, decision D7). DRY RUN by default.
//
//   node scripts/classify-accounts.mjs                       lists every tenant with its current purpose and a SUGGESTION
//   node scripts/classify-accounts.mjs --template out.json   also writes an editable mapping { businessId: purpose }
//   node scripts/classify-accounts.mjs --apply out.json      writes ONLY what the owner put in the mapping (typed confirm)
//
// Suggestions are hints for a human, never applied on their own: a name containing "test"/"e2e"/"sandbox" suggests test.
// Demo tenants are derived by the server (the Demo Studio allowlist / isDemo) and can't be set here. Allowed values in a
// mapping: "client", "test", "archived". Nothing is deleted and no routing changes.
import admin from "firebase-admin";
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { ScriptError, parseArgs, serviceAccount } from "./lib/adminCredential.mjs";

const DEMO_BUSINESS_IDS = new Set(["demo-roofing"]);
const ALLOWED = new Set(["client", "test", "archived"]);

function suggestion(id, data) {
  if (DEMO_BUSINESS_IDS.has(id) || data.isDemo === true) return { purpose: "demo", reason: "demo tenant (server-derived)" };
  const name = `${id} ${data.businessName ?? ""}`.toLowerCase();
  if (/\b(test|e2e|sandbox)\b|test$/.test(name)) return { purpose: "test", reason: "name mentions test/e2e/sandbox — confirm" };
  if (/\bdemo\b/.test(name)) return { purpose: "test", reason: "name says Demo but it is not the live demo tenant — a sample tenant; confirm test or archived" };
  if (data.subscriptionStatus === "paused" && data.active === false) return { purpose: "archived", reason: "paused and inactive — confirm" };
  return { purpose: "client", reason: "no test/demo signal — confirm it is a real customer" };
}

async function main() {
  const args = parseArgs(process.argv.slice(2), { values: ["template", "apply"] });
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount()) });
  const db = admin.firestore();
  const snaps = (await db.collection("businesses").get()).docs;

  if (args.apply) {
    let mapping;
    try {
      mapping = JSON.parse(readFileSync(args.apply, "utf8"));
    } catch {
      throw new ScriptError("The mapping file could not be read as JSON");
    }
    const known = new Map(snaps.map((snap) => [snap.id, snap.data() ?? {}]));
    const writes = [];
    for (const [businessId, purpose] of Object.entries(mapping)) {
      if (!known.has(businessId)) throw new ScriptError(`Unknown business in mapping: ${businessId}`);
      if (DEMO_BUSINESS_IDS.has(businessId) || known.get(businessId).isDemo === true) throw new ScriptError(`${businessId} is a demo tenant — its purpose is derived, remove it from the mapping`);
      if (!ALLOWED.has(purpose)) throw new ScriptError(`${businessId}: purpose must be client, test or archived`);
      if (known.get(businessId).accountPurpose !== purpose) writes.push({ businessId, purpose, before: known.get(businessId).accountPurpose ?? null });
    }
    console.log(`${writes.length} change(s):`);
    for (const write of writes) console.log(`  ${write.businessId}: ${write.before ?? "unclassified"} → ${write.purpose}`);
    if (writes.length === 0) return;
    if (!process.stdin.isTTY) throw new ScriptError("--apply needs an interactive terminal for the typed confirmation");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question("Type APPLY to write these changes: ");
    rl.close();
    if (answer.trim() !== "APPLY") throw new ScriptError("Not confirmed — nothing written");
    const batch = db.batch();
    const now = Date.now();
    for (const write of writes) {
      batch.update(db.collection("businesses").doc(write.businessId), { accountPurpose: write.purpose, updatedAt: now });
      batch.create(db.collection("adminAuditEvents").doc(`audit_purpose_${now}_${write.businessId}`), {
        auditEventId: `audit_purpose_${now}_${write.businessId}`,
        action: "business.purpose_set",
        actorUid: "operator-script",
        businessId: write.businessId,
        before: { accountPurpose: write.before },
        after: { accountPurpose: write.purpose },
        createdAt: now,
      });
    }
    await batch.commit();
    console.log("Written.");
    return;
  }

  const template = {};
  console.log("businessId · name · current → suggestion (reason)   [dry run — nothing written]");
  for (const snap of snaps) {
    const data = snap.data() ?? {};
    const current = DEMO_BUSINESS_IDS.has(snap.id) || data.isDemo === true ? "demo" : data.accountPurpose ?? "unclassified";
    const hint = suggestion(snap.id, data);
    console.log(`  ${snap.id} · ${data.businessName ?? "-"} · ${current} → ${hint.purpose} (${hint.reason})`);
    if (hint.purpose !== "demo") template[snap.id] = hint.purpose;
  }
  if (args.template) {
    writeFileSync(args.template, `${JSON.stringify(template, null, 2)}\n`);
    console.log(`\nEditable mapping written to ${args.template} — change what is wrong, then run with --apply ${args.template}`);
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error instanceof ScriptError ? `classify-accounts: ${error.message}` : `classify-accounts failed: ${error?.message ?? "unknown error"}`);
  process.exit(1);
});
