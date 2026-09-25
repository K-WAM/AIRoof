import { expect, it } from "vitest";
import { suggestFindings } from "./suggestFindings";
it("ranks folded issue overlap and excludes selected findings", () => {
  const job = { findings: [{ itemId: "used" }], parsed: { issues: [{ description: "Teja dañada", severity: "high" }] } } as never;
  const items = [{ itemId: "used", problem: "Teja dañada", solution: "x", category: "x", createdAt: 1 }, { itemId: "tile", problem: "Teja dañada", solution: "Repair tile", category: "x", createdAt: 1 }, { itemId: "none", problem: "Gutter", solution: "x", category: "x", createdAt: 1 }];
  expect(suggestFindings(job, items).map((item) => item.itemId)).toEqual(["tile"]);
});
