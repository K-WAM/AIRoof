import { openJobPanel } from "./fixtures";
import { api, must } from "../scripts/e2e/lib.cjs";
import { test, expect, settle, shot, expectHealthy } from "./fixtures";

test("job activity defers inactive panels and shows a panel skeleton while Findings loads", async ({ as }) => {
  test.setTimeout(180_000);
  const owner = await api("owner");
  const { job } = must(await owner.post("/api/jobs", { businessId: "e2e-roofing", title: "Deferred panels review" }), "job");
  const page = await as("owner"), scripts: string[] = [];
  page.on("request", r => { if (r.resourceType() === "script") scripts.push(r.url()); });
  await page.goto(`/company/jobs/${job.jobId}`); await settle(page);
  await expect(page.getByRole("heading", { name: /^Deferred panels review/, level: 1 })).toBeVisible();
  expect(scripts.filter(url => /QuotePanel|FindingsPanel|DepositInvoices|ReportDocument|ClassicDocument|QuoteLetterPreview|PhotoEditSheet/.test(url))).toEqual([]);
  const scriptsBeforeFindings = scripts.length;
  await page.route("**/_next/static/chunks/**", async route => {
    if (route.request().resourceType() === "script") await new Promise(resolve => setTimeout(resolve, 1200));
    await route.continue();
  });
  await openJobPanel(page, "findings");
  await expect(page.getByRole("status", { name: "Loading findings", exact: true })).toBeVisible();
  await shot(page, "job-lazy-findings-loading");
  await expect(page.getByRole("heading", { name: "Findings", exact: true })).toBeVisible();
  expect(scripts.length).toBeGreaterThan(scriptsBeforeFindings);
  expect(scripts.filter(url => /QuotePanel|DepositInvoices|PhotoEditSheet/.test(url))).toEqual([]);
  await page.unroute("**/_next/static/chunks/**");
  await shot(page, "job-lazy-findings-ready"); await expectHealthy(page);
  scripts.length = 0;
  await page.goto("/company/library?section=crews"); await settle(page);
  await expect(page.getByRole("heading", { name: /Crews/ }).first()).toBeVisible();
  expect(scripts.filter(url => /LogosSection|LettersSection|DocumentStyleSection|WorkCatalogSection/.test(url))).toEqual([]);
  await expectHealthy(page);
});
