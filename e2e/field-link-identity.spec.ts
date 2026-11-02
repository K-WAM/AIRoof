import { api, must, pngBase64 } from "../scripts/e2e/lib.cjs";
import { expect, settle, shot, test } from "./fixtures";

const B = "e2e-roofing";
for (const signedIn of [false, true]) {
  test(`field link submits with ${signedIn ? "superadmin" : "no login"}`, async ({ as, browser }) => {
    test.setTimeout(150_000);
    const owner = await api("owner");
    const { job } = must(await owner.post("/api/jobs", { businessId: B, title: `Field link ${Date.now()}`, address: "44 Ocean Dr", clientName: "Field Test" }), "create job");
    const { fieldUrl } = must(await owner.post(`/api/jobs/${job.jobId}/field-qr`, { businessId: B }), "field link");
    const context = signedIn ? null : await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const page = signedIn ? await as("superadmin") : await context!.newPage();
    await page.goto(String(fieldUrl));
    await settle(page);
    await page.getByLabel("Your name").fill(`Worker ${Date.now()}`);
    const clock = page.getByTestId("time-clock");
    await clock.getByRole("button", { name: `Clock in at ${job.jobId}` }).click();
    await expect(clock.getByTestId("clock-done")).toContainText(`Clocked in at ${job.jobId}`);
    await page.getByTestId("note-type-toggle").click();
    await page.getByLabel(`Note for ${job.jobId}`).fill("Used 12 bundles of shingles. Carlos worked 8 hours. Found a cracked vent boot.");
    await page.getByTestId("note-save").click();
    await expect(page.getByTestId("note-receipt")).toContainText(`Saved to ${job.jobId}`, { timeout: 30_000 });
    await page.locator('input[type="file"]').setInputFiles({ name: "roof.png", mimeType: "image/png", buffer: Buffer.from(pngBase64(160, 120), "base64") });
    await page.getByPlaceholder("Describe this photo (required)…").fill("Roof field photo");
    await page.getByRole("button", { name: "Save photo" }).click();
    await expect(page.getByText(`Photo saved to ${job.jobId}`)).toBeVisible();
    const photos = must(await owner.get(`/api/jobs/${job.jobId}/photos?businessId=${B}`), "photos");
    expect(JSON.stringify(photos)).toContain("Roof field photo");
    await shot(page, `field-link-${signedIn ? "superadmin" : "anonymous"}`);
    await context?.close();
  });
}
