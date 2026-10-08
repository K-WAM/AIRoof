/** The rough topic badge on a Calls row, from the words spoken. Computed on the server for the slim list, so the list
 *  never has to download every transcript just to draw a badge. */
export type CallCategory = "Emergency" | "Scheduling" | "Service question" | "General";

export function guessCallCategory(messages: Array<{ role?: string; text?: string }> | undefined): CallCategory {
  const text = (messages ?? []).filter((m) => m.role !== "system").map((m) => m.text ?? "").join(" ").toLowerCase();
  const has = (words: string[]) => words.some((w) => text.includes(w));
  // English and Spanish — every line is bilingual (src/lib/i18n/bilingual.ts).
  if (has(["leak", "water", "flood", "emergenc", "gotera", "fuga", "agua", "inunda"])) return "Emergency";
  if (has(["inspect", "appointment", "book", "schedule", "cita", "agendar", "programar", "reservar"])) return "Scheduling";
  if (has(["price", "cost", "quote", "how much", "precio", "cotizaci", "presupuesto", "cuánto", "cuanto"])) return "Service question";
  return "General";
}
