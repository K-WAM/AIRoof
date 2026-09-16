import { describe, it, expect } from "vitest";
import { matchesJobSearch } from "../search";
import type { Job } from "@/types/jobs";

function job(overrides: Partial<Job> = {}): Job {
  return {
    jobId: "J-1004",
    title: "Roof inspections and assessments — 120 NW 7th St, Miami, FL",
    status: "in_progress",
    businessId: "demo-roofing",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    clientName: "Jordan Blake",
    clientPhone: "+13055550110",
    address: "120 NW 7th St, Miami, FL",
    serviceType: "Roof inspection",
    ...overrides,
  } as Job;
}

describe("matchesJobSearch", () => {
  it("matches bare digits against a hyphenated job id", () => {
    expect(matchesJobSearch(job({ jobId: "J-1004" }), "1004")).toBe(true);
  });

  it("matches the full job id regardless of dash/case", () => {
    expect(matchesJobSearch(job({ jobId: "J-1004" }), "j1004")).toBe(true);
    expect(matchesJobSearch(job({ jobId: "J-1004" }), "J-1004")).toBe(true);
  });

  it("matches client name case-insensitively", () => {
    expect(matchesJobSearch(job({ clientName: "Jordan Blake" }), "blake")).toBe(true);
    expect(matchesJobSearch(job({ clientName: "Jordan Blake" }), "JORDAN")).toBe(true);
  });

  it("matches title/address substrings", () => {
    expect(matchesJobSearch(job({ address: "88 Brickell Ave, Miami, FL" }), "brickell")).toBe(true);
  });

  it("matches phone numbers ignoring formatting", () => {
    expect(matchesJobSearch(job({ clientPhone: "+1 (305) 555-0110" }), "5550110")).toBe(true);
    expect(matchesJobSearch(job({ clientPhone: "+1 (305) 555-0110" }), "3055550110")).toBe(true);
  });

  it("does not match a short 1-2 digit query against phone (too weak a signal)", () => {
    expect(matchesJobSearch(job({ jobId: "J-9999", clientPhone: "+13055550110" }), "11")).toBe(false);
  });

  it("returns everything for an empty query", () => {
    expect(matchesJobSearch(job(), "")).toBe(true);
    expect(matchesJobSearch(job(), "   ")).toBe(true);
  });

  it("does not match an unrelated query", () => {
    expect(matchesJobSearch(job(), "zzz-no-match")).toBe(false);
  });
});
