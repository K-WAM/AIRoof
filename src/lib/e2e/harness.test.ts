import { afterEach, describe, expect, it, vi } from "vitest";
import { isE2EHarness } from "@/lib/e2e/harness";
import { fixtureParseFieldUpdate } from "@/lib/e2e/fixtureAi";

// The harness switch bypasses credentials and captures email, so it must be impossible to turn on outside a local emulator.
describe("isE2EHarness", () => {
  afterEach(() => vi.unstubAllEnvs());
  const on = () => {
    vi.stubEnv("E2E_HARNESS", "1");
    vi.stubEnv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8100");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "");
  };

  it("is on only with the flag, a loopback emulator, and a non-production build", () => {
    on();
    expect(isE2EHarness()).toBe(true);
  });

  it("is off without the flag", () => {
    on();
    vi.stubEnv("E2E_HARNESS", "");
    expect(isE2EHarness()).toBe(false);
  });

  it("is off in production even if everything else is set", () => {
    on();
    vi.stubEnv("NODE_ENV", "production");
    expect(isE2EHarness()).toBe(false);
  });

  it("is off on Vercel", () => {
    on();
    vi.stubEnv("VERCEL", "1");
    expect(isE2EHarness()).toBe(false);
  });

  it.each(["", "firestore.googleapis.com:443", "10.0.0.5:8080", "evil.example.com:8080", "127.0.0.1"])("is off for emulator host %j", (host) => {
    on();
    vi.stubEnv("FIRESTORE_EMULATOR_HOST", host);
    expect(isE2EHarness()).toBe(false);
  });
});

describe("fixtureParseFieldUpdate", () => {
  it("extracts materials, labor, issues and timeline from a plain note", () => {
    const parsed = fixtureParseFieldUpdate("Used 12 bundles of shingles. Carlos worked 8 hours. Found a cracked vent boot.", "en");
    expect(parsed.materials).toEqual([{ item: "shingles", quantity: "12", unit: "bundles" }]);
    expect(parsed.labor).toEqual([{ description: "Carlos labor", hours: 8, source: "voice" }]);
    expect(parsed.issues).toEqual([{ description: "cracked vent boot", severity: "medium" }]);
    expect(parsed.timeline).toHaveLength(3);
    expect(parsed.sourceLanguage).toBe("en");
  });

  it("puts an unrecognised note in the timeline only", () => {
    const parsed = fixtureParseFieldUpdate("Arrived on site and set up the ladder");
    expect(parsed.materials).toEqual([]);
    expect(parsed.timeline).toEqual([{ description: "Arrived on site and set up the ladder" }]);
  });
});
