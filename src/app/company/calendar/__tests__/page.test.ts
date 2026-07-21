import { describe, expect, it } from "vitest";

import { runOptimisticCalendarMutation } from "@/app/company/calendar/optimisticMutation";

describe("calendar optimistic persistence", () => {
  it("restores the truthful item after a conflict response", async () => {
    const original = { crewId: "crew-a", startTime: 100 };
    let rendered = original;

    const result = await runOptimisticCalendarMutation({
      apply: () => {
        rendered = { crewId: "crew-b", startTime: 200 };
      },
      persist: async () =>
        new Response(
          JSON.stringify({ error: "That crew is already assigned during this time." }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        ),
      rollback: () => {
        rendered = original;
      },
      fallbackError: "The assignment could not be saved.",
    });

    expect(rendered).toBe(original);
    expect(result).toEqual({
      ok: false,
      error: "That crew is already assigned during this time.",
    });
  });

  it("restores the item after a mid-drag network failure", async () => {
    const original = { crewId: undefined, startTime: 100 };
    let rendered: { crewId?: string; startTime: number } = original;

    const result = await runOptimisticCalendarMutation({
      apply: () => {
        rendered = { crewId: "crew-b", startTime: 200 };
      },
      persist: async () => {
        throw new Error("connection lost");
      },
      rollback: () => {
        rendered = original;
      },
      fallbackError: "The calendar was restored; try again.",
    });

    expect(rendered).toBe(original);
    expect(result).toEqual({
      ok: false,
      error: "The calendar was restored; try again.",
    });
  });
});
