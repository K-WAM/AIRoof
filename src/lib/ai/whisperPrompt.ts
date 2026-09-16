// Whisper's biasing `prompt` param (Phase 12, Phase 6) — extracted from
// field-audio/route.ts so it's industry- and tenant-driven instead of the
// old hardcoded roofing-English text. Whisper's prompt works best as example
// text in the SAME STYLE as expected speech (not instructions), which is
// exactly what a vertical's voiceExample already is.
import { getVerticalTemplate } from "@/lib/verticals/templates";

// Whisper's documented hard limit is 224 tokens; ~4 chars/token is a safe,
// conservative proxy that never overshoots for this kind of plain-English/
// Spanish prose (real BPE tokenizers average closer to ~4.5-5 for English).
const MAX_PROMPT_CHARS = 224 * 4;
const MAX_MATERIAL_NAMES = 30;

export function buildWhisperPrompt(
  jobContext: { title?: string; address?: string; serviceType?: string; clientName?: string } | undefined,
  agentLanguages: string[] | undefined,
  industry: string | undefined,
  libraryMaterialNames: string[] = [],
): string {
  const template = getVerticalTemplate(industry ?? "");
  const context = [jobContext?.title, jobContext?.clientName, jobContext?.address, jobContext?.serviceType]
    .filter(Boolean)
    .join(", ");

  const parts = [
    context ? `Job-site field update for: ${context}.` : "Job-site field update from a service crew.",
    template.vocab.voiceExample,
    "Corrections sound like: make that 120 not 150, scratch that, I meant.",
  ];

  // Spanish correction cues only when this tenant actually has Spanish enabled — otherwise this
  // is dead weight against the 224-token cap for a business that will never hear it.
  if (agentLanguages?.includes("es")) {
    parts.push("Las correcciones suenan así: que sean 120 no 150, olvida eso, quise decir.");
  }

  let prompt = parts.join(" ");

  // The tenant's own Library material names are the exact words Whisper mishears most (a
  // roofing-specific brand name, a plumbing fitting size) — a real accuracy win independent of
  // Spanish. Truncate the material list first if the cap is tight, never the instructions above.
  if (libraryMaterialNames.length > 0) {
    const room = MAX_PROMPT_CHARS - prompt.length - 1;
    if (room > 10) {
      const namesStr = libraryMaterialNames.slice(0, MAX_MATERIAL_NAMES).join(", ");
      prompt += ` ${namesStr.slice(0, room)}`;
    }
  }

  return prompt.length > MAX_PROMPT_CHARS ? prompt.slice(0, MAX_PROMPT_CHARS) : prompt;
}
