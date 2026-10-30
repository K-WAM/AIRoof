// The ZIP rule for phone bookings (owner, 2026-10-30). An address becomes the job's service and billing address, so a
// field-service booking must carry its ZIP code. The prompt already asks for it; this makes the rule hold whatever
// model runs the call (gemini-2.5-flash booked "120 Palm Way, Boca Raton" without asking in 3 of 3 test runs).

/** Shown to the model when it tries to book an address without a ZIP — it asks, then books again. */
export const MISSING_ZIP_RESULT =
  'NOT BOOKED: the address has no ZIP code. Ask the caller "And what\'s the ZIP code there?", then call bookAppointment again with the ZIP at the end of the address. If they do not know it, add "ZIP unknown" to the end of the address and call bookAppointment again.';

// A US ZIP (or ZIP+4) that is not the house number at the very start of the address ("12345 Palm Way" has no ZIP).
const US_ZIP = /\d{5}(?:-\d{4})?/g;
// A Canadian postal code ("V6B 1A1") — the demo also answers a Canadian line.
const CA_POSTAL = /\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d\b/i;
// The caller did not know it, said in either language.
const ZIP_UNKNOWN = /\bzip(?:\s*code)?\s+unknown\b|\bunknown\s+zip\b|c[oó]digo\s+postal\s+desconocido|sin\s+c[oó]digo\s+postal/i;

export function addressHasPostalCode(address: string): boolean {
  const text = address.trim();
  if (CA_POSTAL.test(text) || ZIP_UNKNOWN.test(text)) return true;
  for (const match of text.matchAll(US_ZIP)) {
    const index = match.index ?? 0;
    const before = text[index - 1];
    const after = text[index + match[0].length];
    // A whole 5-digit group (not part of a longer number) that is not the house number at the start.
    if (index > 0 && !/\d/.test(before ?? "") && !/\d/.test(after ?? "")) return true;
  }
  return false;
}
