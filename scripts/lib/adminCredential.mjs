// Shared, secret-safe loader for the Firebase service account used by operator scripts (T-170/T-171).
// Reads FIREBASE_SERVICE_ACCOUNT_JSON from the environment or from .env.local (override the file with
// ADMIN_SCRIPT_ENV_FILE). Never prints any part of the credential — parse failures say only that parsing failed.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export class ScriptError extends Error {}

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

export function serviceAccount() {
  let raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    let env = "";
    try {
      env = readFileSync(resolve(process.env.ADMIN_SCRIPT_ENV_FILE ?? ".env.local"), "utf8");
    } catch {
      throw new ScriptError("FIREBASE_SERVICE_ACCOUNT_JSON is not set and .env.local could not be read");
    }
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

/** "kwamwad@gmail.com" -> "kw*****@gmail.com" — enough for the owner to recognise, not enough to harvest. */
export function maskEmail(email) {
  if (typeof email !== "string" || !email.includes("@")) return "(no email)";
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

/** Parse `--flag value` / `--flag=value` / bare `--switch` arguments; unknown flags are an error. */
export function parseArgs(argv, { values = [], switches = [] }) {
  const out = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const [flag, inline] = arg.split(/=(.*)/s, 2);
    const name = flag.replace(/^--/, "");
    if (switches.includes(name) && inline === undefined) { out[name] = true; continue; }
    if (values.includes(name)) {
      const value = inline ?? argv[++index];
      if (value === undefined || value.startsWith("--")) throw new ScriptError(`--${name} needs a value`);
      if (out[name] !== undefined) throw new ScriptError(`--${name} given twice`);
      out[name] = value;
      continue;
    }
    throw new ScriptError(`Unknown argument: ${arg}`);
  }
  return out;
}
