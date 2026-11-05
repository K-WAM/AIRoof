import { describe, expect, it } from "vitest";
import { linkedJobIds } from "../linkedJobs";

describe("linkedJobIds", () => {
  it("collects only the jobs the visible requests link to, once each", () => {
    const appointments = [
      { jobId: "J-1", sourceCallId: "call_1" },
      { jobId: "J-2", sourceCallId: "call_2" },
      { sourceCallId: "call_3" },
    ];
    const leads = [
      { jobId: "J-2" },
      { sourceCallId: "call_1" },
      { sourceCallId: "call_3" },
      {},
    ];
    expect(linkedJobIds(leads, appointments).sort()).toEqual(["J-1", "J-2"]);
  });

  it("returns nothing when no visible request has a job", () => {
    expect(linkedJobIds([{}], [{}])).toEqual([]);
    expect(linkedJobIds([], [])).toEqual([]);
  });
});
