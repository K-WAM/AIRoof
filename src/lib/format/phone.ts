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
