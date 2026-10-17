import { test, expect, expectHealthy, shot } from "./fixtures";
import { db, outbox, readDoc } from "../scripts/e2e/lib.cjs";
import { SECRETS, TENANTS } from "../scripts/e2e/config.cjs";
import type { Page } from "@playwright/test";

// The self-led demo at /demo (docs/SELF-LED-DEMO-PLAN.md): one field → call (browser, dial-in with no code, or
// Just watch) → office autopilot → end card. Keyless: the browser call uses a mocked provider socket.
test.beforeAll(async () => {
  const budget = await db().collection("demoTrialBudgets").get();
  for (const doc of budget.docs) await doc.ref.delete();
});
let nextIp = 0;
async function openDemo(page: Page, biz: string, contact = "") {
  const ip = `203.0.113.${++nextIp + (test.info().project.name.includes("phone") ? 100 : 0)}`;
  await page.route("**/api/demo/roofing-trial**", (route) => route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": ip } }));
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "24-Hour English & Spanish Support for Your Customers" })).toBeVisible();
  await page.getByLabel("Your business name").fill(biz);
  if (contact) await page.getByLabel(/Phone or email/).fill(contact);
  await page.getByRole("button", { name: "Start my demo" }).click();
  await expect(page.getByRole("heading", { name: `Call ${biz}` })).toBeVisible();
  await expect(page.getByRole("button", { name: "Talk to Alice" })).toBeEnabled();
}
async function trialFor(page: Page) {
  const session = await (await page.request.get("/api/demo/roofing-trial")).json();
  return session as { businessId: string };
}
async function book(conversationId: string, callerName: string) {
  const { request } = await import("@playwright/test");
  const api = await request.newContext({ baseURL: test.info().project.use.baseURL });
  const response = await api.post("/api/webhooks/elevenlabs/tools/bookAppointment", {
    headers: { "x-luxor-tool-secret": SECRETS.tool, "x-luxor-conversation-id": conversationId },
    data: { callerName, serviceType: "Roof inspection", address: "317 Palm Way, Boca Raton", startTime: "2030-07-23T10:00:00-04:00", endTime: "2030-07-23T11:00:00-04:00" },
  });
  expect((await response.json()).result).toMatch(/^BOOKED:/);
  await api.dispose();
}

test("Just watch tells the whole story; Have us reach you emails Luxor; Explore opens a filled-in job", async ({ page }) => {
  test.setTimeout(150_000);
  const biz = `Watch ${Date.now()} Roofing`;
  await page.goto("/demo");
  await expectHealthy(page);
  await shot(page, "self-led-start");
  await openDemo(page, biz, "lead@example.test");
  await shot(page, "self-led-choose");
  await page.getByRole("button", { name: "Just watch" }).click();
  const panel = page.getByTestId("demo-call-panel");
  await expect(panel).toContainText("LIVE PHONE CALL");
  await expect(panel).toContainText("Sample call");
  await expect(panel).toContainText(`Thanks for calling ${biz}`);
  await shot(page, "self-led-call");
  await expect(panel).toContainText("BOOKED", { timeout: 20_000 });
  await expect(page.getByLabel("Your app")).toContainText("Sam Rivera");
  await shot(page, "self-led-booked");
  await page.getByRole("button", { name: "See what happens next" }).click();
  const next = () => page.getByRole("button", { name: "Next ›" }).click();
  await next(); // Job
  await next(); // Calendar
  await page.waitForTimeout(5000);
  await expect(page.getByLabel("Your app")).toContainText("Confirmed · crew emailed");
  await shot(page, "self-led-calendar");
  await next(); // Field updates
  await page.waitForTimeout(7500);
  await expect(page.getByLabel("Your app")).toContainText("Sent to the office ✓");
  await expect(page.getByLabel("Your app")).toContainText("From the job site · Carlos (foreman)");
  await shot(page, "self-led-field");
  await next(); // Inspector's quote
  await expect(page.getByLabel("Your app")).toContainText("Inspector's quote Q-1001");
  await expect(page.getByLabel("Your app")).toContainText("Example prices");
  await next(); // Report
  await next(); // Invoice
  await page.waitForTimeout(3800);
  await expect(page.getByRole("switch", { name: "Hide the breakdown from the customer" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("Your app")).toContainText("Roof repair — project price");
  await shot(page, "self-led-invoice");
  await next(); // end
  const end = page.getByRole("dialog", { name: "Your demo summary" });
  await expect(end).toContainText("Call → lead → booked appointment");
  await end.getByRole("button", { name: "Have us reach you" }).click();
  await expect(end.getByLabel("Your phone or email")).toHaveValue("lead@example.test");
  await end.getByRole("button", { name: "Send" }).click();
  await expect(end).toContainText("Done. We'll reach out");
  await shot(page, "self-led-end");
  const mail = (await outbox({ to: "connect@luxordev.com" })).filter((m: { subject?: string }) => m.subject?.includes(biz));
  expect(mail).toHaveLength(1);
  expect(mail[0].html).toContain("lead@example.test");
  const trial = await trialFor(page);
  const kept = await readDoc(`demoTrials/${trial.businessId.replace("demo-trial-roofing-", "")}`);
  expect(kept!.keepUntil).toBeGreaterThan(Date.now() + 6 * 86400_000);

  await end.getByRole("button", { name: "Explore the app" }).click();
  const app = page.getByLabel("Your app");
  await app.getByRole("button", { name: "Jobs", exact: true }).click();
  await app.getByRole("button", { name: /J-1001/ }).click();
  await app.getByRole("tab", { name: "Materials" }).click();
  await expect(app).toContainText("Filled in from the foreman's voice note");
  await app.getByRole("tab", { name: "Work log" }).click();
  await expect(app).toContainText("From the job site to the office");
  await app.getByRole("tab", { name: "Invoice" }).click();
  await expect(app).toContainText("Total due");
  await shot(page, "self-led-explore-job");
  await app.getByRole("button", { name: "Library", exact: true }).click();
  await expect(app).toContainText("Common fixes");
  await expectHealthy(page);
});

test("Talk to Alice: a real booking from the call shows up on the stage with the caller's own name", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      const oscillator = context.createOscillator(), destination = context.createMediaStreamDestination();
      oscillator.connect(destination); oscillator.start();
      return destination.stream;
    };
  });
  await page.routeWebSocket("wss://api.elevenlabs.io/**", (socket) => {
    socket.onMessage((raw) => {
      const message = JSON.parse(String(raw));
      if (message.type !== "conversation_initiation_client_data") return;
      const conversationId = new URL(socket.url()).searchParams.get("conversation_id");
      socket.send(JSON.stringify({ type: "conversation_initiation_metadata", conversation_initiation_metadata_event: {
        conversation_id: conversationId, agent_output_audio_format: "pcm_24000", user_input_audio_format: "pcm_16000" } }));
      socket.send(JSON.stringify({ type: "agent_response", agent_response_event: { agent_response: "Thanks for calling, this is Alice. How can I help?" } }));
    });
  });
  const biz = `Talk ${Date.now()} Roofing`;
  await openDemo(page, biz);
  const started = page.waitForResponse((r) => r.url().includes("/api/demo/roofing-trial") && r.request().method() === "POST" && (r.request().postData() ?? "").includes('"call"'));
  await page.getByRole("button", { name: "Talk to Alice" }).click();
  const call = await (await started).json();
  expect(call.firstMessage).toContain(biz);
  expect(call.prompt).toContain("ask once for the caller's first and last name");
  const panel = page.getByTestId("demo-call-panel");
  await expect(panel).toContainText("LIVE PHONE CALL");
  await expect(panel).toContainText("Thanks for calling, this is Alice", { timeout: 20_000 });
  await book(call.conversationId, "Jamie Caller");
  await expect(panel).toContainText("BOOKED", { timeout: 10_000 });
  await expect(page.getByLabel("Your app")).toContainText("Jamie Caller");
  await shot(page, "self-led-live-booked");
  await page.getByRole("button", { name: "See what happens next" }).click();
  await expect(page.getByLabel("Your app")).toContainText("Jamie Caller");
  await expectHealthy(page);
});

test("Or dial: a call to the shared line joins the waiting page with no code and greets with its business name", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new Error("The phone path must never ask for the microphone"); }; });
  const biz = `Dial ${Date.now()} Roofing`;
  await openDemo(page, biz);
  const dial = page.getByRole("link", { name: /Or dial/ });
  await expect(dial).toHaveAttribute("href", "tel:+16892042643");
  await dial.evaluate((a) => a.setAttribute("href", "#")); // a desktop browser has nothing to dial with
  await dial.click();
  await expect(page.getByTestId("demo-call-panel")).toContainText("Call +1 (689) 204-2643 now");
  await shot(page, "self-led-dial-waiting");
  const { businessId } = await trialFor(page);
  const trialId = businessId.replace("demo-trial-roofing-", "");
  await expect.poll(async () => Number((await readDoc(`demoTrials/${trialId}`))?.phoneArmedUntil ?? 0)).toBeGreaterThan(Date.now() + 60_000);
  const conversationId = `conv_dial_${Date.now()}`;
  const { request } = await import("@playwright/test");
  const api = await request.newContext({ baseURL: test.info().project.use.baseURL });
  const initiation = await api.post("/api/webhooks/elevenlabs/initiation", {
    headers: { "x-luxor-tool-secret": SECRETS.tool, "x-luxor-conversation-id": conversationId },
    data: { caller_id: "+13055550123", called_number: TENANTS.demo.phone, agent_id: TENANTS.demo.agentId, call_sid: `CA_${conversationId}`, conversation_id: conversationId },
  });
  expect(initiation.status()).toBe(200);
  const greeting = (await initiation.json()).conversation_config_override.agent;
  expect(greeting.first_message).toContain(biz);
  expect(greeting.first_message).not.toMatch(/digits|code/i);
  await api.dispose();
  await book(conversationId, "Pat Phone");
  await expect(page.getByTestId("demo-call-panel")).toContainText("BOOKED", { timeout: 10_000 });
  await expect(page.getByLabel("Your app")).toContainText("Pat Phone");
  const privateCall = await readDoc(`businesses/${businessId}/calls/call_elevenlabs_${conversationId}`);
  expect(privateCall).toMatchObject({ demoPhone: true, callerPhone: "+13055550123" });
  expect(await readDoc(`businesses/demo-roofing/calls/call_elevenlabs_${conversationId}`)).toBeFalsy();
  expect((await readDoc(`demoProspects/${trialId}`))!.callerPhone).toBe("+13055550123");
  await shot(page, "self-led-dial-booked");
  await expectHealthy(page);
});
