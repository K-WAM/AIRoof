// The customer story as a person clicks through it: a phone call books an inspection -> the office sees the call and the
// request -> confirms it (customer email captured) -> creates the job -> walks the job tabs -> documents.
// The call itself is simulated through the real ElevenLabs webhooks (scripts/e2e/lib.cjs simulateCall).
// For the same story with no browser (fast, API only) run: npm run e2e:call
import { runCallToCash } from "../scripts/e2e/scenarios/call-to-cash.cjs";
import { outbox, simulateCall } from "../scripts/e2e/lib.cjs";
import { expect, expectHealthy, overflowingElements, settle, shot, test } from "./fixtures";

test.describe.configure({ mode: "serial" });

const tag = Date.now().toString(36).slice(-5);
const caller = { name: `Rita Roof ${tag}`, phone: `+1555${String(Math.floor(2000000 + Math.random() * 7000000))}`, email: `rita.${tag}@customer.e2e.test`, address: "77 Shingle Ln, Miami, FL" };
let createdJobId = "";

test("a phone call books an inspection and appears in Calls with its transcript", async ({ as }) => {
  await simulateCall({
    from: caller.phone,
    summary: `${caller.name} reports a leak by the chimney.`,
    transcript: [["agent", "Thanks for calling E2E Roofing Co, how can I help?"], ["user", "There is a leak by my chimney."], ["agent", "I can get an inspection booked."]],
    tools: [["bookAppointment", { name: caller.name, email: caller.email, service: "Roof inspection", address: caller.address, preferredTime: Date.now() + (3 + Math.floor(Math.random() * 400)) * 86_400_000 }]],
  });
  const page = await as("owner");
  await page.goto("/company/calls");
  await settle(page);
  await page.getByText(/There is a leak by my chimney|leak by the chimney/i).first().click({ timeout: 10_000 }).catch(async () => {
    await page.locator(".feed-row, [class*=call]").first().click();
  });
  await expect(page.getByText(/leak by my chimney/i).first()).toBeVisible();
  await shot(page, "calls-transcript");
  await expectHealthy(page, { allowOverflow: true });
});

test("the request is in the Pipeline; Review request opens the card; Confirm emails the customer", async ({ as }) => {
  const page = await as("owner");
  await page.goto("/company/pipeline");
  await settle(page);
  await page.getByRole("button", { name: /^Appointments/ }).click();
  const card = page.getByText(caller.name).first().locator("xpath=ancestor::*[.//button[normalize-space()='Create Job']][1]");
  await expect(card).toBeVisible();
  await expect(card.getByText("New request")).toBeVisible();
  await shot(page, "pipeline-new-request");

  await card.getByRole("button", { name: "Review request" }).click();
  await settle(page);
  await shot(page, "pipeline-review-card");
  await expect(page.getByText(caller.email).first()).toBeVisible();

  await page.keyboard.press("Escape");
  await card.getByRole("button", { name: "Confirm & notify customer" }).click();
  await expect(card.getByText("Confirmed")).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await outbox({ to: caller.email })).length, { timeout: 15_000, message: "no confirmation email was captured" }).toBeGreaterThan(0);
  await shot(page, "pipeline-confirmed");
});

test("Create Job turns the request into a job that remembers the call", async ({ as }) => {
  const page = await as("owner");
  await page.goto("/company/pipeline");
  await settle(page);
  await page.getByRole("button", { name: /^Appointments/ }).click();
  const card = page.getByText(caller.name).first().locator("xpath=ancestor::*[.//button[normalize-space()='Create Job']][1]");
  await card.getByRole("button", { name: "Create Job" }).click();
  await page.waitForURL(/\/company\/jobs\/J-\d+/, { timeout: 30_000 });
  await settle(page);
  createdJobId = page.url().match(/J-\d+/)?.[0] ?? "";
  expect(createdJobId).toMatch(/^J-\d+$/);
  await expect(page.getByText(caller.address.split(",")[0]).first()).toBeVisible();
  await expect(page.getByText(/From call/)).toBeVisible();
  await shot(page, "job-from-request");
  await page.getByRole("link", { name: "View transcript" }).click();
  await settle(page);
  await expect(page.getByText(/leak by my chimney/i).first()).toBeVisible();
});

test("the API scenario finishes the job: field note, photos, quote, report, invoice, paid", async ({ as }) => {
  test.setTimeout(240_000);
  const result = await runCallToCash({ log: () => {} });
  expect(result.steps.filter((s: { ok: boolean }) => !s.ok), "steps that failed").toEqual([]);
  const page = await as("owner");
  await page.goto(`/company/jobs/${result.ctx.jobId}`);
  await settle(page);
  await expect(page.getByText(/Invoiced|Paid/i).first()).toBeVisible();
  for (const tab of [/^Activity/, /^Photos/, /^Materials/, /^Labor/, /Findings/, /Quote/, /Report/, /Invoice/]) {
    await page.getByRole("button", { name: tab }).first().click();
    await settle(page, 500);
    await shot(page, `job-tab-${String(tab).replace(/[^a-z]/gi, "")}`);
    const wide = await overflowingElements(page);
    if (wide.length) test.info().annotations.push({ type: "known-issue", description: `${tab} tab overflows the screen: ${wide[0]}` });
  }
});
