import { describe, it, expect } from "vitest";
import { buildWhisperPrompt } from "../whisperPrompt";

describe("buildWhisperPrompt", () => {
  it("includes job context and the vertical's own voice example", () => {
    const prompt = buildWhisperPrompt({ title: "Roof repair", clientName: "Wynmoor" }, undefined, "roofing", []);
    expect(prompt).toContain("Roof repair");
    expect(prompt).toContain("Wynmoor");
  });

  it("omits Spanish correction cues when the tenant has no Spanish enabled", () => {
    const prompt = buildWhisperPrompt(undefined, undefined, "roofing", []);
    expect(prompt).not.toContain("Las correcciones");
  });

  it("includes Spanish correction cues only when agentLanguages includes es", () => {
    const prompt = buildWhisperPrompt(undefined, ["en", "es"], "roofing", []);
    expect(prompt).toContain("Las correcciones");
  });

  it("appends Library material names, capped at 30", () => {
    const names = Array.from({ length: 40 }, (_, i) => `Material ${i}`);
    const prompt = buildWhisperPrompt(undefined, undefined, "roofing", names);
    expect(prompt).toContain("Material 0");
    expect(prompt).not.toContain("Material 35");
  });

  it("never exceeds the 224-token (≈896 char) cap even with a huge material list", () => {
    const names = Array.from({ length: 30 }, (_, i) => `A very long material name number ${i} with extra words`);
    const prompt = buildWhisperPrompt({ title: "x".repeat(500) }, ["en", "es"], "roofing", names);
    expect(prompt.length).toBeLessThanOrEqual(224 * 4);
  });

  it("truncates the material list before ever touching the instructions", () => {
    const names = Array.from({ length: 30 }, (_, i) => `Material-${i}`);
    const prompt = buildWhisperPrompt(undefined, undefined, "roofing", names);
    expect(prompt).toContain("Corrections sound like: make that 120 not 150, scratch that, I meant.");
  });
});
