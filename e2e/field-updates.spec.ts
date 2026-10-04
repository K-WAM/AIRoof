// Field updates (2026-10-04 pass): a note always says which job it goes to and who sends it, the receipt names both,
// the time clock reads in plain words and asks before ending the day, a crew member clocked in at one job is warned
// before noting on another, and the office sees who sent each note — from a login or a no-login field-QR link.
import { api, must, outbox } from "../scripts/e2e/lib.cjs";
import { expect, expectHealthy, settle, shot, test } from "./fixtures";

const B = "e2e-roofing";

async function twoJobs() {
  const owner = await api("owner");
  const tag = Date.now().toString(36);
  const a = must(await owner.post("/api/jobs", { businessId: B, title: `Reroof ${tag}`, address: "44 Ocean Dr, Miami, FL", clientName: "Lena Park" }), "job a").job.jobId as string;
  const b = must(await owner.post("/api/jobs", { businessId: B, title: `Leak repair ${tag}`, address: "9 Bay St, Miami, FL", clientName: "Omar Ruiz" }), "job b").job.jobId as string;
  return { owner, a, b };
}

test("signed-in crew: clock in, note, receipt, wrong-job warning, clock out asks first", async ({ as }) => {
  test.setTimeout(150_000);
  const { a, b } = await twoJobs();
  // Start off the clock: a run that died mid-way leaves this account clocked in, and the screen then (correctly)
  // opens on that job and offers "Switch" instead of "Clock in". 409 = already off, ignored.
  await (await api("crew")).post("/api/timeclock/punch", { businessId: B, type: "office_out" });
  const page = await as("crew");
  await page.goto(`/company/field?jobId=${a}`);
  await settle(page);

  // Where + who, before anything is said.
  const target = page.getByTestId("note-target");
  await expect(target).toContainText(a);
  await expect(target).toContainText("as ");

  // Clock in at this job: the status reads in words.
  const clock = page.getByTestId("time-clock");
  await clock.getByRole("button", { name: `Clock in at ${a}` }).click();
  await expect(clock.getByText(`At ${a}`, { exact: true })).toBeVisible();

  // Type a note: the receipt names the job and the author and says what was added.
  await page.getByTestId("note-type-toggle").click();
  await page.getByLabel(`Note for ${a}`).fill("Used 12 bundles of shingles. Carlos worked 8 hours. Found a cracked vent boot.");
  await page.getByTestId("note-save").click();
  const receipt = page.getByTestId("note-receipt");
  await expect(receipt).toContainText(`Saved to ${a} by`, { timeout: 30_000 });
  await expect(receipt).toContainText(/Added .*material/);
  await expect(page.getByTestId("recent-notes")).toContainText("Used 12 bundles");
  await shot(page, "field-note-saved");

  // Pick the other job while clocked in here: warned before a note lands on the wrong job.
  await page.getByTestId("job-selected").click();
  const search = page.getByLabel("Search jobs"); // only there once the shop has more than a handful of jobs
  if (await search.isVisible()) await search.fill(b);
  await page.getByTestId("job-option").filter({ hasText: b }).first().click();
  await expect(page.getByTestId("note-job-mismatch")).toContainText(`clocked in at ${a}`);
  // The list under the composer belongs to the job on screen: the note saved to the other job must not show here.
  await settle(page, 800);
  await expect(page.getByTestId("recent-notes")).toHaveCount(0);
  await expect(clock.getByRole("button", { name: `Switch to ${b} (leaves ${a})` })).toBeVisible();
  await shot(page, "field-wrong-job-warning");

  // Clock out asks once.
  await clock.getByRole("button", { name: "Clock out for the day" }).click();
  await expect(clock.getByText(/this also leaves/)).toBeVisible();
  await clock.getByTestId("clock-out-confirm").click();
  await expect(clock.getByText("Off the clock", { exact: true })).toBeVisible();
  await expectHealthy(page);
});

test("no-login field QR: the name comes first and goes on the note the office sees", async ({ as, browser }) => {
  test.setTimeout(150_000);
  const { owner, a } = await twoJobs();
  const { fieldUrl } = must(await owner.post(`/api/jobs/${a}/field-qr`, { businessId: B }), "mint field QR");

  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(String(fieldUrl));
  await settle(page);
  const name = `Ana ${Date.now().toString(36)}`;

  // Without a name nothing can be sent, and the screen says why.
  await expect(page.getByText(/Type your name so the office knows who sent each note/)).toBeVisible();
  await expect(page.getByTestId("note-mic")).toBeDisabled();
  await page.getByLabel("Your name").fill(name);
  await expect(page.getByTestId("note-target")).toContainText(`as ${name}`);

  await page.getByTestId("note-type-toggle").click();
  await page.getByLabel(`Note for ${a}`).fill("Tarped the back slope. Two hours.");
  await page.getByTestId("note-save").click();
  await expect(page.getByTestId("note-receipt")).toContainText(`Saved to ${a} by ${name}`, { timeout: 30_000 });
  await shot(page, "field-qr-note-saved");
  await context.close();

  // The office sees who sent it, and that it came from a field link.
  const office = await as("owner");
  await office.goto(`/company/jobs/${a}`);
  await settle(office);
  await expect(office.getByText(name).first()).toBeVisible();
  await expect(office.getByText("field link", { exact: true }).first()).toBeVisible();
  await expect(office.getByText(/Tarped the back slope/).first()).toBeVisible();
  await shot(office, "job-note-from-qr");
});

test("send to a worker: the office emails the job's link; it works on two phones, again, and stops on Stop link", async ({ as, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough: the phones are opened below");
  test.setTimeout(150_000);
  const { a } = await twoJobs();
  const office = await as("owner");
  await office.goto(`/company/jobs/${a}`);
  await settle(office);
  await office.getByTestId("send-field-link").filter({ visible: true }).first().click();
  const sheet = office.getByTestId("field-link-sheet");
  const to = `sub-${Date.now().toString(36)}@contractor.e2e.test`;
  await sheet.getByTestId("field-link-to").fill(to);
  await sheet.getByTestId("field-link-send").click();
  await expect(sheet.getByTestId("field-link-status")).toContainText(`Emailed to ${to}`);
  await shot(office, "field-link-sent");

  // The email carries the job's name and the link.
  let mail: { html?: string; subject?: string } | undefined;
  await expect.poll(async () => { [mail] = await outbox({ to }); return !!mail; }, { timeout: 15_000 }).toBe(true);
  expect(mail!.subject).toContain("Log your work");
  const url = String(mail!.html).match(/href="([^"]+\/f\/[^"]+)"/)?.[1];
  expect(url, "a /f/ link in the email").toBeTruthy();

  // Two phones, and the same phone again: all land on that job.
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.goto(url!);
    await settle(page);
    await expect(page).toHaveURL(/\/field(\?|$)/);
    await expect(page.getByText(/access=denied|link (was )?stopped/i)).toHaveCount(0);
    await expect(page.getByLabel("Your name")).toBeVisible();
    await context.close();
  }

  // Stop link: the old link is refused.
  office.once("dialog", (d) => void d.accept());
  await sheet.getByRole("button", { name: "Stop link" }).click();
  await expect(sheet.getByTestId("field-link-status")).toContainText("Link stopped");
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url!);
  await expect(page).toHaveURL(/access=denied/);
  await context.close();
});
