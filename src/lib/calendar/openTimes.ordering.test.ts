import { expect, it } from "vitest";
import { orderOpenTimes } from "./openTimes";

const at = (hour: number) => Date.UTC(2026, 8, 29, hour);
it("starts a 24/7 list at 7 AM local and preserves earlier choices", () => {
  const starts = [at(0), at(1), at(6), at(7), at(8)];
  expect(orderOpenTimes(starts, "UTC", true)).toEqual({ preferred: [at(7), at(8)], earlier: [at(0), at(1), at(6)] });
});
it("keeps a regular tenant's opening order", () => {
  const starts = [at(6), at(7), at(8)];
  expect(orderOpenTimes(starts, "UTC", false)).toEqual({ preferred: starts, earlier: [] });
});
