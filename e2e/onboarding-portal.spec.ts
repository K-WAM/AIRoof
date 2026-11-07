import { test, expect, shot, expectHealthy } from "./fixtures";
import type { OnboardingFormDefinition, OnboardingOption } from "../src/types/onboarding";
import { APP_URL } from "../scripts/e2e/config.cjs";

// Run only against the local harness. No seed changes or external provider calls.
test("client completes all setup forms through a private link; Luxor reviews masked answers", async ({ as, browser }, testInfo) => {
  test.setTimeout(240_000);
  const admin = await as("superadmin");
  const adminPath = "/admin/businesses/e2e-roofing/onboarding";
  const api = "/api/admin/businesses/e2e-roofing/onboarding";
  await admin.goto(adminPath);
  await expect(admin.getByRole("heading", { name: /Onboarding ·/ })).toBeVisible();
  // Reset form states for repeatability through the real, guarded API.
  const settings = await admin.request.patch(api, { data: { forms: Object.fromEntries(["texting", "payments", "team", "company", "documents"].map(id => [id, { enabled: true, status: "sent" }])) } });
  expect(settings.ok()).toBeTruthy();
  expect((await admin.request.delete(`${api}/link`)).ok()).toBeTruthy();
  await admin.reload();
  await admin.getByRole("button", { name: "Create link", exact: true }).click();
  await expect(admin.getByRole("button", { name: "Copy link", exact: true })).toBeVisible();
  const { portal } = await (await admin.request.get(api)).json();
  await shot(admin, "onboarding-admin-portal", testInfo);
  await expectHealthy(admin);

  const context = await browser.newContext({ baseURL: APP_URL, viewport: testInfo.project.use.viewport ?? { width: 1280, height: 800 } });
  try {
    const client = await context.newPage();
    await client.goto(`/o/${portal.link.token}`);
    await expect(client).toHaveURL(`${APP_URL}/onboarding`);
    await expect(client.getByRole("heading", { name: /Welcome,/ })).toBeVisible();
    const cookie = (await context.cookies()).find(c => c.name === "onb");
    expect(cookie?.httpOnly).toBeTruthy(); expect(cookie?.sameSite).toBe("Lax");
    await shot(client, "onboarding-client-portal", testInfo);
    expect(await client.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();

    for (const formId of ["texting", "payments", "team", "company", "documents"]) {
      await client.goto(`/onboarding/forms/${formId}`);
      const read = await client.request.get(`/api/onboarding/forms/${formId}`); expect(read.ok()).toBeTruthy();
      const payload = await read.json();
      const def = payload.definition as OnboardingFormDefinition;
      await expect(client.getByRole("heading", { name: def.title, exact: true })).toBeVisible();
      await client.locator("#onb-submittedBy").fill("");
      await client.getByRole("button", { name: def.submitLabel, exact: true }).click();
      await expect(client.getByText("Enter your name.", { exact: true })).toBeVisible();
      for (const field of def.sections.flatMap(s => s.fields)) {
        const options = field.optionsFrom ? payload.prefill[field.optionsFrom] as OnboardingOption[] : field.options ?? [];
        if (field.optionsFrom && options.length < 2) continue;
        if (field.showIf) continue; // The first fixed option below never selects a conditional "other" answer.
        const input = client.locator(`#onb-${field.id}`);
        if (field.type === "text" || field.type === "textarea") await input.fill(`Example ${field.label}`.slice(0, field.max ?? 100));
        else if (field.type === "email") await input.fill("office@example.test");
        else if (field.type === "tel") await input.fill("9545550123");
        else if (field.type === "url") await input.fill("https://example.test");
        else if (field.type === "ein") await input.fill("987654321");
        else if (field.type === "number" || field.type === "money") await input.fill("100");
        else if (field.type === "select") await input.selectOption(options[0].value);
        else if (field.type === "checkbox") await input.check();
        else if (field.type === "radio") await client.getByRole("group", { name: new RegExp(field.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).getByLabel(options[0].label, { exact: true }).check();
        else if (field.type === "checkboxes") {
          const group = client.locator(`[aria-labelledby="onb-${field.id}-label"]`);
          for (const checkbox of await group.getByRole("checkbox").all()) await checkbox.uncheck();
          await group.getByLabel(options[0].label, { exact: true }).check();
        } else if (field.type === "address") {
          for (const [label, value] of [["Street address", "123 Example Street"], ["City", "Example City"], ["State", "FL"], ["ZIP code", "33333"]]) await client.getByLabel(`${field.label}: ${label}`, { exact: true }).fill(value);
        } else if (field.type === "people") {
          // Keep the prefilled rows; the added row demonstrates the editable roster.
          await client.getByRole("button", { name: "Add person", exact: true }).click();
          const rows = client.locator('[aria-label^="Person "]');
          const row = rows.last();
          await row.getByLabel(/^Name, person/).fill("Example New Person");
          await row.getByLabel(/^Work email, person/).fill("person@example.test");
        } else if (field.type === "matrix") {
          await client.locator(`[aria-labelledby="onb-${field.id}-label"]`).getByRole("button", { name: options[0].label, exact: true }).first().click();
        }
      }
      const name = `Example ${formId} Owner`;
      await client.locator("#onb-submittedBy").fill(name);
      await expect(client.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible({ timeout: 15_000 });
      await client.reload();
      await expect(client.locator("#onb-submittedBy")).toHaveValue(name);
      if (formId === "texting") {
        await expect(client.locator("#onb-ein")).toHaveValue("••-•••4321");
        await shot(client, "onboarding-texting-form", testInfo);
      }
      expect(await client.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      await client.getByRole("button", { name: def.submitLabel, exact: true }).click();
      await expect(client.getByRole("heading", { name: "Thank you", exact: true })).toBeVisible();
      const review = await admin.request.get(`${api}/forms/${formId}`); expect(review.ok()).toBeTruthy();
      expect((await review.json()).submission.submittedBy).toBe(name);
    }
    await admin.reload();
    const textingRow = admin.locator("article").filter({ has: admin.getByRole("heading", { name: "Turn on text messages", exact: true }) });
    await textingRow.getByRole("button", { name: "View answers", exact: true }).click();
    const sheet = admin.getByRole("dialog");
    await expect(sheet.getByText("••-•••4321", { exact: true })).toBeVisible();
    await sheet.getByRole("button", { name: "Show full EIN", exact: true }).click();
    await expect(sheet.getByText("98-7654321", { exact: true })).toBeVisible();
    await sheet.getByRole("button", { name: "Close", exact: true }).click();
    await textingRow.getByRole("button", { name: "Mark reviewed", exact: true }).click();
    await expect(textingRow.getByText("Reviewed", { exact: true })).toBeVisible();
    await expectHealthy(admin);
  } finally { await context.close(); }
});
