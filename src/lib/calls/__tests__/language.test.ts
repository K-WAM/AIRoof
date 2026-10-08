import { describe, expect, it } from "vitest";
import { detectCallerLanguage } from "@/lib/calls/endOfCallWriter";
import { guessCallCategory } from "@/lib/calls/category";
import type { CallMessage } from "@/types";

const msg = (role: CallMessage["role"], text: string, i = 0): CallMessage => ({ messageId: `m_${i}`, role, text, timestamp: 0 });

describe("detectCallerLanguage", () => {
  it("tags a Spanish caller", () => {
    expect(detectCallerLanguage([msg("agent", "Thanks for calling. También hablamos español."), msg("caller", "Hola, tengo una gotera en el techo de la casa.")])).toBe("es");
  });
  it("ignores the agent's Spanish invite on an English call", () => {
    expect(detectCallerLanguage([msg("agent", "Thanks for calling. También hablamos español."), msg("caller", "My roof is leaking near the chimney.")])).toBeUndefined();
  });
});

describe("guessCallCategory in Spanish", () => {
  it("reads a Spanish leak as an emergency and a Spanish booking as scheduling", () => {
    expect(guessCallCategory([msg("caller", "Tengo una gotera grande")])).toBe("Emergency");
    expect(guessCallCategory([msg("caller", "Quiero una cita para una inspección")])).toBe("Scheduling");
    expect(guessCallCategory([msg("caller", "¿Cuánto cuesta un techo nuevo? Necesito un presupuesto")])).toBe("Service question");
  });
});
