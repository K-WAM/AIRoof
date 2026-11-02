// Two contexts: superadmin preview stays open while a 375px anonymous phone logs work.
// Voice transcription is a TEST-ONLY browser adapter to the real updates API (the keyless harness has no Whisper).
// Auth, polling and persistence use the real app. Real microphone/Whisper still needs an owner check.
import { api, must, outbox, pngBase64, simulateCall } from "../scripts/e2e/lib.cjs";
import { expect, expectHealthy, shot, test } from "./fixtures";
import type { Page } from "@playwright/test";

const B = "demo-roofing";
const preview = `?preview=${B}`;

test("live prospect: call → job → phone work → documents → reset ends phone access", async ({ as, browser }, info) => {
  test.skip(info.project.name !== "desktop", "office desktop and phone context are both exercised here");
  test.setTimeout(240_000);
  const admin = await api("superadmin");
  const launch = must(await admin.post("/api/admin/demo-customize", { companyName: "Live Demo Roofing", verticalId: "roofing" }), "launch demo");
  expect(launch.ok).toBe(true);
  const tag = Date.now().toString(36);
  const name = `Live Caller ${tag}`;
  const email = `live-${tag}@customer.e2e.test`;
  const worker = `Prospect ${tag}`;
  const office = await as("superadmin");
  const dashboard = await office.context().newPage();
  const calendar = await office.context().newPage();
  await dashboard.goto(`/company/dashboard${preview}`);
  await expect(dashboard.getByRole("heading", { level: 1 })).toBeVisible();
  await office.goto(`/company/pipeline${preview}`);
  await office.getByRole("button", { name: /^Booked/ }).click();
  await calendar.goto(`/company/calendar${preview}`);
  await expect(calendar.getByRole("heading", { level: 1 })).toBeVisible();

  // Choose tomorrow's weekday; a random daytime slot avoids seeded bookings. The webhook uses the demo line.
  const when = new Date(Date.now() + 86_400_000);
  when.setUTCHours(16, 0, 0, 0);
  while ([0, 6].includes(when.getUTCDay())) when.setUTCDate(when.getUTCDate() + 1);
  const call = await simulateCall({ tenant: "demo", from: "+15559871234", summary: `${name} needs a roof inspection.`,
    transcript: [["user", `I am ${name}. Please book a roof inspection at 77 Shingle Ln, Miami, FL 33130.`]],
    tools: [["bookAppointment", { name, email, service: "Roof inspection", address: "77 Shingle Ln, Miami, FL 33130", preferredTime: when.getTime() }]],
  });
  expect(JSON.stringify(call.toolResults)).not.toMatch(/NOT BOOKED/);
  const card = office.locator(".appt-card").filter({ hasText: name });
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(dashboard.getByText(name).first()).toBeVisible({ timeout: 10_000 });
  // Calendar is already open. Navigate its week only if tomorrow is in next week.
  if (when.getDay() < new Date().getDay()) await calendar.getByRole("button", { name: /Next week/i }).click();
  await expect(calendar.getByText(name).first()).toBeVisible({ timeout: 10_000 });
  await shot(dashboard, "demo-live-dashboard-booking");
  await shot(calendar, "demo-live-calendar-booking");
  await card.getByRole("button", { name: /^Confirm( & (email \+ text|text|email))?$/ }).click();
  await expect(card.getByText("Confirmed")).toBeVisible();
  await card.getByRole("button", { name: "Create Job" }).click();
  await office.waitForURL(/\/company\/jobs\/J-\d+/);
  const jobId = office.url().match(/J-\d+/)![0];
  expect(new URL(office.url()).searchParams.get("preview")).toBe(B);
  await expect(calendar.getByText(jobId).filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });
  await shot(calendar, "demo-live-calendar-new-job");
  await dashboard.close();
  await calendar.close();
  await office.getByTestId("send-field-link").filter({ visible: true }).first().click();
  const sheet = office.getByTestId("field-link-sheet");
  const minted = office.waitForResponse((response) => response.url().includes(`/api/jobs/${jobId}/field-qr`) && response.request().method() === "POST");
  await sheet.getByRole("button", { name: "Show QR code" }).click();
  await expect(sheet.locator("canvas, img").first()).toBeVisible();
  // Use the exact mint response consumed by the QR sheet, not a separately generated credential.
  const fieldUrl = (await (await minted).json()).fieldUrl as string;
  expect(fieldUrl).toMatch(/\/f\//);
  await office.keyboard.press("Escape");

  const phoneContext = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  try {
    const phone = await phoneContext.newPage();
    await phone.goto(fieldUrl);
    await phone.getByLabel("Your name").fill(worker);
    await expect(phone.getByTestId("note-target")).toContainText(jobId);
    await expect(phone.getByRole("tab", { name: /Invoice|Quote/ })).toHaveCount(0);
    // The same credential is refused by the office APIs, another job, lists and a foreign tenant.
    for (const path of [`/api/jobs?businessId=${B}`, `/api/jobs/J-1001?businessId=${B}`,
      `/api/jobs/${jobId}/quote?businessId=${B}`, `/api/jobs/${jobId}/invoice?businessId=${B}`,
      `/api/businesses/${B}/appointments`, `/api/jobs/J-1001?businessId=e2e-roofing`]) {
      const res = await phoneContext.request.get(new URL(path, fieldUrl).href);
      expect([401, 403], path).toContain(res.status());
    }
    let officeLoads = 0;
    office.on("request", (request) => { if (request.isNavigationRequest() && request.frame() === office.mainFrame()) officeLoads++; });
    const tab = async (name: string) => { await office.getByTestId(`job-tab-${name}`).click(); };
    const seen = async (text: string | RegExp) => { await expect(office.getByText(text).first()).toBeVisible({ timeout: 10_000 }); };

    await tab("timeline");
    await phone.getByTestId("time-clock").getByRole("button", { name: `Clock in at ${jobId}` }).click();
    await expect(phone.getByTestId("clock-done")).toContainText(`Clocked in at ${jobId}`);
    await seen(/Arrived at the job/i);
    await shot(office, "demo-live-office-clock");

    await phone.getByTestId("note-type-toggle").click();
    await phone.getByLabel(`Note for ${jobId}`).fill("Used 12 bundles of shingles. Carlos worked 8 hours. Found a cracked vent boot.");
    await phone.getByTestId("note-save").click();
    await expect(phone.getByTestId("note-receipt")).toContainText(`Saved to ${jobId}`, { timeout: 10_000 });
    await seen("Used 12 bundles of shingles. Carlos worked 8 hours. Found a cracked vent boot.");
    await tab("materials"); await seen(/shingles/i);
    await tab("labor"); await seen(/Carlos/i);

    // Exercise the voice composer and the real write/projection/poll path, substituting ONLY transcription.
    await installVoiceAdapter(phone, jobId, worker);
    await tab("timeline");
    await phone.getByTestId("note-mic").click();
    await expect(phone.getByRole("button", { name: "Stop recording" })).toBeVisible();
    await phone.getByRole("button", { name: "Stop recording" }).click();
    await expect(phone.getByTestId("note-receipt")).toContainText("Voice demo: inspected the ridge", { timeout: 10_000 });
    await seen("Voice demo: inspected the ridge");

    await tab("photos");
    await phone.locator('input[type="file"]').setInputFiles({ name: "roof.png", mimeType: "image/png", buffer: Buffer.from(pngBase64(160, 120), "base64") });
    await phone.getByPlaceholder("Describe this photo (required)…").fill(`Roof photo ${tag}`);
    await phone.getByRole("button", { name: "Save photo" }).click();
    await expect(phone.getByText(`Photo saved to ${jobId}`)).toBeVisible();
    await seen(`Roof photo ${tag}`);
    await shot(office, "demo-live-office-photo");

    await tab("findings");
    await phone.getByRole("button", { name: /＋ Finding/ }).click();
    await phone.getByLabel("Search the Library").fill("Cracked");
    const choice = phone.locator(".sheet").getByRole("button").filter({ hasText: /cracked/i }).first();
    const finding = (await choice.innerText()).split("\n")[0].trim();
    await choice.click();
    await phone.getByRole("button", { name: "Add 1 finding", exact: true }).click();
    await seen(new RegExp(finding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    // Price privacy is enforced in the JSON boundary too, not just hidden by the phone components.
    const fieldJob = await (await phoneContext.request.get(new URL(`/api/jobs/${jobId}?businessId=${B}`, fieldUrl).href)).json();
    expect(JSON.stringify(fieldJob)).not.toMatch(/"(?:unitPrice|rate|cost|invoiceSuggestions|total|subtotal|customerSubtotal)"\s*:/);
    const officeJob = must(await admin.get(`/api/jobs/${jobId}?businessId=${B}`), "office price response");
    expect(JSON.stringify(officeJob.job.findings)).toContain('"unitPrice"');
    await shot(phone, "demo-live-phone-work");
    await shot(office, "demo-live-office-findings");
    expect(officeLoads, "phone actions update the office without navigation/reload").toBe(0);
    await expectHealthy(office);
    await expectHealthy(phone);

    // Follow the document buttons too, preserving each manual send gate.
    await tab("quote");
    await office.getByLabel("Quote recipient email").fill(email);
    await office.getByRole("button", { name: "Send quote", exact: true }).click();
    await office.getByRole("button", { name: "Mark accepted", exact: true }).click();
    await office.getByRole("button", { name: "Mark work complete", exact: true }).click();
    await tab("report");
    await office.getByRole("button", { name: "Mail report", exact: true }).click();
    await office.getByRole("button", { name: "Send report", exact: true }).click();
    await expect(office.getByText("Report sent successfully!", { exact: false })).toBeVisible();
    await tab("invoice");
    await office.getByRole("button", { name: "Create invoice", exact: true }).click();
    await office.getByRole("button", { name: "Send to Customer", exact: true }).click();
    await office.getByRole("button", { name: "Send Invoice", exact: true }).click();
    await expect(office.getByText("Invoice sent successfully!", { exact: false })).toBeVisible();
    const mail = await outbox({ to: email });
    for (const kind of [/quote|estimate/i, /report/i, /invoice/i]) expect(mail.some((m) => kind.test(String(m.subject)))).toBe(true);
    await shot(office, "demo-live-office-invoice");

    await office.goto("/hub/demo");
    await office.getByRole("button", { name: "Reset demo", exact: true }).click();
    await office.getByLabel("Type RESET to confirm").fill("RESET");
    await office.getByRole("button", { name: "Confirm reset" }).click();
    await expect(office.getByRole("button", { name: "Confirm reset" })).toHaveCount(0);
    await expect(phone.getByText("This link has ended")).toBeVisible({ timeout: 10_000 });
    expect((await phoneContext.request.get(new URL(`/api/jobs/${jobId}?businessId=${B}`, fieldUrl).href)).status()).toBe(401);
    await phone.goto(fieldUrl);
    await expect(phone).toHaveURL(/access=denied/);
    await expect(phone.getByText("This link has ended")).toBeInViewport();
    await shot(phone, "demo-live-phone-ended");
  } finally { await phoneContext.close(); }
});

async function installVoiceAdapter(phone: Page, jobId: string, submittedBy: string) {
  await phone.evaluate(() => {
    // A deterministic browser recording for CI, without OS microphone permissions or real audio.
    const stream = new MediaStream();
    navigator.mediaDevices.getUserMedia = async () => stream;
    class Recorder extends EventTarget {
      static isTypeSupported() { return true; }
      stream = stream;
      mimeType = "audio/webm";
      state = "inactive";
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onstop: (() => void) | null = null;
      start() { this.state = "recording"; }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.(new BlobEvent("dataavailable", { data: new Blob(["test recording".repeat(100)], { type: this.mimeType }) }));
        this.onstop?.();
      }
    }
    window.MediaRecorder = Recorder as unknown as typeof MediaRecorder;
  });
  await phone.route(`**/api/jobs/${jobId}/field-audio`, async (route) => {
    const transcript = "Voice demo: inspected the ridge";
    const response = await phone.request.post(route.request().url().replace("/field-audio", "/updates"), {
      data: { businessId: B, rawText: transcript, submittedBy },
    });
    expect(response.ok()).toBe(true);
    await route.fulfill({ json: { success: true, transcript, jobId, submittedBy, changesSummary: "Voice note saved" } });
  });
}
