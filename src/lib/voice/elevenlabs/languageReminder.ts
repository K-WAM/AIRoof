// Owner's call (2026-10-30): the caller switched Spanish → English and the agent kept answering in Spanish
// right after a tool result. Tool results are written in English and arrive at the exact moment the model
// picks its reply language, so each one ends with this nudge. It is about the reply language only — the
// result text itself stays English (the model reads it, the caller never hears it verbatim).
import type { AgentToolResult } from "@/lib/tools/toolDispatcher";

export const LANGUAGE_REMINDER = "(Reply in the language of the caller's last message — English or Spanish.)";

export function withLanguageReminder(result: AgentToolResult): AgentToolResult {
  if (typeof result.result !== "string" || !result.result.trim()) return result;
  return { ...result, result: `${result.result}\n${LANGUAGE_REMINDER}` };
}
