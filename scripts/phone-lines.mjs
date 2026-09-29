// Phone-line registry backfill (Phase 32, T-171). DRY RUN by default — it prints what it would write and writes nothing.
//
//   node scripts/phone-lines.mjs                 dry run: every routed number that has no registry record yet
//   node scripts/phone-lines.mjs --business demo-roofing
//   node scripts/phone-lines.mjs --apply         writes the proposed records after a typed confirmation (owner OK first)
//
// What it proposes, from the routing that is live today (businesses.elevenlabs.phoneNumber / extraPhoneNumbers):
//   - demo tenants' numbers → purpose "demo"; everyone else's → "client"
//   - a tenant's primary routed number → status "live" (it is answering calls now)
//   - an extra routed number → status "connected" (routed in the app, but no test call recorded yet — record one with
//     PATCH /api/admin/phone-lines/[lineId] {action:"record_test"} before calling it tested)
//   - texting: "not_configured" everywhere (NH-29 / decision D5 decide when that changes); the primary is the default sender
// A record that predates the registry gets ONLY its missing fields filled; a number routed to one tenant but on record
// for another is reported as a CONFLICT and left alone. It never edits routing, never overwrites a set field, never deletes.
import admin from "firebase-admin";
import { createInterface } from "node:readline/promises";
import { ScriptError, parseArgs, serviceAccount } from "./lib/adminCredential.mjs";

const DEMO_BUSINESS_IDS = new Set(["demo-roofing"]);
const CANADIAN = new Set(["204", "226", "236", "249", "250", "257", "263", "289", "306", "343", "354", "365", "367", "368", "382", "387", "403", "416", "418", "428", "431", "437", "438", "450", "460", "468", "474", "506", "514", "519", "548", "579", "581", "584", "587", "604", "613", "639", "647", "672", "683", "705", "709", "742", "753", "778", "780", "782", "807", "819", "825", "867", "873", "879", "902", "905", "942"]);

function country(e164) {
  const match = /^\+1(\d{3})\d{7}$/.exec(e164);
  return match && CANADIAN.has(match[1]) ? "CA" : "US";
}

async function main() {
  const args = parseArgs(process.argv.slice(2), { values: ["business"], switches: ["apply"] });
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount()) });
  const db = admin.firestore();

  const businesses = args.business
    ? [await db.collection("businesses").doc(args.business).get()].filter((snap) => snap.exists)
    : (await db.collection("businesses").get()).docs;
  if (args.business && businesses.length === 0) throw new ScriptError(`Business ${args.business} not found`);

  const registry = (await db.collection("businessPhoneNumbers").get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const onRecord = new Map(registry.filter((line) => line.status !== "retired").map((line) => [line.normalizedPhoneNumber, line]));
  const fills = [];

  const proposals = [];
  for (const snap of businesses) {
    const data = snap.data() ?? {};
    const numbers = [
      ...(typeof data.elevenlabs?.phoneNumber === "string" ? [{ e164: data.elevenlabs.phoneNumber, primary: true }] : []),
      ...(Array.isArray(data.elevenlabs?.extraPhoneNumbers) ? data.elevenlabs.extraPhoneNumbers.map((e164) => ({ e164, primary: false })) : []),
    ];
    const isDemo = DEMO_BUSINESS_IDS.has(snap.id) || data.isDemo === true;
    for (const { e164, primary } of numbers) {
      if (!/^\+[1-9]\d{7,14}$/.test(e164)) continue;
      const existing = onRecord.get(e164);
      if (existing) {
        // A pre-registry record (no purpose/status): fill ONLY the missing fields; never overwrite what is there.
        if (existing.businessId !== snap.id) {
          console.log(`  CONFLICT ${e164}: routed to ${snap.id} but on record for ${existing.businessId} — fix by hand`);
          continue;
        }
        const missing = {};
        if (!existing.purpose) missing.purpose = isDemo ? "demo" : "client";
        if (!existing.status) missing.status = primary ? "live" : "connected";
        if (!existing.provider) missing.provider = "elevenlabs";
        if (!existing.country) missing.country = country(e164);
        if (!existing.sms) missing.sms = { status: "not_configured", purposes: ["booking_received", "appointment_confirmed", "inspector_assigned"], isDefaultSender: primary };
        if (Object.keys(missing).length === 0) console.log(`  ok   ${e164} (${snap.id}) — registry record complete`);
        else fills.push({ id: existing.id, e164, missing });
        continue;
      }
      proposals.push({
        id: `${snap.id}-${e164.slice(1)}`,
        doc: {
          phoneNumberId: `${snap.id}-${e164.slice(1)}`,
          businessId: snap.id,
          phoneNumber: e164,
          normalizedPhoneNumber: e164,
          label: primary ? "Main line" : "Additional line",
          active: true,
          status: primary ? "live" : "connected",
          purpose: isDemo ? "demo" : "client",
          provider: "elevenlabs",
          country: country(e164),
          sms: { status: "not_configured", purposes: ["booking_received", "appointment_confirmed", "inspector_assigned"], isDefaultSender: primary },
          updatedBy: "phone-lines-script",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      });
    }
  }

  console.log(`\n${proposals.length} registry record(s) proposed${args.apply ? "" : " (dry run — nothing written)"}:`);
  for (const { id, doc } of proposals) {
    console.log(`  ${id}: ${doc.phoneNumber} ${doc.country} · ${doc.purpose} · ${doc.status} · texting ${doc.sms.status}${doc.sms.isDefaultSender ? " (default sender)" : ""}`);
  }
  console.log(`\n${fills.length} existing record(s) missing registry fields${args.apply ? "" : " (dry run — nothing written)"}:`);
  for (const fill of fills) console.log(`  ${fill.id}: ${fill.e164} + ${JSON.stringify(fill.missing)}`);
  if (!args.apply || proposals.length + fills.length === 0) return;

  if (!process.stdin.isTTY) throw new ScriptError("--apply needs an interactive terminal for the typed confirmation");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Type APPLY to write these ${proposals.length + fills.length} change(s): `);
  rl.close();
  if (answer.trim() !== "APPLY") throw new ScriptError("Not confirmed — nothing written");

  const batch = db.batch();
  for (const { id, doc } of proposals) batch.create(db.collection("businessPhoneNumbers").doc(id), doc);
  for (const fill of fills) batch.update(db.collection("businessPhoneNumbers").doc(fill.id), { ...fill.missing, updatedAt: Date.now(), updatedBy: "phone-lines-script" });
  const now = Date.now();
  batch.create(db.collection("adminAuditEvents").doc(`audit_phone_lines_backfill_${now}`), {
    auditEventId: `audit_phone_lines_backfill_${now}`,
    action: "phone_line.backfill",
    actorUid: "operator-script",
    lineIds: proposals.map((proposal) => proposal.id),
    filledLineIds: fills.map((fill) => fill.id),
    createdAt: now,
  });
  await batch.commit();
  console.log("Written.");
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error instanceof ScriptError ? `phone-lines: ${error.message}` : `phone-lines failed: ${error?.message ?? "unknown error"}`);
  process.exit(1);
});
