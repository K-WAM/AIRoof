import type { VerticalVocab } from "@/lib/verticals/templates";

/**
 * Shared vocabulary (C-F, T-163). These are the plain meanings the product
 * shows a client for the words the pipeline uses, so "request", "booking",
 * "confirmed", "job" and "callback" read the same on every screen. Industry
 * nouns always come from `vocab` — never hardcode "job" for a tenant whose
 * template calls it something else.
 */
export type GlossaryKind = "request" | "booking" | "confirmed" | "job" | "callback";

export interface GlossaryEntry {
  term: string;
  meaning: string;
}

const FIXED: Record<Exclude<GlossaryKind, "job">, GlossaryEntry> = {
  request: {
    term: "Request",
    meaning: "Anything the AI captured on a call — it shows up in the Pipeline.",
  },
  booking: {
    term: "Booking",
    meaning: "A request with a time the caller picked, waiting for the office to say yes.",
  },
  confirmed: {
    term: "Confirmed",
    meaning: "The office said yes to the caller's time.",
  },
  callback: {
    term: "Callback",
    meaning: "A request for the office to call the caller back.",
  },
};

/** The term + one-line meaning for a workflow word; `job` follows the template. */
export function glossaryEntry(
  kind: GlossaryKind,
  vocab?: Pick<VerticalVocab, "jobNoun">
): GlossaryEntry {
  if (kind === "job") {
    return {
      term: vocab?.jobNoun ?? "Job",
      meaning: "The work record the office created from a confirmed booking.",
    };
  }
  return FIXED[kind];
}

export function glossaryTerm(kind: GlossaryKind, vocab?: Pick<VerticalVocab, "jobNoun">): string {
  return glossaryEntry(kind, vocab).term;
}

export function glossaryMeaning(kind: GlossaryKind, vocab?: Pick<VerticalVocab, "jobNoun">): string {
  return glossaryEntry(kind, vocab).meaning;
}
