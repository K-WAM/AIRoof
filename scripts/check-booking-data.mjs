// Read-only booking diagnostics. This script never writes and never prints credentials.
import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatScheduleRow, sortScheduleRows, timestampMillis } from "./check-booking-data-helpers.mjs";
// The booking engine's own parser (Node 22.6+ strips the types), so this report can never disagree with what
// checkAvailability decides. A private regex copy here once called hours "parseable" that the engine rejected.
import { canonicalizeBusinessHours } from "../src/lib/scheduling/hours.ts";

const DEFAULT_BUSINESS_ID = "demo-roofing";
const DAYS = 7;

class ScriptError extends Error {}

function structuralEscapesToWhitespace(text) {
  let output = "";
  let inString = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (inString) {
      if (character === "\\") {
        output += character + (text[index + 1] ?? "");
        index++;
        continue;
      }
      if (character === '"') inString = false;
      output += character;
    } else if (character === "\\" && text[index + 1] === "n") {
      output += "\n";
      index++;
    } else {
      if (character === '"') inString = true;
      output += character;
    }
  }
  return output;
}

function credential() {
  let raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    const env = readFileSync(resolve(process.env.BOOKING_CHECK_ENV_FILE ?? ".env.local"), "utf8");
    const line = env.split(/\r?\n/).find((entry) => /^FIREBASE_SERVICE_ACCOUNT_JSON=/.test(entry));
    raw = line?.slice("FIREBASE_SERVICE_ACCOUNT_JSON=".length).trim();
    if (raw?.startsWith("'") || raw?.startsWith('"')) raw = raw.slice(1, -1);
  }
  if (!raw) throw new ScriptError("FIREBASE_SERVICE_ACCOUNT_JSON is unavailable");
  const escaped = raw.replace(/\r?\n/g, "\\n");
  for (const candidate of [raw, raw.replace(/\\"/g, '"'), escaped, structuralEscapesToWhitespace(raw), structuralEscapesToWhitespace(escaped)]) {
    try {
      const account = JSON.parse(candidate);
      if (typeof account.private_key === "string") account.private_key = account.private_key.replace(/\\n/g, "\n");
      return account;
    } catch {
      // Try the next supported dotenv representation. Never echo credential text.
    }
  }
  throw new ScriptError("FIREBASE_SERVICE_ACCOUNT_JSON could not be parsed as JSON");
}

function businessIdFromArgs(args) {
  const unknown = args.filter((arg, index) => arg !== "--business" && args[index - 1] !== "--business" && !arg.startsWith("--business="));
  if (unknown.length > 0) throw new ScriptError("Use --business <id> (default: demo-roofing)");
  const equals = args.find((arg) => arg.startsWith("--business="));
  const index = args.indexOf("--business");
  const value = equals?.slice("--business=".length) ?? (index >= 0 ? args[index + 1] : undefined) ?? DEFAULT_BUSINESS_ID;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new ScriptError("Business id is invalid");
  return value;
}

function parseHoursSummary(hours) {
  const canonical = canonicalizeBusinessHours(hours);
  if (!canonical) {
    return "NOT SET UP for booking (missing, no open day, or a day the engine can't read) — callers get a message taken, not a time. "
      + `Stored: ${JSON.stringify(hours ?? null)}`;
  }
  return `bookable — ${Object.entries(canonical).map(([day, value]) => `${day.slice(0, 3)} ${value}`).join(", ")}`;
}

async function main() {
  const businessId = businessIdFromArgs(process.argv.slice(2));
  admin.initializeApp({ credential: admin.credential.cert(credential()) });
  const db = admin.firestore();
  const businessRef = db.collection("businesses").doc(businessId);
  const businessSnapshot = await businessRef.get();
  if (!businessSnapshot.exists) throw new ScriptError(`Business ${businessId} was not found`);
  const business = businessSnapshot.data() ?? {};
  const timeZone = typeof business.timezone === "string" ? business.timezone : "America/New_York";
  const now = Date.now();
  const end = now + DAYS * 24 * 60 * 60 * 1000;
  const [crews, appointments, jobs, locks] = await Promise.all([
    businessRef.collection("crews").get(),
    businessRef.collection("appointments").where("startTime", ">=", now).where("startTime", "<", end).get(),
    businessRef.collection("jobs").where("scheduledStart", ">=", now).where("scheduledStart", "<", end).get(),
    businessRef.collection("schedulingLocks").where("bucketStart", ">=", now).where("bucketStart", "<", end).get(),
  ]);
  const activeCrewCount = crews.docs.filter((doc) => doc.data().active !== false).length;
  const rows = [
    ...appointments.docs.map((doc) => {
      const data = doc.data();
      return { id: doc.id, kind: "appointment", startTime: data.startTime, status: data.status, source: data.sourceCallId ? "call" : "seed" };
    }),
    ...jobs.docs.map((doc) => {
      const data = doc.data();
      return { id: doc.id, kind: "job", startTime: data.scheduledStart, status: data.status, source: data.sourceCallId ? "call" : "seed" };
    }),
    ...locks.docs.map((doc) => {
      const data = doc.data();
      return { id: doc.id, label: `${doc.id} -> ${data.entityId ?? "unknown"}`, kind: "lock", startTime: data.bucketStart, status: data.entityType, source: "scheduler" };
    }),
  ].filter((entry) => timestampMillis(entry.startTime) !== null);

  console.log(`Business: ${businessId}`);
  console.log(`Timezone: ${timeZone}`);
  console.log(`Hours: ${parseHoursSummary(business.businessHours)}`);
  console.log(`Capacity: ${Math.max(1, activeCrewCount)} (${activeCrewCount} active crew/resource docs)`);
  console.log(`Next ${DAYS} days: ${rows.length} appointments/jobs/locks`);
  for (const row of sortScheduleRows(rows)) console.log(`- ${formatScheduleRow(row, timeZone)}`);
  console.log("Read-only check complete. No data was changed.");
}

main().catch((error) => {
  console.error(error instanceof ScriptError ? `Booking data check failed: ${error.message}` : "Booking data check failed. Check credentials and Firestore access locally.");
  process.exitCode = 1;
});
