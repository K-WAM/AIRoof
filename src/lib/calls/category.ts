/** The rough topic badge on a Calls row, from the words spoken. Computed on the server for the slim list, so the list
 *  never has to download every transcript just to draw a badge. */
export type CallCategory = "Emergency" | "Scheduling" | "Service question" | "General";

export function guessCallCategory(messages: Array<{ role?: string; text?: string }> | undefined): CallCategory {
  const text = (messages ?? []).filter((m) => m.role !== "system").map((m) => m.text ?? "").join(" ").toLowerCase();
  if (text.includes("leak") || text.includes("water") || text.includes("flood") || text.includes("emergency")) return "Emergency";
  if (text.includes("inspect") || text.includes("appointment") || text.includes("book") || text.includes("schedule")) return "Scheduling";
  if (text.includes("price") || text.includes("cost") || text.includes("quote") || text.includes("how much")) return "Service question";
  return "General";
}
