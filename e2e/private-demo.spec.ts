import { createHmac } from "crypto";
import { test, expect, expectHealthy, shot } from "./fixtures";
import { db, outbox, readDoc } from "../scripts/e2e/lib.cjs";
import { PRIVATE_TRIAL_UID_PREFIX, SECRETS, TENANTS } from "../scripts/e2e/config.cjs";
import type { Page } from "@playwright/test";

test.beforeAll(async () => {
  // Only the loopback emulator configured by scripts/e2e/config.cjs; each project gets a fresh daily test budget.
  const budget = await db().collection("demoTrialBudgets").get();
  for (const doc of budget.docs) await doc.ref.delete();
});
let nextTestIp = 0;
async function createFromLanding(page: Page, name: string, email = "") {
  const testIp = `198.51.100.${++nextTestIp}`;
  await page.route("**/api/demo/roofing-trial", (route) => route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": testIp } }));
  await page.goto("/try/roofing");
  await page.getByRole("button", { name: "See Your Booking in the App", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Make It Your Demo" });
  await dialog.getByLabel("Your Name", { exact: true }).fill(name);
  await dialog.getByLabel("Business Name", { exact: true }).fill(`${name} Roofing`);
  await dialog.getByLabel("Confirmation Email (Optional)", { exact: true }).fill(email);
  await shot(page, "private-demo-setup");
  await dialog.getByRole("button", { name: "Start My Demo" }).click();
  await expect(page).toHaveURL(/\/company\/pipeline$/);
  await expect(page.getByRole("heading", { name: "Pipeline", exact: true })).toBeVisible();
  const profile = (await (await page.request.get("/api/auth/profile")).json()).profile;
  expect(profile.uid).toMatch(new RegExp(`^${PRIVATE_TRIAL_UID_PREFIX}`));
  expect(profile).toMatchObject({ role: "viewer", isDemoTrial: true });
  return profile;
}

test("three centered actions explain the product and open a private app without microphone permission", async ({ as }) => {
  const page = await as("viewer");
  await page.goto("/try/roofing");
  await expect(page.getByRole("heading", { name: "24-Hour English & Spanish Support for Your Customers" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Try the demo" }).getByRole("listitem")).toHaveCount(3);
  await expect(page.getByText("So simple, you won't need training.")).toBeVisible();
  await expect(page.getByText(/View only|Sample bookings/)).toHaveCount(0);
  for (const name of ["Call in Browser", "See Your Booking in the App", "Add a Voice Update"]) {
    const button = page.getByRole("button", { name, exact: true });
    if (name !== "Call in Browser") await button.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport();
    const box = await button.boundingBox();
    const width = page.viewportSize()!.width;
    expect(Math.abs(box!.x + box!.width / 2 - width / 2)).toBeLessThan(3);
  }
  await expect(page.locator(".button.primary")).toHaveCount(1);
  await expectHealthy(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByRole("button", { name: "Dial (689) 204-2643", exact: true })).toBeInViewport();
  await shot(page, "private-demo-landing");
  const profile = await createFromLanding(page, `Prospect ${Date.now()}`);
  await expect(page.getByTestId("private-demo-nav")).toBeVisible();
  await expect(page.getByTestId("private-demo-nav").getByRole("button", { name: "3. Add a Voice Update", exact: true })).toBeInViewport();
  await expect(page.getByTestId("private-demo-nav").locator(".button.primary")).toHaveCount(1);
  expect((await page.request.get("/api/businesses/demo-roofing/calls")).status()).toBe(403);
  expect((await page.request.post("/api/jobs", { data: { businessId: profile.businessId, title: "Denied office write" } })).status()).toBe(403);
  expect((await page.request.post("/api/admin/demo-customize", { data: { companyName: "Denied" } })).status()).toBe(403);
  await expectHealthy(page);

  // A resumed cookie must never silently override newly entered business/contact details.
  await page.goto("/try/roofing");
  await expect(page.getByText(`Your demo: ${profile.businessName}`)).toBeVisible();
  await page.getByRole("button", { name: "Change Demo Details", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Make It Your Demo" });
  await edit.getByLabel("Business Name", { exact: true }).fill("New Prospect Roofing");
  await edit.getByLabel("Confirmation Email (Optional)", { exact: true }).fill("new-prospect@example.test");
  await shot(page, "private-demo-change-details");
  await edit.getByRole("button", { name: "Save and Open My Demo", exact: true }).click();
  await expect(page).toHaveURL(/\/company\/pipeline$/);
  await expect(page.getByRole("heading", { name: "Pipeline", exact: true })).toBeVisible();
  const changed = (await (await page.request.get("/api/auth/profile")).json()).profile;
  expect(changed.businessId).not.toBe(profile.businessId);
  expect(changed.businessName).toBe("New Prospect Roofing");
  const newCall = await page.request.post("/api/demo/roofing-trial", { data: { action: "call" } });
  expect(newCall.status()).toBe(200);
  const greeting = await newCall.json();
  expect(greeting.firstMessage).toContain("New Prospect Roofing");
  expect(greeting.firstMessage).not.toContain(profile.businessName);
  expect(greeting.prompt).toContain('"confirmationEmail":"new-prospect@example.test"');
  expect((await page.request.get(`/api/businesses/${profile.businessId}/calls`)).status()).toBe(403);
});

test("a real local booking emails only the entered address and field updates reach that same private job", async ({ as }) => {
  test.setTimeout(120_000);
  const page = await as("viewer");
  const name = `Private Caller ${Date.now()}`, email = `trial-${Date.now()}@example.test`;
  const profile = await createFromLanding(page, name, email);
  const started = await page.request.post("/api/demo/roofing-trial", { data: { action: "call" } });
  expect(started.status()).toBe(200);
  const call = await started.json();
  expect(call.firstMessage).toContain(`${name} Roofing`);
  expect(call.prompt).toContain("No phone number is required for this browser demo");
  const headers = { "x-luxor-tool-secret": SECRETS.tool, "x-luxor-conversation-id": call.conversationId };
  const booked = await page.request.post("/api/webhooks/elevenlabs/tools/bookAppointment", { headers, data: {
    businessId: "demo-roofing", name: "Wrong model alias", callerName: "Wrong model name", callerEmail: "wrong@example.test", email: "also-wrong@example.test",
    serviceType: "Roof inspection", address: "317 Palm Way, Boca Raton, 33432",
    startTime: "2030-07-23T10:00:00-04:00", endTime: "2030-07-23T11:00:00-04:00",
  } });
  expect((await booked.json()).result).toMatch(/^BOOKED:/);
  // A repeated/change tool request from this same trusted call must not save a second appointment or email.
  const duplicate = await page.request.post("/api/webhooks/elevenlabs/tools/bookAppointment", { headers, data: {
    callerName: name, serviceType: "Roof inspection", address: "317 Palm Way, Boca Raton, 33432",
    startTime: "2030-07-24T11:00:00-04:00", endTime: "2030-07-24T12:00:00-04:00",
  } });
  expect((await duplicate.json()).result).toMatch(/^NOT BOOKED:/);
  expect((await db().collection(`businesses/${profile.businessId}/appointments`).get()).size).toBe(1);
  const job = await readDoc(`businesses/${profile.businessId}/jobs/J-1001`);
  expect(job).toMatchObject({ clientName: name, clientEmail: email, sourceCallId: `call_elevenlabs_${call.conversationId}` });
  const appointment = await readDoc(`businesses/${profile.businessId}/appointments/${job!.sourceAppointmentId}`);
  expect(appointment).toMatchObject({ status: "confirmed", pendingConfirmation: false, jobId: "J-1001", callerEmail: email });
  const messages = await outbox({ to: email });
  expect(messages).toHaveLength(1);
  expect(messages[0].html).toContain(`${name} Roofing`);
  expect(messages[0].html).not.toContain("Call ID");
  expect(messages[0].subject).toContain("[Demo]");
  const now = Math.floor(Date.now() / 1000);
  const raw = JSON.stringify({ type: "post_call_transcription", event_timestamp: now, data: { conversation_id: call.conversationId,
    transcript: [{ role: "user", message: "Please book my demo inspection.", time_in_call_secs: 0 }], metadata: { start_time_unix_secs: now - 30, call_duration_secs: 30 }, analysis: { transcript_summary: "Private demo inspection booked." } } });
  const signature = createHmac("sha256", SECRETS.webhook).update(`${now}.${raw}`).digest("hex");
  expect((await page.request.post("/api/webhooks/elevenlabs/post-call", { headers: { "content-type": "application/json", "elevenlabs-signature": `t=${now},v0=${signature}` }, data: raw })).status()).toBe(200);
  await page.reload();
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  await shot(page, "private-demo-booking");
  await page.getByTestId("private-demo-nav").getByRole("button", { name: "3. Add a Voice Update", exact: true }).click();
  await expect(page).toHaveURL(/\/field\?businessId=demo-trial-roofing-/);
  const composer = page.getByRole("region", { name: "Send a field note" });
  await expect(composer).toBeVisible();
  await expect(composer.getByRole("button", { name: "Record a voice note", exact: true })).toBeInViewport();
  await expect(page.getByLabel("Your name", { exact: true })).toHaveValue(name);
  await composer.getByRole("button", { name: /Type/i }).click();
  await composer.getByRole("textbox").fill("Used 12 bundles of shingles. Carlos worked 8 hours. Found a cracked vent boot.");
  await composer.getByTestId("note-save").click();
  await expect(composer).toContainText(/Saved to J-1001/);
  await shot(page, "private-demo-field-saved");
  const updated = await readDoc(`businesses/${profile.businessId}/jobs/J-1001`);
  expect(updated!.materials).toEqual(expect.arrayContaining([expect.objectContaining({ quantity: 12 })]));
  expect(updated!.sourceAppointmentId).toBe(job!.sourceAppointmentId);
  await page.getByRole("link", { name: "See Updated Job", exact: true }).click();
  await expect(page).toHaveURL(/\/company\/jobs\/J-1001/);
  await expect(page.getByRole("heading", { name: /^Your Demo Roof Inspection/ })).toBeVisible();
  await expect(page.getByText(/Used 12 bundles of shingles/).first()).toBeVisible();
  await expect(page.getByText("Loading history…", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Add a note", exact: true })).toHaveCount(0);
  await expectHealthy(page);
  await shot(page, "private-demo-job");
  await page.getByTestId("job-tab-findings").click();
  await expect(page.getByTestId("viewer-findings")).toContainText(/cracked vent boot/i);
  await expect(page.getByTestId("viewer-findings").getByRole("button")).toHaveCount(0);
  await expect(page.getByTestId("viewer-findings").getByRole("textbox")).toHaveCount(0);
  expect((await page.request.patch("/api/jobs/J-1001", { data: { businessId: profile.businessId, findings: [] } })).status()).toBe(403);
  await expect(page.getByText(/cracked vent boot/i).first()).toBeVisible();
  await shot(page, "private-demo-findings");
  for (const kind of ["quote", "report", "invoice"]) {
    await page.getByTestId(`job-tab-${kind}`).click();
    const preview = page.getByTestId(`private-demo-${kind}`);
    await expect(preview).toContainText("Demo preview — not sent");
    await expect(preview).toContainText(/cracked vent boot/i);
    await expect(preview).toContainText(/12.*shingles/i);
    await expect(preview).toContainText(/Carlos.*8 hours/i);
    await expect(preview.locator("article")).toBeVisible();
    await expect(page.getByRole("button", { name: /^(?:Send|Generate) (?:Quote|Report|Invoice)$/i })).toHaveCount(0);
    await expect(page.getByTestId(`job-tab-${kind}`)).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId(`job-tab-${kind}`).getByLabel("Complete")).toHaveCount(0);
    await expectHealthy(page);
    await shot(page, `private-demo-${kind}`);
  }

  const other = await as("viewer");
  const otherProfile = await createFromLanding(other, `Other Prospect ${Date.now()}`);
  expect(otherProfile.businessId).not.toBe(profile.businessId);
  expect((await other.request.get(`/api/jobs/J-1001?businessId=${profile.businessId}`)).status()).toBe(403);
  expect((await other.request.get(`/api/businesses/${profile.businessId}/calls`)).status()).toBe(403);
  expect((await other.request.get("/api/admin/demo-prospects")).status()).toBe(403);
});

test("missing, foreign and expired sessions fail closed; paid calls and notes stop at their limits", async ({ as }) => {
  const page = await as("viewer");
  const requestHeaders = { "x-forwarded-for": `198.51.100.${100 + ++nextTestIp}` };
  const trialPost = (options: { data: unknown; headers?: Record<string, string> }) => page.request.post("/api/demo/roofing-trial", { ...options, headers: { ...requestHeaders, ...options.headers } });
  expect((await trialPost({ data: { action: "call" } })).status()).toBe(401);
  expect((await trialPost({ headers: { origin: "https://evil.example" }, data: { action: "create", name: "Caller", companyName: "Roofing" } })).status()).toBe(403);
  const profile = await createFromLanding(page, `Limits ${Date.now()}`);
  expect((await trialPost({ data: { action: "field", businessId: "demo-roofing" } })).status()).toBe(400);
  for (let i = 0; i < 2; i++) expect((await trialPost({ data: { action: "call" } })).status()).toBe(200);
  expect((await trialPost({ data: { action: "call" } })).status()).toBe(429);
  const grant = await (await trialPost({ data: { action: "field" } })).json();
  await page.goto(grant.url);
  expect((await page.request.post("/api/jobs/J-1001/photos", { data: { businessId: profile.businessId, label: "Denied demo upload", thumbB64: "AAAA", fullB64: "AAAA" } })).status()).toBe(403);
  expect((await page.request.post("/api/timeclock/punch", { data: { businessId: profile.businessId, type: "site_in", jobId: "J-1001", workerName: profile.displayName } })).status()).toBe(403);
  for (let i = 0; i < 3; i++) expect((await page.request.post("/api/jobs/J-1001/updates", { data: { businessId: profile.businessId, rawText: "Inspected the roof.", submittedBy: profile.displayName } })).status()).toBe(201);
  expect((await page.request.post("/api/jobs/J-1001/updates", { data: { businessId: profile.businessId, rawText: "One more note", submittedBy: profile.displayName } })).status()).toBe(429);
  const correction = { businessId: profile.businessId, submittedBy: profile.displayName, confirmCorrection: { targetUpdateId: "demo-fixture", item: "shingles", field: "materials", newValue: 2 } };
  for (let i = 0; i < 6; i++) expect((await page.request.post("/api/jobs/J-1001/updates", { data: correction })).status()).toBe(201);
  expect((await page.request.post("/api/jobs/J-1001/updates", { data: correction })).status()).toBe(429);
  const id = profile.businessId.replace("demo-trial-roofing-", "");
  await db().collection("demoTrials").doc(id).update({ expiresAt: 0 });
  await db().collection("businesses").doc(profile.businessId).update({ demoTrialExpiresAt: 0 });
  expect((await trialPost({ data: { action: "field" } })).status()).toBe(401);
  // Drop the office login, retaining only the already-issued job-scoped field cookie.
  const cookies = (await page.context().cookies()).filter((cookie) => cookie.name !== "__session");
  await page.context().clearCookies(); await page.context().addCookies(cookies);
  expect((await page.request.get(`/api/jobs/J-1001/updates?businessId=${profile.businessId}`)).status()).toBe(403);
});

test("the demo-only CSP permits its audio worklets without altering other pages", async ({ page }) => {
  const demo = await page.request.get("/try/roofing"), ordinary = await page.request.get("/try/dental");
  expect(demo.headers()["content-security-policy"]).toContain("wss://api.elevenlabs.io");
  expect(demo.headers()["content-security-policy"]).toContain("'wasm-unsafe-eval'");
  expect(ordinary.headers()["content-security-policy"]).not.toContain("'wasm-unsafe-eval'");
  for (const file of ["rawAudioProcessor.js", "audioConcatProcessor.js", "libsamplerate.worklet.js"]) expect((await page.request.get(`/voice-worklets/${file}`)).status()).toBe(200);
});

test("browser calling loads real SDK audio worklets and disconnects cleanly with a mocked provider", async ({ as }) => {
  const page = await as("viewer");
  const name = `Browser Audio ${Date.now()}`;
  const testIp = `198.51.100.${++nextTestIp}`;
  await page.route("**/api/demo/roofing-trial", (route) => route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": testIp } }));
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    const loadedModules: string[] = [];
    (window as unknown as { trialAudioModules: string[] }).trialAudioModules = loadedModules;
    const addModule = AudioWorklet.prototype.addModule;
    AudioWorklet.prototype.addModule = async function (url, options) { await addModule.call(this, url, options); loadedModules.push(String(url)); };
    // Force sample-rate conversion so this verifies the self-hosted WASM resampler under the real page CSP.
    window.AudioContext = class extends NativeAudioContext { constructor() { super({ sampleRate: 44100 }); } };
    const constraints = navigator.mediaDevices.getSupportedConstraints();
    navigator.mediaDevices.getSupportedConstraints = () => ({ ...constraints, sampleRate: false });
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new NativeAudioContext();
      const oscillator = context.createOscillator(), destination = context.createMediaStreamDestination();
      oscillator.connect(destination); oscillator.start();
      return destination.stream;
    };
  });

  let textOnly: unknown;

  await page.routeWebSocket("wss://api.elevenlabs.io/**", (socket) => {
    socket.onMessage((raw) => {
      const message = JSON.parse(String(raw));
      if (message.type !== "conversation_initiation_client_data") return;
      textOnly = message.conversation_config_override?.conversation?.text_only;
      const conversationId = new URL(socket.url()).searchParams.get("conversation_id");
      socket.send(JSON.stringify({ type: "conversation_initiation_metadata", conversation_initiation_metadata_event: {
        conversation_id: conversationId, agent_output_audio_format: "pcm_24000", user_input_audio_format: "pcm_16000",
      } }));
    });
  });
  await page.goto("/try/roofing");
  await page.getByRole("button", { name: "Call in Browser", exact: true }).click();
  const setup = page.getByRole("dialog", { name: "Make It Your Demo" });
  await setup.getByLabel("Your Name", { exact: true }).fill(name);
  await setup.getByLabel("Business Name", { exact: true }).fill(`${name} Roofing`);
  await setup.getByRole("button", { name: "Start My Demo", exact: true }).click();
  await expect(page.getByText(/You're speaking with Browser Audio/)).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("button", { name: "End Call", exact: true })).toBeEnabled();
  expect(textOnly).toBe(false);
  const loaded = await page.evaluate(() => (window as unknown as { trialAudioModules: string[] }).trialAudioModules);
  for (const file of ["libsamplerate.worklet.js", "rawAudioProcessor.js", "audioConcatProcessor.js"]) expect(loaded).toContain(`/voice-worklets/${file}`);
  await shot(page, "private-demo-browser-call");
  await page.getByRole("button", { name: "End Call", exact: true }).click();
  await expect(page.getByText("Call ended. Continue in the app.")).toBeVisible();
  await expectHealthy(page);
});

test("dialing uses the same private setup and booking without desktop audio", async ({ as }) => {
  const page = await as("viewer");
  const name = `Phone Prospect ${Date.now()}`, email = `phone-${Date.now()}@example.test`;
  await page.route("**/api/demo/roofing-trial", route => route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": `198.51.100.${++nextTestIp}` } }));
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new Error("Phone path must never request microphone permission"); }; });
  await page.goto("/try/roofing");
  await page.getByRole("button", { name: "Dial (689) 204-2643", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Make It Your Demo" });
  await dialog.getByLabel("Your Name", { exact: true }).fill(name);
  await dialog.getByLabel("Business Name", { exact: true }).fill(`${name} Roofing`);
  await dialog.getByLabel("Confirmation Email (Optional)", { exact: true }).fill(email);
  await dialog.getByRole("button", { name: "Show My Demo Code", exact: true }).click();
  const codePanel = page.getByTestId("phone-demo-code");
  await expect(codePanel).toBeVisible();
  const code = (await codePanel.locator("strong").innerText()).replace(/\s/g, "");
  expect(code).toMatch(/^\d{8}$/);
  await expect(page.getByRole("link", { name: "Dial (689) 204-2643", exact: true })).toHaveAttribute("href", "tel:+16892042643");
  await codePanel.scrollIntoViewIfNeeded();
  await expect(codePanel).toBeInViewport();
  await expectHealthy(page); await shot(page, "private-demo-phone-code");
  const profile = (await (await page.request.get("/api/auth/profile")).json()).profile;
  const conversationId = `conv_phone_${Date.now()}`;
  const headers = { "x-luxor-tool-secret": SECRETS.tool, "x-luxor-conversation-id": conversationId };
  const initiation = await page.request.post("/api/webhooks/elevenlabs/initiation", { headers, data: {
    caller_id: "+13055550123", called_number: TENANTS.demo.phone, agent_id: TENANTS.demo.agentId,
    call_sid: `CA_${conversationId}`, conversation_id: conversationId,
  } });
  expect(initiation.status()).toBe(200);
  expect((await initiation.json()).conversation_config_override.agent.first_message).toContain("eight digits");
  const join = await page.request.post("/api/webhooks/elevenlabs/tools/connectDemoSession", { headers, data: { demoCode: code, businessId: "demo-roofing" } });
  const joined = await join.json(); expect(joined.result).toMatch(/^CONNECTED:/);
  expect(joined).toMatchObject({ businessName: `${name} Roofing`, callerName: name, confirmationEmail: email });
  const booked = await page.request.post("/api/webhooks/elevenlabs/tools/bookAppointment", { headers, data: {
    businessId: "demo-roofing", callerName: "Wrong Alias", email: "wrong@example.test", callbackPhone: "+15555559999", textOk: true,
    serviceType: "Roof inspection", address: "317 Palm Way, Boca Raton, 33432", startTime: "2030-07-23T10:00:00-04:00", endTime: "2030-07-23T11:00:00-04:00",
  } });
  expect((await booked.json()).result).toMatch(/^BOOKED:/);
  expect(await readDoc(`businesses/${profile.businessId}/jobs/J-1001`)).toBeTruthy();
  const emails = (await outbox()).filter((m: { to?: string[] | string }) => Array.isArray(m.to) ? m.to.includes(email) : m.to === email);
  expect(emails).toHaveLength(1);
  const phoneAppointment = await readDoc(`businesses/${profile.businessId}/appointments/${(await readDoc(`businesses/${profile.businessId}/jobs/J-1001`))!.sourceAppointmentId}`);
  expect(phoneAppointment).toMatchObject({ callerName: name, callerEmail: email, callerPhone: "+13055550123" });
  expect(phoneAppointment!.callbackPhone).toBeUndefined();
  const trialId = profile.businessId.replace("demo-trial-roofing-", "");
  expect((await readDoc(`demoTrials/${trialId}`))!.calls).toBe(1);
  const now = Math.floor(Date.now() / 1000), raw = JSON.stringify({ type: "post_call_transcription", event_timestamp: now,
    data: { agent_id: TENANTS.demo.agentId, conversation_id: conversationId, status: "done", transcript: [{ role: "user", message: "Private phone demo booked.", time_in_call_secs: 0 }], metadata: { start_time_unix_secs: now - 30, call_duration_secs: 30 }, analysis: { transcript_summary: "Private phone demo booked." } } });
  const signature = createHmac("sha256", SECRETS.webhook).update(`${now}.${raw}`).digest("hex");
  expect((await page.request.post("/api/webhooks/elevenlabs/post-call", { headers: { "content-type": "application/json", "elevenlabs-signature": `t=${now},v0=${signature}` }, data: raw })).status()).toBe(200);
  const privateCall = await readDoc(`businesses/${profile.businessId}/calls/call_elevenlabs_${conversationId}`);
  expect(privateCall!.status).toBe("ended");
  expect(privateCall!.messages).toEqual(expect.arrayContaining([expect.objectContaining({ text: "Private phone demo booked." })]));
  expect((await readDoc(`businesses/demo-roofing/calls/call_elevenlabs_${conversationId}`))!.messages).toBeUndefined();
  await page.getByRole("button", { name: "See Your Booking in the App", exact: true }).click();
  await expect(page).toHaveURL(/\/company\/pipeline$/);
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  await expectHealthy(page); await shot(page, "private-demo-phone-booking");
});