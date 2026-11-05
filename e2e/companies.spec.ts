import { api, must } from "../scripts/e2e/lib.cjs";
import { test, expect, expectHealthy, shot } from "./fixtures";

// Runs on the existing desktop + 375 px phone projects. The integrator runs this spec and reads its screenshots.
test("two companies share the shell, drafts follow the job, and sent invoices keep their company", async ({ as }) => {
  test.setTimeout(180_000);
  const owner = await api("proOwner");
  const { job } = must(await owner.post("/api/jobs", { businessId: "e2e-roofpros", title: "Company letterhead review", customerId: "C-3160", clientName: "Lakeview County Schools", address: "316 School Test Road" }), "company job");
  expect(job.companyId).toBe("rcu");
  must(await owner.post(`/api/jobs/${job.jobId}/invoice`, { businessId: "e2e-roofpros" }), "draft invoice");
  must(await owner.patch(`/api/jobs/${job.jobId}/invoice`, { businessId: "e2e-roofpros", other: [{ lineId: "repair", description: "Sample repair", amount: 500 }] }), "invoice line");
  const page = await as("proOwner");
  await page.goto(`/company/jobs/${job.jobId}?tab=invoice`);
  await expect(page.getByRole("heading", { name: "Company letterhead review" })).toBeVisible();
  const brand = page.locator(".company-brand:visible");
  await expect(brand.getByRole("img", { name: "Roof Pros South logo", exact: true })).toBeInViewport();
  await expect(brand.getByRole("img", { name: "Concepts Unlimited logo", exact: true })).toBeInViewport();
  await expect(brand.locator("img").first()).toHaveAttribute("alt", "Roof Pros South logo");
  const jobSwitch = page.locator("header.page-header").getByRole("radiogroup", { name: "Company", exact: true });
  await expect(jobSwitch.getByRole("radio", { name: "RCU", exact: true })).toBeChecked();
  await expect(page.locator(".invoice-doc")).toContainText("Concepts Unlimited");
  await jobSwitch.getByRole("radio", { name: "RDSF", exact: true }).click();
  await expect(jobSwitch.getByRole("radio", { name: "RDSF", exact: true })).toBeChecked();
  await expect(page.locator(".invoice-doc")).toContainText("Roof Pros South");
  await expect(page.locator(".invoice-doc")).toContainText("Sample RDSF bank transfer instructions");
  await expect(page.locator(".invoice-doc")).not.toContainText("Sample RCU bank transfer instructions");
  await expectHealthy(page);
  await shot(page, "companies-draft-job-switch");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".invoice-doc")).toContainText("Roof Pros South");
  await shot(page, "companies-draft-invoice-print");
  await page.emulateMedia({ media: "screen" });

  // Seeded sent invoices are shared with stream T-317; this test never changes them.
  for (const [id, company, other] of [["J-3161", "RCU", "Roof Pros South"], ["J-3162", "RDSF", "Concepts Unlimited"]]) {
    await page.goto(`/company/jobs/${id}?tab=invoice`);
    await expect(page.locator(".invoice-doc")).toBeVisible();
    await expect(page.getByText(`Sent as ${company}`, { exact: true })).toBeVisible();
    await expect(page.locator(".invoice-doc")).toContainText(company === "RCU" ? "Concepts Unlimited" : "Roof Pros South");
    await expect(page.locator(".invoice-doc")).not.toContainText(other);
    await expectHealthy(page);
    await shot(page, `companies-sent-${company.toLowerCase()}`);
  }
});

test("a single-company owner gets no company switch or extra companies request", async ({ as }) => {
  test.setTimeout(120_000);
  const owner = await api("owner");
  const { job } = must(await owner.post("/api/jobs", { businessId: "e2e-roofing", title: "Single company review", clientName: "Sample Customer" }), "single-company job");
  expect(job).not.toHaveProperty("companyId");
  const page = await as("owner");
  const companyRequests: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/company/companies") companyRequests.push(request.url()); });
  await page.goto(`/company/jobs/${job.jobId}`);
  await expect(page.getByRole("heading", { name: "Single company review" })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Company", exact: true })).toHaveCount(0);
  await expectHealthy(page);
  await shot(page, "companies-single-job");
  await page.goto("/company/library?section=branding");
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Companies", exact: true })).toHaveCount(0);
  await expect(page.getByText(/Failed to load this page|Could not load/i)).toHaveCount(0);
  expect(companyRequests).toEqual([]);
  await expectHealthy(page);
  await shot(page, "companies-single-branding");
});
