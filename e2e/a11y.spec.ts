import AxeBuilder from "@axe-core/playwright";
import { api, must } from "../scripts/e2e/lib.cjs";
import { expect, expectHealthy, shot, test } from "./fixtures";

for (const screen of ["Dashboard", "Calendar", "Jobs", "Job detail", "Pipeline", "Field", "Login", "Legal"]) {
  test(`${screen} has no serious or critical accessibility violations`, async ({ as, page: publicPage }) => {
    const isPublic = screen === "Login" || screen === "Legal";
    const page = isPublic ? publicPage : await as(screen === "Field" ? "fieldCrew" : "owner");
    let path = screen === "Login" ? "/login" : screen === "Legal" ? "/legal/terms" : `/company/${screen.toLowerCase()}`;
    if (screen === "Job detail") {
      const owner = await api("owner");
      const { job } = must(await owner.post("/api/jobs", { businessId: "e2e-roofing", title: `Accessibility ${Date.now()}`, clientName: "Alex Test", address: "12 Test Street" }), "create accessibility job");
      path = `/company/jobs/${job.jobId}`;
    }
    await page.goto(path);
    await expect(page.getByRole("heading").first()).toBeVisible();
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    if (screen === "Field") await expect(page.getByTestId("job-selected")).toBeVisible();
    await expect(page.getByText(/Failed to load this page|This page couldn.t load/)).toHaveCount(0);
    await expectHealthy(page);
    const results = await new AxeBuilder({ page }).analyze();
    const violations = results.violations.filter(({ impact }) => impact === "critical" || impact === "serious");
    await test.info().attach("axe", { body: JSON.stringify(violations, null, 2), contentType: "application/json" });
    await shot(page, `a11y-${screen}`);
    expect(violations, `${screen}: ${violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`).join("\n")}`).toEqual([]);
  });
}
