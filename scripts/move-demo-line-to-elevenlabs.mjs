// Migrate the shared ElevenLabs demo number. Dry-run is the default.
// Run from the repository root; credentials are never logged.
import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE_ID = "carlita-elevenlabs-test";
const DEMO_ID = "demo-roofing";
const BACKUP_ID = "elevenlabs-line-migration";
const EXPECTED = {
  agentId: "agent_0101m3a5z9qxenybnpjsragg7dvt",
  phoneNumberId: "phnum_0801m3aknbref2w9tbhqc6ad3xzb",
  phoneNumber: "+16892042643",
};

// Our own, credential-free messages — the only errors whose text is safe to print (see the catch at the bottom).
class ScriptError extends Error {}

function structuralEscapesToWhitespace(text) {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") { out += c + (text[i + 1] ?? ""); i++; continue; }
      if (c === '"') inString = false;
      out += c;
    } else if (c === "\\" && text[i + 1] === "n") {
      out += "\n";
      i++;
    } else {
      if (c === '"') inString = true;
      out += c;
    }
  }
  return out;
}

function credential() {
  let raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    // MIGRATION_ENV_FILE: a `vercel env pull` file (delete it right after). Node's --env-file cannot load a
    // pretty-printed JSON value (it stops at the first inner quote), so the line is read directly here.
    const env = readFileSync(resolve(process.env.MIGRATION_ENV_FILE ?? ".env.local"), "utf8");
    const line = env.split(/\r?\n/).find((entry) => /^FIREBASE_SERVICE_ACCOUNT_JSON=/.test(entry));
    raw = line?.slice("FIREBASE_SERVICE_ACCOUNT_JSON=".length).trim();
    if (raw?.startsWith("'")) raw = raw.slice(1, -1);
    else if (raw?.startsWith('"')) raw = raw.slice(1, -1);
  }
  if (!raw) throw new ScriptError("FIREBASE_SERVICE_ACCOUNT_JSON is unavailable");
  // Parse as-is first (the app does exactly this); a double-quoted dotenv value may carry escaped quotes. The key's
  // "\n" escapes are fixed AFTER parsing — replacing them before would put raw newlines inside a JSON string.
  // Other forms: an env-file loader that expanded "\n" into real newlines; and pretty-printed JSON pulled from Vercel,
  // where the newlines BETWEEN fields also became "\n" escapes (only those outside strings turn back into whitespace).
  const escaped = raw.replace(/\r?\n/g, "\\n");
  for (const candidate of [raw, raw.replace(/\\"/g, '"'), escaped, structuralEscapesToWhitespace(raw), structuralEscapesToWhitespace(escaped)]) {
    try {
      const account = JSON.parse(candidate);
      if (typeof account.private_key === "string") account.private_key = account.private_key.replace(/\\n/g, "\n");
      return account;
    } catch {
      /* try the next form; never echo the value */
    }
  }
  throw new ScriptError("FIREBASE_SERVICE_ACCOUNT_JSON could not be parsed as JSON");
}

function describe(label, data) {
  console.log(`${label}: ${JSON.stringify({
    voiceProvider: data.voiceProvider ?? null,
    agentId: data.elevenlabs?.agentId ?? null,
    phoneNumberId: data.elevenlabs?.phoneNumberId ?? null,
    phoneNumber: data.elevenlabs?.phoneNumber ?? null,
    archived: !!data.elevenlabsArchived,
  })}`);
}

async function main() {
  const flags = process.argv.slice(2);
  if (flags.some((flag) => !["--dry-run", "--apply", "--rollback"].includes(flag)) ||
    (flags.includes("--apply") && flags.includes("--rollback"))) {
    throw new ScriptError("Use --dry-run (default), --apply, or --rollback");
  }
  admin.initializeApp({ credential: admin.credential.cert(credential()) });
  const db = admin.firestore();
  const source = db.collection("businesses").doc(SOURCE_ID);
  const demo = db.collection("businesses").doc(DEMO_ID);
  const backup = demo.collection("backups").doc(BACKUP_ID);
  const [sourceSnap, demoSnap, backupSnap] = await Promise.all([source.get(), demo.get(), backup.get()]);
  if (!sourceSnap.exists || !demoSnap.exists) throw new ScriptError("Migration business document missing");
  const from = sourceSnap.data();
  const to = demoSnap.data();

  if (flags.includes("--rollback")) {
    if (!backupSnap.exists) throw new ScriptError("Migration backup missing; cannot roll back");
    const original = backupSnap.data();
    const batch = db.batch();
    batch.update(source, {
      elevenlabs: original.source.elevenlabs ?? admin.firestore.FieldValue.delete(),
      elevenlabsArchived: original.source.elevenlabsArchived ?? admin.firestore.FieldValue.delete(),
    });
    batch.update(demo, {
      elevenlabs: original.demo.elevenlabs ?? admin.firestore.FieldValue.delete(),
      voiceProvider: original.demo.voiceProvider ?? admin.firestore.FieldValue.delete(),
    });
    batch.delete(backup); // so a later --apply is allowed again
    await batch.commit();
    console.log("Rolled back the demo line mapping from its backup.");
    return;
  }

  const line = from.elevenlabs;
  if (!line?.agentId || !line?.phoneNumberId || !line?.phoneNumber) {
    throw new ScriptError("Source ElevenLabs mapping is incomplete (already migrated? check the dry run)");
  }
  if (Object.entries(EXPECTED).some(([key, value]) =>
    key === "phoneNumber" ? String(line[key]).replace(/\D/g, "") !== value.replace(/\D/g, "") : line[key] !== value)) {
    throw new ScriptError("Source mapping differs from the expected demo line; review before applying");
  }
  describe("Before source", from);
  describe("Before demo", to);
  describe("After source", { ...from, elevenlabs: undefined, elevenlabsArchived: line });
  describe("After demo", { ...to, elevenlabs: line, voiceProvider: "elevenlabs" });
  if (!flags.includes("--apply")) {
    console.log("Dry run only. Pass --apply after reviewing this diff.");
    return;
  }
  if (backupSnap.exists) throw new ScriptError("Migration backup already exists; refusing to overwrite it (roll back first)");
  const batch = db.batch();
  batch.set(backup, {
    source: { elevenlabs: from.elevenlabs ?? null, elevenlabsArchived: from.elevenlabsArchived ?? null },
    demo: { elevenlabs: to.elevenlabs ?? null, voiceProvider: to.voiceProvider ?? null },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  batch.update(source, { elevenlabs: admin.firestore.FieldValue.delete(), elevenlabsArchived: line });
  batch.update(demo, { elevenlabs: line, voiceProvider: "elevenlabs" });
  await batch.commit();
  console.log("Demo line mapping applied; rollback backup saved.");
}

main().catch((error) => {
  // Firebase and JSON parse errors can include credential fragments: only our own ScriptError text is printed.
  console.error(error instanceof ScriptError
    ? `Migration failed: ${error.message}`
    : "Migration failed. Check credentials, source mapping, and Firestore access locally.");
  process.exitCode = 1;
});
