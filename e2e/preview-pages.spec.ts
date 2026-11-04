import { test, expect, expectHealthy, shot } from "./fixtures";

const screens = ["finances", "payroll", "permits"] as const;

for (const screen of screens) {
  test(`owner cannot open ${screen} preview`, async ({ as }) => {
    const page = await as("owner");
    await page.goto(`/company/preview/${screen}`);
    await expect(page.getByText("Not available", { exact: true })).toBeVisible();
    await expect(page.getByTestId("preview-page")).toHaveCount(0);
    await expectHealthy(page);
  });

  test(`superadmin sees ${screen} sample preview`, async ({ as }) => {
    const page = await as("superadmin");
    await page.goto(`/company/preview/${screen}?preview=demo-roofing`);
    await expect(page.getByText("Preview — sample data", { exact: true })).toBeInViewport();
    await expect(page.getByRole("heading", { level: 1, name: screen === "permits" ? "Permit Leads" : new RegExp(screen, "i") })).toBeInViewport();
    await expect(page.getByTestId("preview-page")).toContainText("RoofDoctors South Florida");
    if (screen === "payroll") {
      await expect(page.getByRole("button", { name: /Approve period/ })).toBeDisabled();
      await expect(page.getByRole("button", { name: /Export CSV/ })).toBeDisabled();
      await expect(page.getByTestId("preview-page")).toContainText("Missing clock-out");
    }
    if (screen === "permits") {
      await expect(page.getByTestId("permit-row")).toHaveCount(5);
      await expect(page.getByRole("button", { name: /Create request/ })).toBeDisabled();
    }
    await expectHealthy(page);
    await shot(page, `preview-${screen}`);
    if (screen === "permits") {
      await page.getByRole("combobox", { name: "County", exact: true }).selectOption("Broward");
      await expect(page.getByRole("status")).toContainText("5 permits");
      await page.getByRole("combobox", { name: "Roof work", exact: true }).selectOption("Repair");
      await expect(page.getByTestId("permit-row")).toHaveCount(1);
      await expect(page.getByTestId("permit-row")).toContainText("DEMO-BR-260726");
      await page.getByRole("combobox", { name: "Property", exact: true }).selectOption("Commercial");
      await expect(page.getByRole("heading", { name: "No permits match these filters" })).toBeVisible();
      await page.getByRole("button", { name: "Reset filters" }).click();
      await page.getByLabel("From", { exact: true }).fill("2026-11-29");
      await page.getByLabel("Through", { exact: true }).fill("2026-11-29");
      await expect(page.getByTestId("permit-row")).toHaveCount(1);
      await expect(page.getByTestId("permit-row")).toContainText("DEMO-PB-260315");
      await page.getByRole("button", { name: "Reset filters" }).click();
      await page.getByRole("button", { name: "Next permits" }).click();
      await expect(page.getByTestId("permit-row").first()).toContainText("DEMO-PB-260314");
      await page.getByRole("button", { name: "Next permits" }).click();
      await expect(page.getByTestId("permit-row").last()).toContainText("DEMO-PB-260311");
      await expect(page.getByRole("button", { name: "Next permits" })).toBeDisabled();
    }
  });
}
