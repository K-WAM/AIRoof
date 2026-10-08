// The parts of the roofing story the other specs do not walk (2026-10-08 production-readiness pass):
//   - an English and a Spanish phone call through the real ElevenLabs webhooks — the Spanish one is marked "Spanish" on
//     Calls and in the Pipeline, the English one is not;
//   - a Spanish field note is detected as Spanish with no setting;
//   - a crew is assigned (its members are emailed), a member is absent and a worker from outside the crew fills in:
//     Arrived office → Arrived jobsite → Lunch → Back → note → Left jobsite → Left office;
//   - "Hide the detailed breakdown": a Project-price quote and its invoice email show one price, never the lines.
import { test, expect, settle, shot, expectHealthy } from "./fixtures";
import { api, must, outbox as rawOutbox, readCollection as rawReadCollection, readDoc, simulateCall } from "../scripts/e2e/lib.cjs";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const outbox = (q: { to?: string; subject?: string }) => rawOutbox(q) as Promise<Array<{ subject: string; html: string; text?: string }>>;
const readCollection = (path: string) => rawReadCollection(path) as Promise<Row[]>;

const B = "e2e-roofing";
test.describe.configure({ mode: "serial" });

const tag = () => Date.now().toString(36).slice(-5);
const phone = () => `+1555${String(Math.floor(1000000 + Math.random() * 8999999))}`;
const slot = () => {
  const day = new Date(Date.now() + (2 + Math.floor(Math.random() * 300)) * 86400000);
  day.setUTCHours(14 + Math.floor(Math.random() * 6), Math.random() < 0.5 ? 0 : 30, 0, 0);
  return day.getTime();
};

test("English and Spanish calls: both reach the Pipeline, the Spanish caller is marked Spanish", async ({ as }, testInfo) => {
  const t = tag();
  const english = { name: `Ellen English ${t}`, phone: phone() };
  const spanish = { name: `Sofía Español ${t}`, phone: phone() };

  const en = await simulateCall({
    tenant: "roofing", from: english.phone, summary: `${english.name} wants a roof inspection.`,
    transcript: [["agent", "Thanks for calling E2E Roofing Co. También hablamos español."], ["user", "Hi, my roof is leaking near the chimney."], ["agent", "I can book an inspection."], ["user", `${english.name}, 12 Palm Ave, Miami.`]],
    tools: [["bookAppointment", { name: english.name, service: "Roof inspection", address: "12 Palm Ave, Miami, FL", preferredTime: slot() }]],
  });
  const es = await simulateCall({
    tenant: "roofing", from: spanish.phone, summary: `${spanish.name} reports a leak and wants an inspection.`,
    transcript: [["agent", "Thanks for calling E2E Roofing Co. También hablamos español."], ["user", "Hola, tengo una gotera en el techo de la cocina."], ["agent", "Claro, con gusto. ¿Cuál es su nombre y dirección?"], ["user", `${spanish.name}, 40 Calle Ocho, Miami.`]],
    tools: [["bookAppointment", { name: spanish.name, service: "Inspección de techo", address: "40 Calle Ocho, Miami, FL", preferredTime: slot() }]],
  });
  for (const call of [en, es]) {
    const booked = call.toolResults.find((r: { tool: string }) => r.tool === "bookAppointment");
    expect(booked?.status, JSON.stringify(booked?.result)).toBe(200);
  }

  const enCall = await readDoc(`businesses/${B}/calls/${en.callId}`);
  const esCall = await readDoc(`businesses/${B}/calls/${es.callId}`);
  expect(enCall?.status).toBe("ended");
  expect(enCall?.callerLanguage).toBeUndefined();
  expect(esCall?.callerLanguage).toBe("es");
  expect((esCall?.messages as Array<{ text: string }>).some((m) => /gotera/.test(m.text))).toBe(true);

  const owner = await api("owner");
  const appts = must(await owner.get(`/api/businesses/${B}/appointments`), "appointments").appointments as Array<Record<string, unknown>>;
  const esAppt = appts.find((a) => a.callerName === spanish.name);
  const enAppt = appts.find((a) => a.callerName === english.name);
  expect(esAppt?.callerLanguage).toBe("es");
  expect(enAppt?.callerLanguage).toBeUndefined();

  const page = await as("owner");
  await page.goto("/company/calls");
  await settle(page);
  await expect(page.getByText("Spoke Spanish").first()).toBeVisible();
  await shot(page, "calls-spanish-caller", testInfo);
  await expectHealthy(page);

  await page.goto(`/company/pipeline?appt=${encodeURIComponent(String(esAppt?.appointmentId ?? esAppt?.id))}`);
  await settle(page);
  const card = page.locator(".appt-name-row", { hasText: spanish.name });
  await expect(card.getByText("Spanish", { exact: true })).toBeVisible();
  await shot(page, "pipeline-spanish-caller", testInfo);
  await expectHealthy(page);
});

test("crew day: assignment emails the crew, an absent member is covered by a fill-in, office/lunch/site clock, Spanish note", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "API walk-through — once is enough");
  const t = tag();
  const owner = await api("owner");
  const sub = await api("fieldCrew"); // Frank Field — on no crew; fills in for the absent member

  const { crew } = must(await owner.post("/api/company/crews", { businessId: B, name: `Day Crew ${t}`, email: `daycrew.${t}@crew.e2e.test` }), "create crew");
  const crewId = crew.crewId as string;
  try {
    must(await owner.patch("/api/company/team/e2e-crew", { businessId: B, crewId }), "put Carlos on the crew");
    const { job } = must(await owner.post("/api/jobs", { businessId: B, title: `Reroof ${t}`, address: "9 Coral Way, Miami, FL", clientName: `Crew Day Client ${t}`, clientPhone: phone(), serviceType: "Reroof" }), "create job");
    const jobId = job.jobId as string;

    // Office assigns the job and emails the crew: the crew inbox and every member with an email.
    const start = slot();
    must(await owner.post(`/api/jobs/${jobId}/assign`, { businessId: B, crewId, scheduledStart: start, scheduledEnd: start + 4 * 3600000, crewConfirmed: true, notify: true }), "assign + notify");
    const crewMail = await outbox({ to: `daycrew.${t}@crew.e2e.test` });
    const memberMail = await outbox({ to: "crew@roofing.e2e.test" });
    expect(crewMail.length, "crew inbox emailed").toBeGreaterThan(0);
    expect(memberMail.some((m) => m.html.includes(jobId) || m.html.includes(`Reroof ${t}`)), "member Carlos emailed").toBe(true);

    // Carlos is out today; Frank (not on this crew) covers. He can clock and write notes on the job.
    const dayStart = Date.now();
    const punch = async (type: string, withJob = false) =>
      must(await sub.post("/api/timeclock/punch", { businessId: B, type, ...(withJob ? { jobId } : {}) }), `punch ${type}`).day;
    const state = (await sub.get(`/api/timeclock/punch?businessId=${B}`)).json?.day?.state;
    if (state && state !== "off") test.info().annotations.push({ type: "note", description: `Frank started in state ${state}` });
    if (state === "site" || state === "site_break") {
      const open = (await sub.get(`/api/timeclock/punch?businessId=${B}`)).json.day.openJobId;
      if (state === "site_break") must(await sub.post("/api/timeclock/punch", { businessId: B, type: "break_end", jobId: open }), "end stale break");
      must(await sub.post("/api/timeclock/punch", { businessId: B, type: "site_out", jobId: open }), "close stale site");
    }
    if (state === "break_office") must(await sub.post("/api/timeclock/punch", { businessId: B, type: "break_end" }), "end stale office break");
    if (!state || state === "off") expect((await punch("office_in")).state).toBe("office");
    expect((await punch("site_in", true)).state).toBe("site");
    expect((await punch("break_start", true)).state).toBe("site_break");
    expect((await punch("break_end", true)).state).toBe("site");

    must(await sub.post(`/api/jobs/${jobId}/updates`, { businessId: B, rawText: "Hoy cambiamos el tapajuntas de la chimenea y pusimos 6 rollos de membrana." }), "Spanish field note");
    const updates = await readCollection(`businesses/${B}/jobs/${jobId}/updates`);
    const note = updates.find((u) => String(u.rawText).includes("tapajuntas"));
    expect(note?.language, "Spanish detected with no setting").toBe("es");
    expect(note?.submittedBy, "the fill-in is the author").toBe("Frank Field");

    expect((await punch("site_out", true)).state).toBe("office");
    const end = await punch("office_out");
    expect(end.state).toBe("off");
    // Breaks carry no job (they pause whichever clock is running); the site punches carry this job.
    const punches = (await readCollection(`businesses/${B}/punches`)).filter((p) => p.workerName === "Frank Field" && Number(p.createdAt) >= dayStart);
    expect(punches.map((p) => p.type)).toEqual(expect.arrayContaining(["break_start", "break_end", "site_in", "site_out", "office_out"]));
    expect(punches.filter((p) => p.type === "site_in" || p.type === "site_out").every((p) => p.jobId === jobId)).toBe(true);
  } finally {
    await owner.patch("/api/company/team/e2e-crew", { businessId: B, crewId: null }).catch(() => {});
    await owner.del(`/api/company/crews?businessId=${B}&crewId=${crewId}`).catch(() => {});
  }
});

test("hide the detailed breakdown: a Project-price quote and its invoice email show one price, never the lines", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "API walk-through — once is enough");
  const t = tag();
  const owner = await api("owner");
  const email = `project.${t}@customer.e2e.test`;
  const { job } = must(await owner.post("/api/jobs", { businessId: B, title: `Flat roof ${t}`, address: "3 Bay Rd, Miami, FL", clientName: `Project Client ${t}`, clientPhone: phone(), clientEmail: email, serviceType: "Flat roof repair" }), "create job");
  const jobId = job.jobId as string;

  must(await owner.post(`/api/jobs/${jobId}/quote`, { businessId: B }), "create quote");
  must(await owner.patch(`/api/jobs/${jobId}/quote`, {
    businessId: B,
    lines: [
      { lineId: "l1", kind: "labor", description: `Secret labor line ${t}`, quantity: 6, unit: "hour", unitPrice: 85 },
      { lineId: "l2", kind: "material", description: `Secret membrane ${t}`, quantity: 4, unit: "roll", unitPrice: 120 },
    ],
    priceMode: "project", customerSubtotal: 1200,
  }), "project price");
  must(await owner.post(`/api/jobs/${jobId}/quote/send`, { businessId: B, to: email }), "send quote");
  const quoteMail = (await outbox({ to: email })).find((m) => /quote|estimate/i.test(m.subject))!;
  expect(quoteMail, "quote emailed").toBeTruthy();
  expect(quoteMail.html).toContain("Project price");
  expect(quoteMail.html).not.toContain(`Secret labor line ${t}`);
  expect(quoteMail.html).not.toContain(`Secret membrane ${t}`);
  expect(quoteMail.html).toContain("$1,200.00");

  // The customer says yes (by reply or phone — no online acceptance); the office records it.
  must(await owner.patch(`/api/jobs/${jobId}/quote`, { businessId: B, status: "accepted" }), "accept quote");
  must(await owner.patch(`/api/jobs/${jobId}`, { businessId: B, status: "complete" }), "complete job");
  const { invoice } = must(await owner.post(`/api/jobs/${jobId}/invoice`, { businessId: B }), "create invoice");
  expect(invoice.priceMode).toBe("project");
  must(await owner.post(`/api/jobs/${jobId}/invoice/send`, { businessId: B, to: email }), "send invoice");
  const invMail = (await outbox({ to: email })).find((m) => /invoice/i.test(m.subject))!;
  expect(invMail, "invoice emailed").toBeTruthy();
  expect(invMail.html).toContain("Project price");
  expect(invMail.html).not.toContain(`Secret labor line ${t}`);
  expect(invMail.html).not.toContain(`Secret membrane ${t}`);
  expect(invMail.text ?? "").not.toMatch(/Secret/);
});

test("the issues (findings) picker fits the screen and its list scrolls inside it", async ({ as }, testInfo) => {
  const owner = await api("owner");
  const { job } = must(await owner.post("/api/jobs", { businessId: B, title: `Picker fit ${tag()}`, address: "1 Fit St, Miami, FL", clientName: "Fit Client", clientPhone: phone(), serviceType: "Inspection" }), "create job");
  const page = await as("owner");
  await page.goto(`/company/jobs/${job.jobId}?tab=findings`);
  await settle(page);
  await page.getByRole("button", { name: /Add from Library/ }).first().click();
  const sheet = page.locator(".sheet");
  await expect(sheet).toBeVisible();
  await settle(page, 400);
  const box = (await sheet.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x, "sheet left edge on screen").toBeGreaterThanOrEqual(0);
  expect(box.y, "sheet top on screen").toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, "sheet right edge on screen").toBeLessThanOrEqual(vp.width + 1);
  expect(box.y + box.height, "sheet bottom on screen").toBeLessThanOrEqual(vp.height + 1);
  const sideways = await sheet.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(sideways, "no sideways scroll inside the picker").toBe(false);
  await shot(page, "findings-picker", testInfo);
});
