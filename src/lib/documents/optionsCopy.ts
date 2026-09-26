// One-line explanations for the customer-copy options, shared by the quote, invoice and report so all three say the
// same thing. They describe the CUSTOMER COPY only (preview, print/PDF and email) — the editor always shows every
// row. Semantics live in src/types/documentOptions.ts; keep these two files in step.

export const OPTIONS_HEADING = "What the customer sees";
export const OPTIONS_SUBHEADING = "These change the customer's copy only. You always see every line here.";

export const OPTION_COPY = {
  hideMaterials: {
    label: "Hide materials",
    hint: "On quotes and invoices, materials show as one total line. Reports omit the materials section.",
  },
  hideLabor: {
    label: "Hide labor details",
    hint: "Labor shows as one total line — no names, hours or rates.",
  },
  showTechnicians: {
    label: "Show technicians",
    hint: "Prints the crew names on the document.",
  },
  includeQuote: {
    label: "Include the quote",
    hint: "Adds the quote's work and prices to this report. Off by default: a report is otherwise price-free.",
  },
} as const;

/** Why "Include the quote" can't be switched on yet (shown in place of its hint). */
export const INCLUDE_QUOTE_NEEDS_SENT_QUOTE = "Send the quote first — only a sent or accepted quote can go on the report.";

export type OptionKey = keyof typeof OPTION_COPY;
