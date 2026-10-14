import { expect, expectHealthy, settle, shot, test } from "./fixtures";
import { SANDBOX_ACCOUNTS } from "../scripts/e2e/config.cjs";

test("roofing has three simple steps and opens the read-only app without a call", async ({ as }) => {
  const page = await as("viewer");
  await page.goto("/try/roofing");
  await settle(page, 300);
  await expect(page.getByRole("heading", { name: "24-Hour English & Spanish Support for Your Customers" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Try the demo" }).getByRole("listitem")).toHaveCount(3);
  await page.getByText("Guided Phone Demo", { exact: true }).click();
  const call = page.getByRole("link", { name: "+1 (689) 204-2643", exact: true });
  await expect(call).toHaveAttribute("href", "tel:+16892042643");
  const app = page.getByRole("button", { name: "Open Sample App", exact: true });
  await expect(app).toBeEnabled();
  await expect(page.getByRole("button", { name: "Call and Book", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add a Voice Update", exact: true })).toBeVisible();
  await expect(page.getByText("View only", { exact: false })).toHaveCount(0);
  await expect(page.getByText(/AI Receptionist ·|Every leak|See the Software|data loaded|Try Saying|How It Works/i)).toHaveCount(0);
  await expectHealthy(page);
  await shot(page, "roofing-demo-entry");

  await app.click();
  await expect(page).toHaveURL(/\/company\/pipeline/);
  await expect(page.getByTestId("demo-tour")).toContainText("read-only");
  await expect(page.getByRole("heading", { name: "Pipeline", exact: true })).toBeVisible();
  const profile = await page.request.get("/api/auth/profile");
  expect(profile.ok()).toBe(true);
  const user = (await profile.json()).profile;
  expect(user).toMatchObject({ email: SANDBOX_ACCOUNTS.roofing, businessId: "demo-try-roofing", role: "viewer", isSandboxVisitor: true });
  const write = await page.request.post("/api/jobs", { data: { businessId: "demo-try-roofing", title: "Denied demo write" } });
  expect(write.status()).toBe(403);
  await expectHealthy(page);
  await shot(page, "roofing-demo-entry-app");
  await page.getByRole("link", { name: "3. See voice updates", exact: true }).click();
  await expect(page.getByTestId("voice-update-example")).toBeVisible();
  await expectHealthy(page);
});

test("voice updates opens the read-only Field example directly and never records or saves", async ({ as }) => {
  const page = await as("viewer");
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && /\/api\/.*(?:updates|field-audio)/.test(request.url())) mutations.push(request.url());
  });
  await page.goto("/try/roofing");
  await page.getByText("Guided Phone Demo", { exact: true }).click();
  await page.getByRole("button", { name: "Open Sample App", exact: true }).click();
  await page.getByRole("link", { name: "3. See voice updates", exact: true }).click();
  await expect(page).toHaveURL(/\/company\/field\?jobId=J-1001$/);
  await expect(page.getByRole("heading", { name: "Field Log", exact: true })).toBeVisible();
  const example = page.getByTestId("voice-update-example");
  await expect(example.getByRole("heading", { name: "Speak once. Update the job." })).toBeInViewport();
  await expect(example).toContainText("Example · No recording");
  await expect(example).toContainText("12 bundles of shingles");
  await expect(example).toContainText("Carlos · 8 hours");
  await expect(example).toContainText("Cracked vent boot");
  await expect(page.getByRole("region", { name: "Send a field note" })).toHaveCount(0);
  await expect(page.getByTestId("demo-tour").getByRole("listitem")).toHaveCount(3);
  const tourBox = await page.getByTestId("demo-tour").boundingBox();
  const fieldBox = await page.locator(".company-field-page").boundingBox();
  expect(tourBox && fieldBox && tourBox.y + tourBox.height <= fieldBox.y, "the dark Field page must not cover the tour").toBe(true);
  const profile = await page.request.get("/api/auth/profile");
  expect((await profile.json()).profile).toMatchObject({ businessId: "demo-try-roofing", role: "viewer" });
  expect(mutations).toEqual([]);
  expect((await page.request.get("/api/businesses/demo-roofing/calls")).status()).toBe(403);
  const write = await page.request.post("/api/jobs/J-1001/updates", { data: { businessId: "demo-try-roofing", rawText: "Denied visitor field update" } });
  expect(write.status()).toBe(403);
  await expectHealthy(page);
  await shot(page, "roofing-demo-voice-example");
  await example.getByText("Spanish → English example", { exact: true }).click();
  await expect(example).toContainText("Encontré seis tejas");
  await expect(example.getByText("Six cracked tiles on the south slope.", { exact: true })).toBeVisible();
  await expect(example.getByText("Split pipe boot at the vent penetration.", { exact: true })).toBeVisible();
  await expectHealthy(page);
  await shot(page, "roofing-demo-spanish-example");

  const office = await as("owner");
  await office.goto("/company/field?jobId=J-1000");
  await expect(office.getByRole("region", { name: "Send a field note" })).toBeVisible();
  await expect(office.getByTestId("voice-update-example")).toHaveCount(0);
  await expectHealthy(office);
});

test("a failed app entry leaves an immediate retry and other industries keep their entry", async ({ as }) => {
  const page = await as("viewer");
  await page.route("**/api/demo/sandbox-token", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Demo unavailable. Please try again." }) }));
  await page.goto("/try/roofing");
  await page.getByText("Guided Phone Demo", { exact: true }).click();
  const app = page.getByRole("button", { name: "Open Sample App", exact: true });
  await app.click();
  await expect(page.getByText("Demo unavailable. Please try again.", { exact: true })).toBeVisible();
  await expect(app).toBeEnabled();
  await expect(page.getByRole("button", { name: "Call and Book", exact: true })).toBeVisible();
  await shot(page, "roofing-demo-entry-retry");
  await page.goto("/try/dental");
  await expect(page.getByRole("heading", { name: "Try the demo", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "See the app →", exact: true })).toBeVisible();
  await expect(page.getByTestId("demo-step-field")).toHaveCount(0);
});
