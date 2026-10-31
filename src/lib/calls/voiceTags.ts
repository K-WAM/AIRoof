// ElevenLabs' expressive voice (eleven_v3_conversational) lets the model prefix a line with a delivery
// tag — "[Efficient] Great. And what's the address?" — that sets tone and is never spoken. The provider
// transcript keeps the tag, so without this the office reads "[Friendly]" in every agent line (seen on the
// owner's 2026-10-30 call). Agent lines only: a caller's words are never rewritten.
const VOICE_TAG = /\[[A-Za-z][A-Za-z' -]{0,30}\]\s*/g;

export function stripVoiceTags(text: string): string {
  return text.replace(VOICE_TAG, "").replace(/\s{2,}/g, " ").trim();
}

/** The transcript text to show or store for one line: agent lines lose their voice tags. */
export function displayLine(role: string | undefined, text: string): string {
  return role === "agent" ? stripVoiceTags(text) : text;
}
