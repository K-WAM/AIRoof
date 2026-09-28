/**
 * "(305) 555-0111" for a US/Canada number in any shape (+13055550111, 305.555.0111, 1-305-555-0111). Anything else —
 * international, an extension, a placeholder like "caller ID" — comes back exactly as given, never mangled.
 */
export function fmtPhone(value?: string | null): string {
  if (!value) return "";
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (/[a-z]/i.test(trimmed)) return trimmed;
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits.length === 10 ? digits : null;
  return national ? `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}` : trimmed;
}

/** The last ten digits (a leading US "1" dropped), or null for anything under 7 digits — "caller ID", "unknown". */
function phoneKey(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

/** True when two numbers are the same line however they were written (+19548829586 vs "954-882-9586"). */
export function samePhone(a?: string | null, b?: string | null): boolean {
  const left = phoneKey(a);
  return left !== null && left === phoneKey(b);
}

/**
 * The number to reach a caller on. `callbackPhone` is the one they SAID on the call when it differs from caller ID
 * (2026-09-28: Carla said "305-389-4611", the booking kept the caller ID and Call Back rang a line that went to a
 * carrier recording). `callerPhone` stays the caller ID — lookups and cancels match on it.
 */
export function contactPhone(record: { callbackPhone?: unknown; callerPhone?: unknown }): string | undefined {
  for (const value of [record.callbackPhone, record.callerPhone]) {
    if (typeof value === "string" && phoneKey(value)) return value.trim();
  }
  return undefined;
}
