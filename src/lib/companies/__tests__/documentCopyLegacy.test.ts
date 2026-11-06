import { expect, it } from "vitest";
import { refreshGeneratedText, resolvedInvoiceCopy } from "../documentCopy";

const business = {
  industry: "roofing",
  billingCompanies: [{ id: "south", name: "South Roofing", shortName: "S", isDefault: true }, { id: "north", name: "North Roofing", shortName: "N" }],
};

it("new invoices thank the customer for their trade, not their job", () => {
  const copy = resolvedInvoiceCopy({ createdAt: 1, thankYou: "Thank you for allowing South Roofing to take care of your roofing needs." }, business, { address: "1 Way" }, "North Roofing");
  expect(copy.thankYou).toBe("Thank you for allowing North Roofing to take care of your roofing needs.");
});

it("a draft still holding the old generated wording (job noun) is refreshed on a company switch", () => {
  const copy = resolvedInvoiceCopy({ createdAt: 1, thankYou: "Thank you for allowing South Roofing to take care of your job needs." }, business, { address: "1 Way" }, "North Roofing");
  expect(copy.thankYou).toBe("Thank you for allowing North Roofing to take care of your roofing needs.");
});

it("wording the office edited is never overwritten", () => {
  const edited = "Thanks from South Roofing, see you next season.";
  expect(resolvedInvoiceCopy({ createdAt: 1, thankYou: edited }, business, { address: "1 Way" }, "North Roofing").thankYou).toBe(edited);
  expect(refreshGeneratedText(edited, ["South", "North"], "North", (n) => `Hi ${n}`, (n) => `Hello ${n}`)).toBe(edited);
});

it("refreshes the old job noun even when the company stays the same", () => {
  const copy = resolvedInvoiceCopy({ createdAt: 1, thankYou: "Thank you for allowing South Roofing to take care of your job needs." }, business, {}, "South Roofing");
  expect(copy.thankYou).toBe("Thank you for allowing South Roofing to take care of your roofing needs.");
});
