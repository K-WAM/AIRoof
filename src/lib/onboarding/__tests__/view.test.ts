import { expect, it } from "vitest";
import { portalDefaults } from "../defaults";
import { publicView } from "../view";
it("never exposes link, internal notes, tenant id or fee internals", () => {
  const portal = portalDefaults("private-tenant", "Example");
  portal.checklist[0].internalNote = "private note";
  portal.settings.paymentsSetupFeePerCompany = 98765;
  portal.link = { token: "private-token", hint: "oken", createdAt: 1, expiresAt: 123456 };
  portal.forms.team.enabled = false;
  portal.checklist.push({ id: "team-test", group: "Team", title: "Team", status: "waiting", formId: "team" });
  const view = publicView(portal); const json = JSON.stringify(view);
  for (const secret of ["internalNote", "private note", "private-token", "link", "private-tenant", "98765", "paymentsSetupFeePerCompany"]) expect(json).not.toContain(secret);
  expect(view.forms.some(f => f.id === "team")).toBe(false);
  expect(view.checklist.at(-1)?.formId).toBeUndefined();
  expect(view.expiresAt).toBe(123456);
});
