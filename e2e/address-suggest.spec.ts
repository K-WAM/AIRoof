// T-319: the job form offers the addresses the business already has for the
// chosen customer. Runs on desktop and phone. Do not run without the harness
// (`npm run e2e:up:bg`) — see docs/SMOKE-HARNESS.md.
import { test, expect, settle, expectHealthy, shot } from "./fixtures";
import { api, must } from "../scripts/e2e/lib.cjs";

const PROS_ADDRESS = "123 Main St, Miami, FL";

test("picks a saved property when creating a job for a customer with several addresses", async ({ as }) => {
  const page = await as("proOwner");
  await page.goto("/company/jobs");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.getByRole("button", { name: /New Job/i }).click();
  await page.locator('input[name="title"]').fill(`Lakeview roof check ${Date.now()}`);

  const customer = page.getByPlaceholder("John Smith, or start typing to find an existing one");
  await customer.fill("Lakeview");
  await page.getByRole("option", { name: /Lakeview County Schools/ }).click();
  await expect(customer).toHaveValue("Lakeview County Schools");

  const address = page.getByPlaceholder(PROS_ADDRESS);
  await address.click();
  const list = page.getByRole("listbox");
  await expect(list).toBeVisible();
  await expect(page.getByRole("option", { name: /101 Lakeview Drive/ })).toBeVisible();
  await shot(page, "address-suggest-pros");

  await page.getByRole("option", { name: /101 Lakeview Drive/ }).click();
  await expect(address).toHaveValue("101 Lakeview Drive");
  await expect(list).not.toBeVisible();

  await page.getByRole("button", { name: /Create Job/i }).click();
  await expect(page.getByText(/Job J-.* created/)).toBeVisible();
  await expectHealthy(page);
  await settle(page);
});

test("shows no suggestion list for a customer with nothing on file", async ({ as }) => {
  const owner = await api("owner");
  const name = `No Saved Address ${Date.now()}`;
  must(await owner.post("/api/company/customers", { businessId: "e2e-roofing", name, kind: "residential" }), "customer without addresses");

  const page = await as("owner");
  await page.goto("/company/jobs");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.getByRole("button", { name: /New Job/i }).click();
  const customer = page.getByPlaceholder("John Smith, or start typing to find an existing one");
  await customer.fill(name);
  await page.getByRole("option", { name: new RegExp(name) }).click();

  const address = page.getByPlaceholder(PROS_ADDRESS);
  await address.click();
  await address.fill("900 Free Typing Road");
  await expect(page.getByRole("listbox")).not.toBeVisible();
  await expect(address).toHaveValue("900 Free Typing Road");
  await shot(page, "address-suggest-empty");
  await expectHealthy(page);
});
