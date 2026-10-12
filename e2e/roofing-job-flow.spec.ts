import { api, must, outbox } from "../scripts/e2e/lib.cjs";
import { expect, expectHealthy, settle, shot, test } from "./fixtures";

const BUSINESS = "e2e-roofing";

test("desktop can add three findings together and a customer can accept the emailed quote", async ({ as }) => {
  test.skip(test.info().project.name !== "desktop", "The reported selection bug is on desktop.");
  test.setTimeout(150_000);
  const owner = await api("owner");
  const tag = Date.now().toString(36);
  const email = `quote-${tag}@customer.e2e.test`;
  const oldCatalog = must(await owner.get(`/api/company/work-catalog?businessId=${BUSINESS}`), "read catalog").catalog;
  const items = ["Cracked roof tile", "Loose flashing", "Split pipe boot"].map((problem, index) => ({
    itemId: `flow-${tag}-${index}`, category: "Roof", problem, solution: `Repair ${problem.toLowerCase()}`,
  }));
  must(await owner.put("/api/company/work-catalog", { businessId: BUSINESS, items }), "seed findings");
  try {
    const { job } = must(await owner.post("/api/jobs", { businessId: BUSINESS, title: `Quote flow ${tag}`,
      address: "12 Test Lane, Miami, FL", clientName: "Quote Customer", clientEmail: email }), "create job");
    const jobId = job.jobId as string;

    const office = await as("owner");
    await office.goto(`/company/jobs/${jobId}?tab=findings`);
    await settle(office, 500);
    await expectHealthy(office);
    await office.getByRole("button", { name: /Add from Library/ }).first().click();
    const picker = office.getByRole("dialog", { name: "Add a finding from the Library" });
    const options = picker.locator("button[aria-pressed='false']");
    await expect.poll(() => options.count()).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < 3; i++) await options.nth(0).click();
    await expect(picker.getByRole("button", { name: "Add 3 findings" })).toBeVisible();
    await shot(office, "job-three-findings-selected");
    await picker.getByRole("button", { name: "Add 3 findings" }).click();
    await expect(office.getByText("On this job (3)")).toBeVisible();
    await expect.poll(async () => (must(await owner.get(`/api/jobs/${jobId}?businessId=${BUSINESS}`), "saved job").job.findings ?? []).length).toBe(3);

    must(await owner.post(`/api/jobs/${jobId}/quote`, { businessId: BUSINESS }), "create quote");
    must(await owner.patch(`/api/jobs/${jobId}/quote`, { businessId: BUSINESS,
      lines: [{ lineId: "repair", kind: "other", description: "Roof repair", quantity: 1, unitPrice: 100 }] }), "price quote");
    must(await owner.post(`/api/jobs/${jobId}/quote/send`, { businessId: BUSINESS, to: email }), "send quote");
    await expect.poll(async () => (await outbox({ to: email, subject: "[Quote]" })).length).toBeGreaterThan(0);
    const message = (await outbox({ to: email, subject: "[Quote]" }))[0];
    const acceptUrl = String(message.html).match(/href="([^"]+)"[^>]*>Accept quote</)?.[1]?.replaceAll("&amp;", "&");
    expect(acceptUrl).toBeTruthy();
    const customer = await office.context().newPage();
    await customer.goto(acceptUrl!);
    await expect(customer.getByRole("heading", { name: "Accept quote" })).toBeVisible();
    await customer.getByRole("button", { name: "Confirm accept" }).click();
    await expect(customer.getByRole("heading", { name: "Quote accepted" })).toBeVisible();
    expect(must(await owner.get(`/api/jobs/${jobId}/quote?businessId=${BUSINESS}`), "quote after acceptance").quote.status).toBe("accepted");
    await customer.close();
  } finally {
    must(await owner.put("/api/company/work-catalog", { businessId: BUSINESS, items: oldCatalog.items ?? [] }), "restore catalog");
  }
});
