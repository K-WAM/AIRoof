// One-line explanations for the customer-copy options, shared by the quote, invoice and report so all three say the
// same thing. They describe the CUSTOMER COPY only (preview, print/PDF and email) — the editor always shows every
// row. Semantics live in src/types/documentOptions.ts; keep these two files in step.

export const OPTIONS_HEADING = "What the customer sees";
export const OPTIONS_SUBHEADING = "These change the customer's copy only. You always see every line here.";

export const OPTION_COPY = {
  hideMaterials: {
    label: "Hide materials",
    hint: "Materials show as one total line instead of an item list.",
  },
  hideLabor: {
    label: "Hide labor details",
    hint: "Labor shows as one total line — no names, hours or rates.",
  },
  showTechnicians: {
    label: "Show technicians",
    hint: "Prints the crew names on the document.",
  },
} as const;

export type OptionKey = keyof typeof OPTION_COPY;
