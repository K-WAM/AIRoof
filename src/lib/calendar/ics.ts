// RFC 5545 text for an inspector's phone-calendar feed (T-153 B5). Pure: no Firestore, no clock except `now` passed in.
//
// What goes IN an event is deliberately small (integrator decision, 2026-09-28): the feed URL is a bearer link — anyone
// holding it can read it without signing in — so an event carries only what a calendar needs to be useful: the time,
// "Inspection — Carla E.", the address (for directions) and a sign-in link to the Field screen. Phone numbers, gate
// codes, "Access:"/"URGENT:" notes and call summaries stay behind the login. Widening this needs an owner decision.

export interface FeedBooking {
  appointmentId: string;
  startTime: number;
  endTime?: number;
  callerName?: string;
  serviceType?: string;
  address?: string;
  /** Still waiting for the office's confirmation — shown as TENTATIVE. */
  pendingConfirmation?: boolean;
}

export interface FeedBlock {
  blockId: string;
  startTime: number;
  endTime: number;
  label: string;
}

/** "Carla Esnaida" → "Carla E."; one word stays as is. */
export function shortName(name?: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Customer";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** TEXT escaping (RFC 5545 §3.3.11): backslash, semicolon, comma, newline. */
export function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** 20260928T170000Z */
export function icsUtc(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Lines longer than 75 octets are folded with CRLF + one space (§3.1), never splitting a UTF-8 character. */
export function foldLine(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char, "utf8");
    if (bytes + size > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function buildInspectorFeed(input: {
  calendarName: string;
  bookings: FeedBooking[];
  blocks: FeedBlock[];
  fieldUrl: string;
  now: number;
}): string {
  const stamp = icsUtc(input.now);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Luxor CRM//Inspector schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(input.calendarName)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT30M",
    "X-PUBLISHED-TTL:PT30M",
  ];
  for (const booking of input.bookings) {
    const end = booking.endTime && booking.endTime > booking.startTime ? booking.endTime : booking.startTime + 60 * 60 * 1000;
    const what = booking.serviceType?.trim() || "Inspection";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${booking.appointmentId}@luxor`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsUtc(booking.startTime)}`,
      `DTEND:${icsUtc(end)}`,
      `SUMMARY:${escapeText(`${what} — ${shortName(booking.callerName)}`)}`,
      ...(booking.address?.trim() ? [`LOCATION:${escapeText(booking.address.trim())}`] : []),
      `DESCRIPTION:${escapeText(`Phone, access notes and call details are in the app (sign-in needed): ${input.fieldUrl}`)}`,
      `STATUS:${booking.pendingConfirmation ? "TENTATIVE" : "CONFIRMED"}`,
      "END:VEVENT",
    );
  }
  for (const block of input.blocks) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:block-${block.blockId}@luxor`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsUtc(block.startTime)}`,
      `DTEND:${icsUtc(block.endTime)}`,
      `SUMMARY:${escapeText(`Blocked — ${block.label}`)}`,
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
