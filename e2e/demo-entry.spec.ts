import { expect, expectHealthy, settle, shot, test } from "./fixtures";
import { SANDBOX_ACCOUNTS } from "../scripts/e2e/config.cjs";

test("roofing has three simple steps and opens the read-only app without a call", async ({ as }) => {
  const page = await as("viewer");
  await page.goto("/try/roofing");
  await settle(page, 300);
  await expect(page.getByRole("heading", { name: "Try it for yourself" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Try the demo" }).getByRole("listitem")).toHaveCount(3);
  const call = page.getByRole("link", { name: /^Call the receptionist at/ });
  await expect(call).toHaveAttribute("href", "tel:+16892042643");
  await expect(call).toBeInViewport();
  const app = page.getByRole("button", { name: "See the App", exact: true });
  await expect(app).toBeInViewport();
  await expect(app).toBeEnabled();
  await expect(page.getByRole("heading", { name: "Call and book", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "See voice updates", exact: true })).toBeInViewport();
  await expect(page.getByText("Sample data · View only", { exact: true })).toBeVisible();
  await expect(page.getByText(/AI Receptionist ·|Every leak|See the Software|data loaded|Try Saying|How It Works/i)).toHaveCount(0);
  await expectHealthy(page);
  await shot(page, "roofing-demo-entry");

  await app.click();
  await expect(page).toHaveURL(/\/company\/dashboard/);
  await expect(page.getByTestId("demo-tour")).toContainText("read-only");
  await expect(page.getByRole("heading", { name: "Today's Work" })).toBeVisible();
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
  await page.getByRole("button", { name: "See voice updates", exact: true }).click();
  await expect(page).toHaveURL(/\/company\/field$/);
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
  const app = page.getByRole("button", { name: "See the App", exact: true });
  await app.click();
  await expect(page.getByText("Demo unavailable. Please try again.", { exact: true })).toBeVisible();
  await expect(app).toBeEnabled();
  await expect(page.getByRole("link", { name: /^Call the receptionist at/ })).toBeVisible();
  await shot(page, "roofing-demo-entry-retry");
  await page.goto("/try/dental");
  await expect(page.getByText("See the Software", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "See it in the real app →", exact: true })).toBeVisible();
  await expect(page.getByTestId("try-points")).toBeVisible();
});
