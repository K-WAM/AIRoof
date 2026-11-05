import { describe, expect, it, vi } from "vitest";
import { monthKey, recordUsage } from "./meter";

function db(fail = false) {
  const sets: Array<{ path: string; data: Record<string, unknown> }> = [];
  const ref = (path: string) => ({
    collection: (c: string) => ({ doc: (d: string) => ref(`${path}/${c}/${d}`) }),
    set: async (data: Record<string, unknown>) => { if (fail) throw new Error("quota"); sets.push({ path, data }); },
  });
  return { sets, collection: (c: string) => ({ doc: (d: string) => ref(`${c}/${d}`) }) };
}

describe("usage meter", () => {
  it("bumps one doc per client per month, only the counters given", async () => {
    const fake = db();
    const at = Date.UTC(2026, 9, 4);
    await recordUsage(fake as never, "biz", { voiceNotes: 1, voiceSeconds: 42, typedNotes: 0 }, at);
    expect(monthKey(at)).toBe("2026-10");
    expect(fake.sets).toHaveLength(1);
    expect(fake.sets[0].path).toBe("businesses/biz/usageMonths/2026-10");
    expect(Object.keys(fake.sets[0].data).sort()).toEqual(["updatedAt", "voiceNotes", "voiceSeconds"]);
  });

  it("never throws: a failed count must not fail the worker's note", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(recordUsage(db(true) as never, "biz", { notesRead: 1 })).resolves.toBeUndefined();
    warn.mockRestore();
  });

  it("also bumps a non-default company's counter under byCompany", async () => {
    const fake = db();
    await recordUsage(fake as never, "biz", { typedNotes: 2, notesRead: 1 }, Date.UTC(2026, 9, 4), "rcu");
    const data = fake.sets[0].data;
    expect(data.byCompany).toMatchObject({ rcu: { typedNotes: expect.anything(), notesRead: expect.anything() } });
    expect(data.typedNotes).toBeDefined();
  });

  it("cannot write a malformed company key", async () => {
    const fake = db();
    await recordUsage(fake as never, "biz", { typedNotes: 1 }, Date.UTC(2026, 9, 4), "RC U/../x");
    expect(fake.sets[0].data).not.toHaveProperty("byCompany");
  });
});
