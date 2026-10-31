// Returning-caller recognition for the phone AI (2026-10-31, Tuesday roofing demo).
//
// At call start (the ElevenLabs initiation webhook, while the phone is still ringing) we look up what this tenant
// already knows about the caller's number — their upcoming visit and their customer record — and hand it to the agent
// in the prompt. Nothing extra happens during the conversation: no tool call, no "let me check", no added latency.
//
// Identity is the EXACT caller-ID number (last 10 digits, so "+1 305…" and "305…" agree), never a "similar" number
// and never a name alone: a name is only how the agent confirms it is talking to the person on file. Anything that
// fails or runs past the time budget returns null, and the call proceeds exactly as before.

import type { Firestore } from "firebase-admin/firestore";

/** Hard ceiling on the lookup, so recognition can never slow the call answer. */
export const RETURNING_CALLER_BUDGET_MS = 800;
/** A visit that started up to 2 h ago is still "upcoming" (same grace as lookupAppointment). */
const UPCOMING_GRACE_MS = 2 * 60 * 60 * 1000;
const ACTIVE_STATUSES = new Set(["requested", "confirmed"]);
/** Customer-note lines that tell a visitor how to get in. Anything else in notes is office-only and stays out. */
const ACCESS_HINT = /\b(gate|code|lock ?box|key|dog|dogs|pet|pets|park|parking|access|buzz|portón|codigo|código|perro)\b/i;

export interface ReturningCaller {
  /** Names on file for this number (a shared household phone can have two). Never empty. */
  names: string[];
  upcoming?: { serviceType: string; when: string; address?: string; confirmed: boolean };
  address?: string;
  access?: string;
}

type Doc = Record<string, unknown>;

export async function findReturningCaller(
  db: Pick<Firestore, "collection">,
  businessId: string,
  callerPhone: string | undefined,
  timezone: string,
  now: number = Date.now()
): Promise<ReturningCaller | null> {
  const caller10 = last10(callerPhone);
  if (!caller10 || !callerPhone) return null;
  const business = db.collection("businesses").doc(businessId);

  // Two single-field queries (auto-indexed, no composite index): the AI stores the caller ID verbatim on its bookings,
  // and every customer carries its phone's last 7 digits as a search token.
  const [appointmentSnap, customerSnap] = await Promise.all([
    business.collection("appointments").where("callerPhone", "==", callerPhone.trim()).limit(10).get(),
    business.collection("customers").where("searchTokens", "array-contains", caller10.slice(-7)).limit(5).get(),
  ]);

  const appointments = appointmentSnap.docs
    .map((doc) => doc.data() as Doc)
    .filter((data) => last10(str(data.callerPhone)) === caller10);
  const customers = customerSnap.docs
    .map((doc) => doc.data() as Doc)
    .filter((data) => last10(str(data.phone)) === caller10)
    .sort((a, b) => num(b.lastJobAt) - num(a.lastJobAt));

  const upcomingDoc = appointments
    .filter((data) => ACTIVE_STATUSES.has(str(data.status) ?? "") && num(data.startTime) >= now - UPCOMING_GRACE_MS)
    .sort((a, b) => num(a.startTime) - num(b.startTime))[0];
  const latestPast = appointments
    .filter((data) => data !== upcomingDoc)
    .sort((a, b) => num(b.startTime) - num(a.startTime))[0];
  const customer = customers[0];

  const names = unique([
    cleanName(upcomingDoc?.callerName),
    cleanName(customer?.name),
    cleanName(latestPast?.callerName),
  ]).slice(0, 2);
  if (names.length === 0) return null;

  const upcomingAddress = cleanAddress(upcomingDoc?.address);
  const address = upcomingAddress ?? cleanAddress(customer?.address) ?? cleanAddress(latestPast?.address);
  const access = accessFromAppointment(upcomingDoc) ?? accessFromAppointment(latestPast) ?? accessFromCustomer(customer);

  return {
    names,
    ...(upcomingDoc
      ? {
          upcoming: {
            serviceType: str(upcomingDoc.serviceType)?.trim() || "visit",
            when: new Date(num(upcomingDoc.startTime)).toLocaleString("en-US", {
              weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: timezone,
            }),
            ...(upcomingAddress ? { address: upcomingAddress } : {}),
            confirmed: str(upcomingDoc.status) === "confirmed" && upcomingDoc.pendingConfirmation !== true,
          },
        }
      : {}),
    ...(address ? { address } : {}),
    ...(access ? { access } : {}),
  };
}

/** Resolve within `ms` or give up with null — a slow lookup must never hold up the call answer. */
export async function withinBudget<T>(work: Promise<T>, ms: number = RETURNING_CALLER_BUDGET_MS): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ms); });
  try {
    return await Promise.race([work.catch(() => null), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** The prompt section. Pure, so the exact wording is unit-tested. */
export function returningCallerSection(caller: ReturningCaller): string {
  const who = caller.names.join(" or ");
  const facts = [
    caller.upcoming
      ? `- Upcoming visit: ${caller.upcoming.serviceType} on ${caller.upcoming.when}${caller.upcoming.address ? ` at ${caller.upcoming.address}` : ""} (${caller.upcoming.confirmed ? "confirmed by the office" : "waiting for the office to confirm"}).`
      : "",
    caller.address ? `- Address on file: ${caller.address}` : "",
    caller.access ? `- Access note on file: ${caller.access}` : "",
  ].filter(Boolean);

  return `## Returning Caller (matched by caller ID — confirm before using)
This phone number is on file for ${who}.
${facts.join("\n")}
How to use this:
- Say NOTHING from this section until the caller tells you a name that matches one above (the first name is enough) or asks about their appointment. Never say you looked them up or recognised the number. Someone else may share this phone.
- Once the name matches, greet them by name naturally, like you remember them ("Hi ${firstName(caller.names[0])}, good to hear from you again").
${caller.upcoming ? `- They already have the upcoming visit above. If they call to book, mention it in one short sentence first ("I see you're on for ${caller.upcoming.when} — is this about that visit, or something new?"). If they ask when it is, answer from the line above without a tool call. To change or cancel it, follow your usual lookupAppointment steps.\n` : ""}- Booking a new visit for them: don't ask their name again.${caller.address ? ` Instead of asking for the address, ask "Is this for ${caller.address} again?" — if yes, use that address (ZIP included); if no, ask for the new one as usual.` : ""}${caller.access ? ` For access, ask "Same access as before?" without reading the code aloud — if yes, put the access note above into notes as "Access: …".` : ""} Everything else (phone confirmation, email, time) works as usual.
- If the caller gives a different name or says it isn't them, treat them as a new caller and never reveal anything from this section.`;
}

function accessFromAppointment(data: Doc | undefined): string | undefined {
  const notes = str(data?.notes);
  if (!notes) return undefined;
  const lines = notes.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^access\s*:/i.test(line));
  return lines.length ? clip(lines.map((line) => line.replace(/^access\s*:\s*/i, "")).join("; ")) : undefined;
}

function accessFromCustomer(data: Doc | undefined): string | undefined {
  const notes = str(data?.notes);
  if (!notes) return undefined;
  const lines = notes.split(/\r?\n|;\s*/).map((line) => line.trim()).filter((line) => line && ACCESS_HINT.test(line));
  return lines.length ? clip(lines.join("; ")) : undefined;
}

function cleanName(value: unknown): string | undefined {
  const name = str(value)?.replace(/\s+/g, " ").trim();
  return name && name.length <= 60 && /\p{L}/u.test(name) ? name : undefined;
}

function cleanAddress(value: unknown): string | undefined {
  const address = str(value)?.replace(/\s+/g, " ").trim();
  return address && address !== "Not provided" && address.length <= 160 ? address : undefined;
}

function unique(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const key = value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(value); }
  }
  return out;
}

function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
}

function clip(value: string): string {
  return value.length > 120 ? `${value.slice(0, 117)}…` : value;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
}

/** The number's last 10 digits ("+1 (305) 555-0123" → "3055550123"); undefined below 7 digits. */
function last10(value: string | undefined): string | undefined {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : undefined;
}
