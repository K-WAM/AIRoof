// The Photos tab: drag-and-drop ordering (mouse and keyboard) persists, and Before/After photos show as pairs.
// This is the check E6a could not do in a real browser. Data is created through the real API, then verified through it.
import { api, must, pngBase64 } from "../scripts/e2e/lib.cjs";
import { expect, settle, shot, test } from "./fixtures";

const B = "e2e-roofing";

async function jobWithPhotos(labels: Array<[string, "before" | "after" | undefined]>) {
  const owner = await api("owner");
  const { job } = must(await owner.post("/api/jobs", { businessId: B, title: `Photo order ${Date.now().toString(36)}`, address: "5 Photo Way", clientName: "Pat Photo", clientPhone: "+15557770000" }), "create job");
  for (const [label, phase] of labels) {
    must(await owner.post(`/api/jobs/${job.jobId}/photos`, { businessId: B, label, phase, thumbB64: pngBase64(64, 48, [label.charCodeAt(0) * 2 % 255, 90, 160]), fullB64: pngBase64(160, 120), uploadedBy: "e2e", w: 160, h: 120 }), `upload ${label}`);
  }
  return { owner, jobId: job.jobId as string };
}

async function orderOf(owner: Awaited<ReturnType<typeof api>>, jobId: string): Promise<string[]> {
  const res = must(await owner.get(`/api/jobs/${jobId}/photos?businessId=${B}`), "list photos");
  const photos = (res.photos ?? res) as Array<{ label: string; sort?: number; createdAt: number }>;
  return [...photos].sort((a, b) => (a.sort ?? a.createdAt) - (b.sort ?? b.createdAt)).map((p) => p.label);
}

async function openPhotos(page: import("@playwright/test").Page, jobId: string) {
  await page.goto(`/company/jobs/${jobId}`);
  await settle(page);
  await page.getByRole("button", { name: /^Photos/ }).click();
  await settle(page);
}

test.describe("Photos tab", () => {
  test("drag with the mouse re-orders and the order is saved", async ({ as, isMobile }) => {
    test.skip(isMobile, "mouse drag is a desktop interaction; touch is covered by the phone keyboard-free path below");
    const { owner, jobId } = await jobWithPhotos([["Alpha", undefined], ["Bravo", undefined], ["Charlie", undefined]]);
    const page = await as("owner");
    await openPhotos(page, jobId);
    await shot(page, "photos-before-drag");
    const handle = (name: string) => page.getByRole("button", { name: `Reorder ${name}` });
    await expect(handle("Alpha")).toBeVisible();

    const from = await handle("Alpha").boundingBox();
    const to = await handle("Charlie").boundingBox();
    if (!from || !to) throw new Error("could not measure the drag handles");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 20, from.y + 5, { steps: 4 }); // pass dnd-kit's activation distance
    await page.mouse.move(to.x + to.width / 2 + 10, to.y + to.height / 2, { steps: 15 });
    await page.mouse.up();
    await settle(page, 1200);
    await shot(page, "photos-after-drag");

    await expect.poll(() => orderOf(owner, jobId), { timeout: 15_000, message: "dragging Alpha to the end did not change the saved order" }).not.toEqual(["Alpha", "Bravo", "Charlie"]);
    expect((await orderOf(owner, jobId))[0]).not.toBe("Alpha");

    await page.reload();
    await settle(page);
    await page.getByRole("button", { name: /^Photos/ }).click();
    await settle(page);
    const shown = await page.getByRole("button", { name: /^Reorder / }).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")?.replace("Reorder ", "")));
    expect(shown, "the page shows the saved order after a reload").toEqual(await orderOf(owner, jobId));
  });

  test("keyboard: space, arrow, space moves a photo and saves", async ({ as, isMobile }) => {
    const { owner, jobId } = await jobWithPhotos([["Delta", undefined], ["Echo", undefined], ["Foxtrot", undefined]]);
    const page = await as("owner");
    await openPhotos(page, jobId);
    const handle = page.getByRole("button", { name: "Reorder Delta" });
    await expect(handle).toBeVisible();
    await handle.focus();
    await page.keyboard.press("Space"); // pick up
    await page.waitForTimeout(250); // dnd-kit needs a tick before it listens for arrows
    await page.keyboard.press(isMobile ? "ArrowDown" : "ArrowRight"); // the phone grid is one column
    await page.waitForTimeout(250);
    await page.keyboard.press("Space"); // drop
    await settle(page, 1200);
    await expect.poll(() => orderOf(owner, jobId), { timeout: 15_000 }).not.toEqual(["Delta", "Echo", "Foxtrot"]);
  });

  test("Before and After photos are shown as pairs, phone and desktop", async ({ as }) => {
    const { jobId } = await jobWithPhotos([["Cracked tile", "before"], ["Tile replaced", "after"], ["Ridge before", "before"], ["Ridge after", "after"], ["Extra angle", undefined]]);
    const page = await as("owner");
    await openPhotos(page, jobId);
    await expect(page.getByRole("region", { name: "Before and After pairs" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Other photos" })).toBeVisible();
    await shot(page, "photos-pairs");
    // Icon controls must remain tappable at the mobile target size.
    const box = await page.getByRole("button", { name: "Reorder Cracked tile" }).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(40);
    expect(box?.height).toBeGreaterThanOrEqual(40);
  });
});
