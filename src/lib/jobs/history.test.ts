import { describe, expect, it } from "vitest";
import { buildJobHistory, type HistorySources } from "./history";
import type { Job } from "@/types/jobs";

const T = 1_700_000_000_000;
const min = (n: number) => T + n * 60_000;

const job = (over: Partial<Job> = {}): Job => ({
  jobId: "J-1", businessId: "biz", title: "Roof", status: "in_progress", createdAt: min(10), updatedAt: min(90), ...over,
});

describe("buildJobHistory", () => {
  it("tells the whole story in order: call, request, job, arrival, field update, photo, finding, departure, quote, invoice", () => {
    const src: HistorySources = {
      job: job({ sourceCallId: "c1", appointmentId: "a1", findings: [{ findingId: "f1", category: "Tile", problem: "Six cracked tiles", solution: "x", includeInReport: true, includeInQuote: true, addedAt: min(40) }] }),
      call: { callId: "c1", startedAt: min(0), callerName: "Maria", summary: "Caller reports cracked tiles." },
      appointment: { appointmentId: "a1", createdAt: min(3), callerName: "Maria", serviceType: "Roof inspection" },
      punches: [{ punchId: "p1", type: "site_in", workerName: "Marco", at: min(30), jobId: "J-1" }, { punchId: "p2", type: "site_out", workerName: "Marco", at: min(80), jobId: "J-1" }],
      updates: [{ updateId: "u1", rawText: "usé doce paquetes", rawTextEn: "used twelve bundles", submittedBy: "Marco", createdAt: min(35) }],
      photos: [{ photoId: "ph1", label: "South slope", uploadedBy: "Marco", createdAt: min(38) }],
      quote: { quoteId: "Q-1", createdAt: min(85), sentAt: min(88), sentTo: "maria@example.com", status: "sent", updatedAt: min(88) } as never,
      invoice: { invoiceId: "INV-1", createdAt: min(120), sentAt: min(125), sentTo: "maria@example.com", status: "sent" } as never,
    };
    expect(buildJobHistory(src).map((e) => e.title)).toEqual([
      "Call received", "Appointment requested", "Job created", "Arrived at the job", "Field update", "Photo added",
      "Finding added", "Left the job", "Quote Q-1 drafted", "Quote sent", "Invoice INV-1 created", "Invoice sent",
    ]);
  });

  it("is sorted by time and uses the English rendering of a Spanish note", () => {
    const events = buildJobHistory({ job: job(), updates: [{ updateId: "u1", rawText: "usé doce paquetes", rawTextEn: "used twelve bundles", submittedBy: "Marco", createdAt: min(20) }] });
    expect(events.map((e) => e.at)).toEqual([...events.map((e) => e.at)].sort((a, b) => a - b));
    expect(events.find((e) => e.kind === "field")?.detail).toBe("used twelve bundles");
  });

  it("derives status changes from the append-only trail, with who", () => {
    const events = buildJobHistory({ job: job({ statusHistory: [{ status: "quoted", at: min(50), by: "staff1" }, { status: "complete", at: min(95), by: "Marco" }] }) });
    const statuses = events.filter((e) => e.kind === "status");
    expect(statuses.map((e) => e.title)).toEqual(["Status: Quoted", "Status: Complete"]);
    expect(statuses[1].by).toBe("Marco");
  });

  it("does not invent events it has no timestamp for", () => {
    const events = buildJobHistory({
      job: job({ assignedCrewId: "crew1" }), // assigned but no scheduledStart => no schedule event
      quote: { quoteId: "Q-1", createdAt: min(20), status: "sent", updatedAt: min(21) } as never, // sent but no sentAt => no 'sent' event
      call: { callId: "c1" }, // no time at all => omitted
    });
    expect(events.map((e) => e.title)).toEqual(["Job created", "Quote Q-1 drafted"]);
  });

  it("only includes punches for THIS job and records quote answers", () => {
    const events = buildJobHistory({
      job: job(),
      punches: [{ punchId: "p1", type: "site_in", workerName: "Marco", at: min(30), jobId: "J-1" }, { punchId: "p9", type: "site_in", workerName: "Ana", at: min(31), jobId: "J-OTHER" }, { punchId: "p3", type: "office_in", workerName: "Ana", at: min(5) }],
      quote: { quoteId: "Q-1", createdAt: min(40), sentAt: min(41), status: "accepted", updatedAt: min(60) } as never,
    });
    expect(events.filter((e) => e.kind === "arrive")).toHaveLength(1);
    expect(events.map((e) => e.title)).toContain("Quote accepted");
  });

  it("dates a quote answer by answeredAt (not a later edit) and records a paid invoice", () => {
    const events = buildJobHistory({
      job: job(),
      quote: { quoteId: "Q-1", createdAt: min(40), sentAt: min(41), status: "accepted", answeredAt: min(50), updatedAt: min(70) } as never,
      invoice: { invoiceId: "INV-1", createdAt: min(80), sentAt: min(81), sentTo: "a@b.co", paidAt: min(95) } as never,
    });
    expect(events.find((e) => e.title === "Quote accepted")?.at).toBe(min(50));
    expect(events.find((e) => e.title === "Invoice paid")?.at).toBe(min(95));
  });

  it("labels where the job came from and clips long text", () => {
    const long = "word ".repeat(200);
    const events = buildJobHistory({ job: job({ leadId: "l1" }), call: { callId: "c", startedAt: min(0), summary: long } });
    expect(events.find((e) => e.kind === "job")?.detail).toBe("From a lead");
    expect(events.find((e) => e.kind === "call")!.detail!.length).toBeLessThanOrEqual(200);
  });
});
