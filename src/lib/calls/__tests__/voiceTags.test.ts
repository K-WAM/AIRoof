import { describe, it, expect } from "vitest";
import { displayLine, stripVoiceTags } from "../voiceTags";
import { normalizeProviderTranscriptMessages } from "../endOfCallWriter";

describe("voice tags in transcripts", () => {
  it("drops ElevenLabs delivery tags from agent lines (owner's 2026-10-30 call)", () => {
    expect(stripVoiceTags("[Efficient] Great. And what is the address?")).toBe("Great. And what is the address?");
    expect(stripVoiceTags("[Friendly] Sí, hablo español. [warm laugh] ¿Cómo puedo ayudarte?")).toBe("Sí, hablo español. ¿Cómo puedo ayudarte?");
  });
  it("never rewrites a caller's words", () => {
    expect(displayLine("caller", "[inaudible] my roof is leaking")).toBe("[inaudible] my roof is leaking");
  });
  it("leaves agent text without tags unchanged", () => {
    expect(displayLine("agent", "Your number ends in seven, seven, nine, one.")).toBe("Your number ends in seven, seven, nine, one.");
  });
  it("stores clean agent lines from the provider transcript", () => {
    const [agent, caller] = normalizeProviderTranscriptMessages([
      { role: "agent", message: "[Efficient] Thanks, Kareem." },
      { role: "user", message: "[sic] 317 West Riverbend" },
    ]);
    expect(agent.text).toBe("Thanks, Kareem.");
    expect(caller.text).toBe("[sic] 317 West Riverbend");
  });
});
