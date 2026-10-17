import { createHmac } from "crypto";
import { test, expect } from "./fixtures";
import { db, outbox, readDoc } from "../scripts/e2e/lib.cjs";
import { SECRETS } from "../scripts/e2e/config.cjs";
import type { Page } from "@playwright/test";

test.beforeAll(async () => {
  // Only the loopback emulator configured by scripts/e2e/config.cjs; each project gets a fresh daily test budget.
  const budget = await db().collection("demoTrialBudgets").get();
  for (const doc of budget.docs) await doc.ref.delete();
});
let nextTestIp = 0;
// The self-led /demo page no longer signs the window into the app (e2e/self-led-demo.spec.ts covers its screens);
// these checks drive the same private-trial API it uses.
async function createTrial(page: Page, name: string, email = "") {
  const testIp = `198.51.100.${++nextTestIp}`;
  await page.route("**/api/demo/roofing-trial", (route) => route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": testIp } }));
  const created = await page.request.post("/api/demo/roofing-trial", { headers: { "x-forwarded-for": testIp }, data: { action: "create", name, companyName: `${name} Roofing`, email } });
  expect(created.status()).toBe(200);
  const trial = await created.json();
  expect(trial.businessId).toMatch(/^demo-trial-roofing-/);
  return { businessId: trial.businessId as string, displayName: name, testIp };
}

test("a real local booking emails only the entered address and field updates reach that same private job", async ({ as }) => {
  test.setTimeout(120_000);
  const page = await as("viewer");
  const name = `Private Caller ${Date.now()}`, email = `trial-${Date.now()}@example.test`;
  const profile = await createTrial(page, name, email);
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
  // The crew's field note (job-scoped field grant) still lands on the same private job.
  const grant = await (await page.request.post("/api/demo/roofing-trial", { data: { action: "field" } })).json();
  await page.goto(grant.url);
  expect((await page.request.post("/api/jobs/J-1001/updates", { data: { businessId: profile.businessId, rawText: "Used 12 bundles of shingles. Carlos worked 8 hours. Found a cracked vent boot.", submittedBy: name } })).status()).toBe(201);
  const updated = await readDoc(`businesses/${profile.businessId}/jobs/J-1001`);
  expect(updated!.sourceAppointmentId).toBe(job!.sourceAppointmentId);

  const other = await as("viewer");
  const otherProfile = await createTrial(other, `Other Prospect ${Date.now()}`);
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
  const profile = await createTrial(page, `Limits ${Date.now()}`);
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
  const demo = await page.request.get("/demo"), ordinary = await page.request.get("/try/dental");
  expect(demo.headers()["content-security-policy"]).toContain("wss://api.elevenlabs.io");
  expect(demo.headers()["content-security-policy"]).toContain("'wasm-unsafe-eval'");
  expect(ordinary.headers()["content-security-policy"]).not.toContain("'wasm-unsafe-eval'");
  for (const file of ["rawAudioProcessor.js", "audioConcatProcessor.js", "libsamplerate.worklet.js"]) expect((await page.request.get(`/voice-worklets/${file}`)).status()).toBe(200);
});
