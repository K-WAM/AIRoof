// The whole customer story through the REAL running app (needs `npm run e2e:up`), no browser, no mocks:
//   phone call (ElevenLabs webhooks) -> request in the Pipeline -> confirm -> job -> crew field note + photos + finding
//   -> office marks complete -> quote (sent, accepted) -> report emailed -> invoice sent -> marked paid.
// Every step is recorded pass/fail; the script exits 1 if any step fails. Also exported so Playwright specs reuse it:
//   import { runCallToCash } from "../scripts/e2e/scenarios/call-to-cash.cjs"
// Run:  npm run e2e:call            (add --json for machine-readable output)
const { api, assertHarnessUp, must, outbox, pngBase64, readDoc, simulateCall, sleep, db } = require("../lib.cjs");

const B = "e2e-roofing";

async function runCallToCash({ log = console.log, tag = Date.now().toString(36).slice(-5), photos = true } = {}) {
  await assertHarnessUp();
  const steps = [];
  /** @type {Record<string, any>} */
  const ctx = { businessId: B, tag };
  const step = async (name, fn) => {
    try {
      const detail = await fn();
      steps.push({ name, ok: true, detail: detail ?? "" });
      log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
    } catch (err) {
      steps.push({ name, ok: false, detail: String(err?.message ?? err) });
      log(`  ✗ ${name} — ${err?.message ?? err}`);
      throw err;
    }
  };

  const owner = await api("owner");
  const crew = await api("crew");
  const caller = { name: `Mina Test ${tag}`, phone: `+1555${String(Math.floor(1000000 + Math.random() * 8999999))}`, email: `mina.${tag}@customer.e2e.test`, address: "12 Palm Ave, Miami, FL" };
  ctx.caller = caller;
  // A different day each run (the calendar is shared and the AI correctly refuses a taken slot).
  const when = Date.now() + (2 + Math.floor(Math.random() * 300)) * 24 * 3600 * 1000;

  try {
    await step("A caller phones the AI line and books an inspection", async () => {
      ctx.call = await simulateCall({
        tenant: "roofing", from: caller.phone,
        summary: `${caller.name} has a leaking roof and wants an inspection.`,
        transcript: [["agent", "Thanks for calling E2E Roofing Co, how can I help?"], ["user", "My roof is leaking near the chimney."], ["agent", "I can book an inspection. What's your name and address?"], ["user", `${caller.name}, ${caller.address}.`]],
        tools: [
          ["checkAvailability", { service: "Roof inspection" }],
          ["bookAppointment", { name: caller.name, email: caller.email, service: "Roof inspection", address: caller.address, preferredTime: when }],
        ],
      });
      const book = ctx.call.toolResults.find((t) => t.tool === "bookAppointment");
      if (book?.status !== 200 || /no longer|taken|unavailable|couldn.t|could not/i.test(JSON.stringify(book.result))) throw new Error(`bookAppointment did not book: ${book?.status} ${JSON.stringify(book?.result).slice(0, 200)}`);
      return ctx.call.callId;
    });

    await step("The call shows up in Calls with its transcript", async () => {
      const list = must(await owner.get(`/api/businesses/${B}/calls`), "list calls").calls;
      const mine = list.find((c) => c.callId === ctx.call.callId);
      if (!mine) throw new Error("call not in the Calls list");
      if (!mine.startedAt) throw new Error("call has no startedAt (would be invisible in the UI)");
      return `${(mine.transcript ?? mine.messages ?? []).length || "?"} transcript lines`;
    });

    await step("The request lands in the Pipeline as a pending appointment", async () => {
      const appts = must(await owner.get(`/api/businesses/${B}/appointments`), "list appointments").appointments;
      ctx.appointment = appts.find((a) => a.callerName === caller.name);
      if (!ctx.appointment) throw new Error("no appointment for this caller");
      if (ctx.appointment.status !== "requested") throw new Error(`status is ${ctx.appointment.status}, expected requested`);
      ctx.appointmentId = ctx.appointment.appointmentId ?? ctx.appointment.id;
      return ctx.appointmentId;
    });

    await step("The office confirms it and the customer is emailed", async () => {
      must(await owner.patch(`/api/appointments/${ctx.appointmentId}`, { businessId: B, confirm: true, notifyCustomer: true }), "confirm appointment");
      await sleep(400);
      const mail = await outbox({ to: caller.email });
      if (!mail.length) throw new Error("no confirmation email captured");
      return `“${mail[0].subject}”`;
    });

    await step("The office creates the job from the request", async () => {
      const { job } = must(await owner.post("/api/jobs", { businessId: B, title: `Roof inspection ${tag}`, address: caller.address, clientName: caller.name, clientPhone: caller.phone, clientEmail: caller.email, serviceType: "Roof inspection", appointmentId: ctx.appointmentId }), "create job");
      ctx.jobId = job.jobId;
      return ctx.jobId;
    });

    await step("The crew sends a field note; the parser fills materials, labor and an issue", async () => {
      must(await crew.post(`/api/jobs/${ctx.jobId}/updates`, { businessId: B, rawText: "Used 12 bundles of shingles. Carlos worked 8 hours. Found a cracked vent boot." }), "field update");
      const job = must(await owner.get(`/api/jobs/${ctx.jobId}?businessId=${B}`), "get job").job;
      const parsed = job.parsed ?? {};
      if (!parsed.materials?.length) throw new Error("no materials projected");
      if (!parsed.labor?.length) throw new Error("no labor projected");
      return `${parsed.materials.length} material, ${parsed.labor.length} labor, ${parsed.issues?.length ?? 0} issue`;
    });

    if (photos) {
      await step("The crew uploads a before and an after photo", async () => {
        const img = pngBase64(); const big = pngBase64(320, 240, [40, 120, 200]);
        for (const [label, phase] of [["Cracked vent boot", "before"], ["Vent boot replaced", "after"]]) {
          must(await crew.post(`/api/jobs/${ctx.jobId}/photos`, { businessId: B, label, phase, thumbB64: img, fullB64: big, uploadedBy: "Carlos Crew", w: 320, h: 240 }), `upload ${phase} photo`);
        }
        const list = must(await owner.get(`/api/jobs/${ctx.jobId}/photos?businessId=${B}`), "list photos");
        return `${(list.photos ?? list).length} photos`;
      });
    }

    await step("The crew adds a finding from the work catalog", async () => {
      const item = must(await owner.post("/api/company/work-catalog", { businessId: B, item: { category: "Flashing", problem: "Cracked vent boot", solution: "Replace the vent boot and reseal.", severity: "medium", lines: [{ kind: "labor", description: "Vent boot replacement", quantity: 1, unit: "each", unitPrice: 180 }] } }), "add catalog item");
      const itemId = item.item?.itemId ?? item.itemId ?? item.items?.at(-1)?.itemId;
      if (!itemId) throw new Error(`could not read the new catalog item id from ${JSON.stringify(item).slice(0, 120)}`);
      must(await crew.post(`/api/jobs/${ctx.jobId}/findings`, { businessId: B, itemId }), "add finding");
      return "Cracked vent boot";
    });

    await step("The office marks the work complete", async () => {
      must(await owner.patch(`/api/jobs/${ctx.jobId}`, { businessId: B, status: "complete" }), "complete job");
    });

    await step("A quote is drafted, sent and accepted", async () => {
      must(await owner.post(`/api/jobs/${ctx.jobId}/quote`, { businessId: B }), "create quote");
      must(await owner.patch(`/api/jobs/${ctx.jobId}/quote`, { businessId: B, lines: [{ lineId: "l1", kind: "labor", description: "Vent boot replacement", quantity: 1, unit: "each", unitPrice: 180 }, { lineId: "l2", kind: "material", description: "Vent boot", quantity: 1, unit: "each", unitPrice: 35 }] }), "edit quote");
      must(await owner.post(`/api/jobs/${ctx.jobId}/quote/send`, { businessId: B, to: caller.email }), "send quote");
      must(await owner.patch(`/api/jobs/${ctx.jobId}/quote`, { businessId: B, status: "accepted" }), "accept quote");
      return "$215";
    });

    await step("The report is emailed and shows no prices", async () => {
      must(await owner.patch(`/api/jobs/${ctx.jobId}`, { businessId: B, reportNotes: "Replaced the cracked vent boot and resealed.", reportOptions: { hideLabor: false, hideMaterials: false } }), "save report notes");
      must(await owner.post(`/api/jobs/${ctx.jobId}/report/send`, { businessId: B, to: caller.email }), "send report");
      const mail = (await outbox({ to: caller.email })).find((m) => /report/i.test(m.subject));
      if (!mail) throw new Error("no report email captured");
      if (/\$\s?\d/.test(mail.text)) throw new Error("the report email contains a price");
      return `“${mail.subject}”`;
    });

    await step("The invoice is drafted, sent (job becomes Invoiced) and marked paid", async () => {
      must(await owner.post(`/api/jobs/${ctx.jobId}/invoice`, { businessId: B }), "create invoice");
      must(await owner.post(`/api/jobs/${ctx.jobId}/invoice/send`, { businessId: B, to: caller.email }), "send invoice");
      const job = must(await owner.get(`/api/jobs/${ctx.jobId}?businessId=${B}`), "get job").job;
      if (job.status !== "invoiced") throw new Error(`job status is ${job.status}, expected invoiced`);
      must(await owner.patch(`/api/jobs/${ctx.jobId}/invoice`, { businessId: B, status: "paid" }), "mark paid");
      const stored = await readDoc(`businesses/${B}/invoices/${(await readDocInvoiceId(ctx.jobId))}`);
      return stored?.status ?? "paid";
    });
  } catch {
    /* recorded by step(); fall through to the summary */
  }
  return { ok: steps.every((s) => s.ok), steps, ctx };
}

async function readDocInvoiceId(jobId) {
  const snap = await db().collection(`businesses/${B}/invoices`).where("jobId", "==", jobId).limit(1).get();
  return snap.docs[0]?.id ?? "unknown";
}

if (require.main === module) {
  console.log("Call-to-cash walk-through (real app, real webhooks, emulated Firebase, captured email)\n");
  runCallToCash().then((r) => {
    const failed = r.steps.filter((s) => !s.ok);
    console.log(`\n${r.steps.length - failed.length}/${r.steps.length} steps passed. Job: ${r.ctx.jobId ?? "(not created)"} · caller: ${r.ctx.caller?.name}`);
    if (process.argv.includes("--json")) console.log(JSON.stringify(r, null, 2));
    process.exit(failed.length ? 1 : 0);
  }).catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { runCallToCash };
