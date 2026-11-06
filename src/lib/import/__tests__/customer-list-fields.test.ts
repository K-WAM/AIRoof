import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { missingCustomerListFields, historyForCustomer } from "../../../../scripts/lib/customer-list-fields.mjs";
const options = { businessId: "e2e-example", customerId: "C-1", now: 1000 };
it("fills every list field and uses the latest matching history date", () => {
  const customer = { name: "Invented Customer" };
  const history = historyForCustomer(customer, "C-1", [{ customerId: "C-1", issuedAt: 1200 }, { customerName: "Invented Customer", dueAt: 1500 }, { customerId: "C-2", dueAt: 9999 }]);
  expect(missingCustomerListFields(customer, { ...options, history })).toMatchObject({ lastJobAt: 1500, jobCount: 0, active: true, matchKey: "invented customer|", customerId: "C-1" });
});
it("falls back to import time and preserves false, zero and empty existing fields", () => {
  expect(missingCustomerListFields({ name: "Example", importedAt: 900 }, options).lastJobAt).toBe(900);
  expect(missingCustomerListFields({ name: "Example" }, options).lastJobAt).toBe(1000);
  const first = { name: "Example", ...missingCustomerListFields({ name: "Example" }, options), active: false, jobCount: 0, searchTokens: [] };
  expect(missingCustomerListFields(first, { ...options, now: 2000 })).toEqual({});
});
it("indexes name, contact, address and phone with diacritics folded", () => {
  const fields = missingCustomerListFields({ name: "Jos\u00e9 Example", phone: "555-123-9876", address: "Palm Road", contacts: [{ name: "Robin" }] }, options);
  expect(fields.searchTokens).toEqual(expect.arrayContaining(["jose", "robin", "palm", "9876", "1239876"]));
});
it.each([["--business", "demo-roofing"], ["--business", "other"], ["--business", "e2e-example", "--apply", "--confirm", "wrong"]])("refuses unsafe CLI target/confirmation before connecting", (...args) => {
  const result = spawnSync(process.execPath, ["scripts/backfill-customer-list-fields.mjs", ...args], { env: { ...process.env, FIRESTORE_EMULATOR_HOST: "127.0.0.1:1" }, encoding: "utf8", timeout: 10000 });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Use --business <allowed id>");
});
