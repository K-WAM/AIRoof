import { test, expect, settle, shot, expectHealthy, openHelp } from "./fixtures";
import sharp from "sharp";
import { api, must } from "../scripts/e2e/lib.cjs";

test.beforeAll(async () => {
  const owner = await api("proOwner");
  const businessId = "e2e-roofpros";
  const existing = must(await owner.get(`/api/company/library/logos?businessId=${businessId}`), "logos").logos as Array<{ name: string; logoId: string }>;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="180" viewBox="0 0 600 180"><path fill="#0f766e" d="M10 95 100 10 190 95H150V165H50V95Z"/><text x="210" y="110" fill="#17304b" font-family="Arial" font-size="52">Example Roof</text></svg>';
  const artwork = [{ name: "E2E vector artwork", mimeType: "image/svg+xml", b64: Buffer.from(svg).toString("base64"), w: 600, h: 180 }, { name: "E2E raster detail artwork", mimeType: "image/png", b64: (await sharp(Buffer.from(svg.replace("Example Roof", "Example West"))).resize(1000, 300).png().toBuffer()).toString("base64"), w: 1000, h: 300 }];
  const ids: string[] = [];
  for (const art of artwork) {
    const old = existing.find(l => l.name === art.name);
    ids.push(old?.logoId ?? must(await owner.post("/api/company/library/logos", { businessId, ...art, variant: "color" }), "upload artwork").logo.logoId);
  }
  must(await owner.patch("/api/company/companies", { companies: [{ id: "rdsf", logoId: ids[0] }, { id: "rcu", logoId: ids[1] }] }), "assign artwork");
});

test("SVG and large PNG fit the two-company header", async ({ as }, testInfo) => {
  const page = await as("proOwner");
  const widths = testInfo.project.name === "phone" ? [375] : [1280, 1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await page.goto("/company/dashboard"); await settle(page);
    const primary = page.locator(width === 375 ? ".company-topbar .company-brand-logo--business" : ".company-sidebar .company-brand-logo--business");
    const other = page.locator(".company-brand-other img");
    await expect(primary).toBeInViewport(); await expect(other).toBeInViewport();
    expect(await primary.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    expect(await other.getAttribute("src")).toMatch(/^data:image\/png/);
    expect(await other.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1000);
    if (width === 375) {
      expect((await primary.boundingBox())!.width).toBeGreaterThanOrEqual(120);
      expect((await other.boundingBox())!.width).toBeGreaterThanOrEqual(120);
    }
    for (const logo of [primary, other]) {
      const dimensions = await logo.evaluate((img: HTMLImageElement) => ({ width: img.getBoundingClientRect().width, natural: img.naturalWidth, fit: getComputedStyle(img).objectFit }));
      expect(dimensions.width).toBeLessThanOrEqual(dimensions.natural);
      expect(dimensions.fit).toBe("contain");
    }
    await expectHealthy(page);
    await shot(page, `rd-header-artwork-${width}`);
  }
});

test("View as keeps Feedback visible, disabled and explained", async ({ as }) => {
  const page = await as("superadmin");
  const response = await page.request.post("/api/admin/view-as", { data: { businessId: "e2e-roofpros", userType: "office" } });
  expect(response.ok()).toBe(true);
  await page.goto("/company/dashboard"); await settle(page);
  await expect(page.getByTestId("view-as-banner")).toBeVisible();
  await openHelp(page);
  const feedback = page.getByRole("button", { name: /Send feedback.*Not available/ }).filter({ visible: true });
  await feedback.scrollIntoViewIfNeeded();
  await expect(feedback).toBeDisabled();
  await expect(feedback).toBeInViewport();
  await expect(feedback.getByText("Not available while viewing as someone else")).toBeVisible();
  expect(await feedback.getByText("Not available while viewing as someone else").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await shot(page, "rd-feedback-view-as");
  await page.request.delete("/api/admin/view-as");
});
