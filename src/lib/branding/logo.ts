// Logo library rendering rules (Phase 12, Phase 4 remainder). Pure — no
// Firestore/React imports — so both server routes (validating an upload) and
// client components (choosing how to draw a logo) share the exact same caps
// and decision, instead of re-deriving them.
import type { CSSProperties } from "react";
import type { LibraryLogo } from "@/types/library";

// 5 x 180KB = 900KB, matching the MAX_FULL_BYTES precedent (src/lib/photos/store.ts)
// and staying comfortably under Firestore's 1MiB-per-document cap even with the
// doc's other small fields. Validate the SUM on write, not just each entry — five
// logos each just under the per-item cap could still blow the document limit.
export const MAX_LOGO_B64_BYTES = 180_000;
export const MAX_LOGOS = 5;

export function totalLogoBytes(logos: LibraryLogo[]): number {
  return logos.reduce((sum, l) => sum + l.b64.length, 0);
}

/** `<img src>`-ready data URI — logos are stored as bare base64 (no `data:` prefix), same as LibraryDocument.b64. */
export function logoDataUri(logo: Pick<LibraryLogo, "b64" | "mimeType">): string {
  return `data:${logo.mimeType};base64,${logo.b64}`;
}

/**
 * How to draw a logo depending on what's behind it.
 *
 * "light"     — a white document header (the invoice, this app's own printed-
 *                invoice-style letterhead). A color or mono-dark logo needs zero
 *                treatment here; that's the whole point of preferring "color".
 * "brand-bar" — a colored bar (the emailed notification header, the report
 *                cover). mono-light already reads on a dark/colored bar as-is;
 *                mono-dark needs to be knocked out to white; a full-color logo
 *                gets neither filter — it sits on a small white pill instead, so
 *                its real colors still show without fighting the bar's own color.
 */
export function logoStyle(logo: Pick<LibraryLogo, "variant">, surface: "light" | "brand-bar"): CSSProperties {
  if (surface === "light") return {};
  if (logo.variant === "mono-dark") return { filter: "brightness(0) invert(1)" };
  return {};
}

/** True only for the one case that needs the white chip behind it — a full-color
 *  logo rendered on a colored bar (see logoStyle's doc comment for why). */
export function needsLogoChip(logo: Pick<LibraryLogo, "variant">, surface: "light" | "brand-bar"): boolean {
  return surface === "brand-bar" && logo.variant === "color";
}

export function pickDefaultLogo(logos: LibraryLogo[]): LibraryLogo | null {
  return logos.find((l) => l.isDefault) ?? logos[0] ?? null;
}
