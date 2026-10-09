import { describe, expect, it } from "vitest";
import { makeFakeDb } from "@/test-utils/fakeFirestore";
import { VERTICAL_TEMPLATES, type VerticalId } from "../templates";
import { VERTICAL_PITCH } from "../pitch";
import { ensureSandboxBusiness, isVerticalId, sandboxBusinessId } from "../sandboxBusiness";
import { jobSteps } from "@/lib/jobs/nextStep";

const industries = Object.keys(VERTICAL_TEMPLATES) as VerticalId[];

describe("per-industry pitch (the /try demo link)", () => {
  it("every industry has a name, a headline, three points and a flow that only shows screens it has", () => {
    for (const id of industries) {
      const pitch = VERTICAL_PITCH[id];
      expect(pitch.demoName, id).toMatch(/\(Demo\)$/);
      expect(pitch.points, id).toHaveLength(3);
      expect(pitch.flow[0], id).toBe("call");
      if (VERTICAL_TEMPLATES[id].disabledModules.includes("jobs")) {
        // A front-desk industry (dental, care homes…) never promises field reports or invoices.
        expect(pitch.flow.some((step) => step === "field" || step === "invoice" || step === "paid"), id).toBe(false);
      }
    }
  });
  it("dog walking leads with scheduling and getting paid", () => {
    expect(VERTICAL_PITCH["pet-care"].flow).toEqual(["call", "calendar", "field", "invoice", "paid"]);
  });
});

describe("set-price work (templates.ts quotes: false)", () => {
  it("dog walking skips Findings and Quote: Work → Report → Invoice", () => {
    expect(VERTICAL_TEMPLATES["pet-care"].quotes).toBe(false);
    expect(jobSteps({ status: "open" }, { quotes: false }).map((s) => s.id)).toEqual(["work", "report", "invoice"]);
    expect(jobSteps({ status: "open" }).map((s) => s.id)).toEqual(["findings", "quote", "work", "report", "invoice"]);
  });
});

describe("per-industry sandbox businesses", () => {
  it("accepts only template industry ids and maps them to demo-try-<industry>", () => {
    expect(isVerticalId("pet-care")).toBe(true);
    expect(isVerticalId("../businesses/real-tenant")).toBe(false);
    expect(sandboxBusinessId("dental")).toBe("demo-try-dental");
  });

  it("creates the industry's demo business with its own data, once, and refuses a non-demo business on that id", async () => {
    const db = makeFakeDb();
    const now = Date.UTC(2026, 9, 9, 15);
    expect(await ensureSandboxBusiness(db as never, "pet-care", now)).toBe(true);
    expect(db.__peek("businesses", "demo-try-pet-care")).toMatchObject({ industry: "pet-care", isDemo: true, businessName: "Happy Tails Dog Walking (Demo)", seedVersion: 2, seedingAt: null });
    const walkers = db.__list("businesses/demo-try-pet-care/crews").map((c) => c.data.name);
    expect(walkers).toContain("Sam (walker)");
    const jobs = db.__list("businesses/demo-try-pet-care/jobs").map((j) => j.data);
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.some((j) => j.status === "inspection" || j.status === "quoted")).toBe(false);
    expect(jobs.filter((j) => typeof j.scheduledStart === "number" && j.assignedCrewId)).toHaveLength(4);

    // Fresh (same day): nothing rewritten.
    db.__seed("businesses/demo-try-pet-care/calls", "marker", { keep: true });
    await ensureSandboxBusiness(db as never, "pet-care", now + 60_000);
    expect(db.__peek("businesses/demo-try-pet-care/calls", "marker")).toBeTruthy();
    // A day later: old data cleared, reseeded.
    await ensureSandboxBusiness(db as never, "pet-care", now + 25 * 3_600_000);
    expect(db.__peek("businesses/demo-try-pet-care/calls", "marker")).toBeUndefined();

    db.__seed("businesses", "demo-try-dental", { businessName: "A real practice", isDemo: false });
    expect(await ensureSandboxBusiness(db as never, "dental", now)).toBe(false);
    expect(db.__peek("businesses", "demo-try-dental")).toMatchObject({ businessName: "A real practice" });
  });
});
