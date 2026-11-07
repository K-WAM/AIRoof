import { expect, it } from "vitest";
import { applyPortalPatch, portalPatchSchema } from "../admin";
import { portalDefaults } from "../defaults";
it("rejects injected timestamps, duplicate ids and oversized portal content", () => {
  const portal = portalDefaults("a", "Example", 1);
  for (const patch of [
    { steps: [{ ...portal.steps[0], completedAt: 12 }] },
    { steps: [{ ...portal.steps[0], id: "UPPERCASE" }] },
    { steps: Array.from({ length: 13 }, (_, i) => ({ ...portal.steps[0], id: `step-${i}` })) },
    { checklist: Array.from({ length: 61 }, (_, i) => ({ ...portal.checklist[0], id: `item-${i}` })) },
    { steps: [portal.steps[0], portal.steps[0]] },
    { checklist: [{ ...portal.checklist[0], internalNote: "x".repeat(501) }] },
    { settings: { paymentsSetupFeePerCompany: -1 } },
    { settings: { paymentsSetupFeePerCompany: 1.5 } },
    { dataReview: { title: "Test", intro: "", sections: [{ heading: "Test", body: "x".repeat(4001) }] } },
  ]) expect(portalPatchSchema.safeParse(patch).success).toBe(false);
});
it("sets completion/received timestamps on the server and preserves them on later edits", () => {
  const portal = portalDefaults("a", "Example", 1);
  const changed = applyPortalPatch(portal, { steps: portal.steps.map((s, i) => ({ ...s, status: i === 0 ? "done" : s.status })), checklist: portal.checklist.map((s, i) => ({ ...s, status: i === 0 ? "received" : s.status })) }, 100);
  expect(changed.steps[0].completedAt).toBe(100); expect(changed.steps[1].status).toBe("current"); expect(changed.checklist[0].receivedAt).toBe(100);
  const again = applyPortalPatch(changed, { checklist: changed.checklist.map(({ receivedAt: _at, ...i }) => i) }, 200);
  expect(again.checklist[0].receivedAt).toBe(100);
});
