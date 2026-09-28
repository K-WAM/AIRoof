// Booking reliability scenarios (G3 / plan §4 rows S1–S6, S8) against the REAL running harness.
//
// The ElevenLabs tool webhooks are driven exactly the way scripts/e2e/scenarios/call-to-cash.cjs does, so a booking
// regression fails here (and in `npm run e2e:test`) instead of on a live call. Every assertion is on the wording the
// agent would actually speak. No production code is touched.
//
// The harness clock is real, so the fixed Sunday-16:59 clock of the offline suite (src/lib/scheduling/__tests__/
// booking-scenarios.test.ts) cannot be reproduced here: rows use the next real business days and assert the invariants
// that must hold at any time of day (no overnight slot, no past slot, no "No openings", conflicts list alternatives).
// Dates stay inside the engine's 14-day availability scan so checks see the bookings they should.
//
// Prerequisite: `npm run e2e:up` (the smoke harness from THIS checkout).  Run:  npm run e2e:booking  [--json]
const { api, assertHarnessUp, must, simulateCall, sleep } = require("../lib.cjs");
const { APP_URL } = require("../config.cjs");

const B = "e2e-roofing";
const TZ = "America/New_York";

// The scenario needs deterministic hours/capacity, so it sets them through the app's own API and restores the seed
// hours afterwards (call-to-cash.spec.ts books an arbitrary future day and must not see business-day-only hours).
const SCENARIO_HOURS = {
  Monday: "08:00 - 17:00",
  Tuesday: "08:00 - 17:00",
  Wednesday: "08:00 - 17:00",
  Thursday: "08:00 - 17:00",
  Friday: "08:00 - 17:00",
  Saturday: "Closed",
  Sunday: "Closed",
};
const SEED_HOURS = Object.fromEntries(
  ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => [day, "00:00 - 23:59"]),
);

// A time the plan says must never be offered by default (21:00–07:00 local).
const OVERNIGHT = /\b(?:(?:9|10|11):\d{2}[\s\u202f]*PM|(?:12|1|2|3|4|5|6):\d{2}[\s\u202f]*AM)\b/;
const TIMES = /\d{1,2}:\d{2}\s?(?:AM|PM)/g;

// ── calendar helpers (a "date" here is a YYYY-MM-DD business-local calendar day) ──────────────────────────────
const todayStr = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** Weekday name of a calendar date, independent of the machine's timezone. */
const weekdayOf = (dateStr) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" }).format(new Date(`${dateStr}T12:00:00Z`));

/** The first `dayName` on or after `weeksAhead` weeks from today's business-local date. */
function nextWeekday(dayName, weeksAhead) {
  let date = addDays(todayStr(), weeksAhead * 7 + 1);
  for (let i = 0; i < 21; i++) {
    if (weekdayOf(date) === dayName) return date;
    date = addDays(date, 1);
  }
  throw new Error(`no ${dayName} found within 3 weeks of +${weeksAhead}w`);
}

const phoneFor = () => `+1555${String(Math.floor(1_000_000 + Math.random() * 8_999_999))}`;

// ── HTTP helpers (api() has no PUT; the settings route is PUT) ───────────────────────────────────────────────
async function putSettings(owner, body) {
  const res = await fetch(`${APP_URL}/api/company/settings`, {
    method: "PUT",
    headers: { cookie: `__session=${owner.token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`settings PUT failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Every response an agent might read for one tool call: the model-facing `result` plus the spoken `sayToCaller`. */
function spoken(entry) {
  const body = entry?.result ?? {};
  return `${body.result ?? body.error ?? ""} ${body.sayToCaller ?? ""}`.trim();
}

async function callTools(tools, { from, summary } = {}) {
  const call = await simulateCall({
    tenant: "roofing",
    from: from ?? phoneFor(),
    summary: summary ?? "Booking reliability scenario.",
    transcript: [
      ["agent", "Thanks for calling E2E Roofing Co, how can I help?"],
      ["user", "I'd like to book an appointment."],
    ],
    tools,
  });
  return call.toolResults;
}

function expectMatch(haystack, pattern, what) {
  if (!pattern.test(String(haystack ?? ""))) {
    throw new Error(`${what}: ${JSON.stringify(haystack).slice(0, 240)} did not match ${pattern}`);
  }
}

async function expectNoOvernight(results) {
  for (const entry of results) {
    const text = spoken(entry);
    if (OVERNIGHT.test(text)) throw new Error(`an overnight time (21:00–07:00) was offered: ${text.slice(0, 200)}`);
  }
}

/** Find a business day where `time` is open, scanning up to `maxWeeks` weeks from `startWeeks`. */
async function findOpen({ dayName, time, startWeeks = 0, maxWeeks = 4 }) {
  for (let weeks = startWeeks; weeks < startWeeks + maxWeeks; weeks++) {
    const day = nextWeekday(dayName, weeks);
    const results = await callTools([["checkAvailability", { preferredDate: day, preferredTime: time }]]);
    const text = spoken(results[0]);
    if (new RegExp(`^${time.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} ${dayName} is open\\.`).test(text)) return { day, text };
  }
  throw new Error(`no open ${dayName} ${time} within ${maxWeeks} weeks from +${startWeeks}w`);
}

async function setSingleCrew(owner) {
  const existing = must(await owner.get(`/api/company/crews?businessId=${B}`), "list crews").crews ?? [];
  for (const crew of existing) {
    must(await owner.del(`/api/company/crews?businessId=${B}&crewId=${encodeURIComponent(crew.crewId)}`), "delete crew");
  }
  must(await owner.post("/api/company/crews", { businessId: B, name: "Booking Scenario Crew" }), "create crew");
}

/** Cancel every request this run created (matched by the run tag in the caller name) so reruns start clean. */
async function cancelCreated(owner, tag) {
  const appointments = must(await owner.get(`/api/businesses/${B}/appointments`), "list appointments").appointments ?? [];
  const mine = appointments.filter((a) => typeof a.callerName === "string" && a.callerName.includes(tag));
  for (const appointment of mine) {
    const appointmentId = appointment.appointmentId ?? appointment.id;
    if (!appointmentId) continue;
    await owner.patch(`/api/appointments/${appointmentId}`, { businessId: B, declineReason: "Other" }).catch(() => undefined);
  }
  return mine.length;
}

// ── the scenarios ────────────────────────────────────────────────────────────────────────────────────────────
async function runBookingScenarios({ log = console.log, tag = Date.now().toString(36).slice(-5), keepBookings = false } = {}) {
  await assertHarnessUp();
  const owner = await api("owner");
  const rows = [];
  const ctx = { businessId: B, tag };

  const attempt = async (id, expected, fn) => {
    try {
      const detail = await fn();
      rows.push({ id, ok: true, expected, actual: detail ?? "" });
      log(`  ✓ ${id} — ${detail ?? "pass"}`);
    } catch (err) {
      rows.push({ id, ok: false, expected, actual: String(err?.message ?? err) });
      log(`  ✗ ${id} — ${err?.message ?? err}`);
    }
  };

  try {
    await putSettings(owner, { businessId: B, timezone: TZ, businessHours: SCENARIO_HOURS });
    await setSingleCrew(owner);

    await attempt("S1 Carla replay: book Mon 8:00", "Monday 8:00 AM is booked; Tuesday/Wednesday offered", async () => {
      const { day: monday } = await findOpen({ dayName: "Monday", time: "8:00 AM" });
      const tuesday = addDays(monday, 1);
      const wednesday = addDays(monday, 2);
      const callerName = `S1 Carla ${tag}`;
      const results = await callTools([
        ["bookAppointment", { name: callerName, serviceType: "Roof inspection", startTime: `${monday}T08:00` }],
        ["checkAvailability", { preferredDate: monday, preferredTime: "10:00 AM" }],
        ["bookAppointment", { name: `S1 Carla Tue ${tag}`, serviceType: "Roof inspection", startTime: `${tuesday}T08:00` }],
        ["checkAvailability", { preferredDate: wednesday, preferredTime: "8:00 AM" }],
      ]);
      const booked = results[0].result ?? {};
      if (booked.error || /NOT BOOKED|taken|unavailable/i.test(JSON.stringify(booked))) {
        throw new Error(`Monday 8:00 was not booked: ${JSON.stringify(booked).slice(0, 200)}`);
      }
      expectMatch(booked.sayToCaller, /You're booked for .* at 8:00 AM\./, "booked wording");
      const second = results[2].result ?? {};
      if (second.error || /NOT BOOKED|taken|unavailable/i.test(JSON.stringify(second))) {
        throw new Error(`Tuesday 8:00 was not booked: ${JSON.stringify(second).slice(0, 200)}`);
      }
      await expectNoOvernight(results);
      ctx.s1 = { callerName, monday };
      return `booked ${weekdayOf(monday)} ${monday} at 8:00 AM`;
    });

    await attempt("S2 Mon 10:00 preference is open and listed first", "10:00 AM <day> is open; Closest openings starts 10:00 AM", async () => {
      const { day } = await findOpen({ dayName: "Monday", time: "10:00 AM" });
      const results = await callTools([["checkAvailability", { preferredDate: day, preferredTime: "10:00" }]]);
      const text = spoken(results[0]);
      expectMatch(text, new RegExp(`^10:00 AM ${weekdayOf(day)} is open\\.`), "preferred open");
      expectMatch(text, /Closest openings: Monday 10:00 AM/, "preferred listed first");
      await expectNoOvernight(results);
      return text.slice(0, 140);
    });

    await attempt("S3 at capacity, Monday 8:00 conflicts with 3 same-day alternatives", "NOT BOOKED: 8:00 AM Monday was just taken + 3 openings", async () => {
      const { day } = await findOpen({ dayName: "Monday", time: "8:00 AM" });
      const first = await callTools([["bookAppointment", { name: `S3 Fill ${tag}`, serviceType: "Roof inspection", startTime: `${day}T08:00` }]]);
      const filled = first[0].result ?? {};
      if (filled.error || /NOT BOOKED|taken|unavailable/i.test(JSON.stringify(filled))) {
        throw new Error(`could not fill capacity at ${day} 8:00: ${JSON.stringify(filled).slice(0, 200)}`);
      }
      const conflict = await callTools([["bookAppointment", { name: `S3 Conflict ${tag}`, serviceType: "Roof inspection", startTime: `${day}T08:00` }]]);
      const text = spoken(conflict[0]);
      expectMatch(text, /^NOT BOOKED: 8:00 AM Monday was just taken\./, "conflict wording");
      expectMatch(text, /Offer them the closest openings:/, "alternatives offered");
      const distinct = [...new Set(text.match(TIMES) ?? [])];
      if (distinct.length < 4) throw new Error(`expected the requested time plus 3 distinct alternatives, got ${distinct.join(", ")}`);
      await expectNoOvernight(conflict);
      return `${distinct.join(", ")}`;
    });

    await attempt("S4 no-date check is all daytime; a booking is flagged for morning confirmation", "Available openings, no overnight, no 'No openings', confirm-first-thing", async () => {
      const results = await callTools([["checkAvailability", {}]]);
      const text = spoken(results[0]);
      if (/No openings|closed/i.test(text)) throw new Error(`a no-date check with hours set said: ${text}`);
      expectMatch(text, /^Available openings:/, "daytime openings");
      await expectNoOvernight(results);

      const { day } = await findOpen({ dayName: "Monday", time: "8:00 AM", maxWeeks: 6 });
      const booked = await callTools([["bookAppointment", { name: `S4 Confirm ${tag}`, serviceType: "Roof inspection", startTime: `${day}T08:00` }]]);
      const body = booked[0].result ?? {};
      expectMatch(body.sayToCaller, /You're booked for .* at 8:00 AM/, "booked");
      expectMatch(body.sayToCaller, /office will confirm first thing/i, "morning confirmation flag");
      return text.slice(0, 140);
    });

    await attempt("S5 Saturday is closed with Monday openings", "We're closed Saturdays + Closest openings: Monday", async () => {
      const saturday = nextWeekday("Saturday", 0);
      const results = await callTools([["checkAvailability", { preferredDate: saturday, preferredTime: "10:00 AM" }]]);
      const text = spoken(results[0]);
      expectMatch(text, /^We're closed Saturdays\./, "closed Saturday");
      expectMatch(text, /Closest openings: Monday/, "Monday offered next");
      await expectNoOvernight(results);
      return text.slice(0, 140);
    });

    await attempt("S6 Monday 6 PM is outside hours; closest are Monday 4 PM then Tuesday 8 AM", "outside business hours + Mon 4:00 PM + Tue 8:00 AM", async () => {
      // Pick a week where both 4 PM Monday and 8 AM Tuesday are free, so the "closest" pair is the plan's.
      let day;
      for (let weeks = 1; weeks <= 4 && !day; weeks++) {
        const monday = nextWeekday("Monday", weeks);
        const mondayText = spoken((await callTools([["checkAvailability", { preferredDate: monday, preferredTime: "4:00 PM" }]]))[0]);
        const tuesdayText = spoken((await callTools([["checkAvailability", { preferredDate: addDays(monday, 1), preferredTime: "8:00 AM" }]]))[0]);
        if (/^4:00 PM Monday is open\./.test(mondayText) && /^8:00 AM Tuesday is open\./.test(tuesdayText)) day = monday;
      }
      if (!day) throw new Error("no week had both a free Monday 4:00 PM and Tuesday 8:00 AM");
      const results = await callTools([["checkAvailability", { preferredDate: day, preferredTime: "18:00" }]]);
      const text = spoken(results[0]);
      expectMatch(text, /^6:00 PM Monday is outside business hours\./, "outside hours");
      expectMatch(text, /Monday 4:00 PM/, "Monday 4 PM offered");
      expectMatch(text, /Tuesday 8:00 AM/, "Tuesday 8 AM offered");
      return text.slice(0, 220);
    });

    await attempt("S8 a requested time that already passed is never offered as an opening", "has already passed", async () => {
      const yesterday = addDays(todayStr(), -1);
      const results = await callTools([["checkAvailability", { preferredDate: yesterday, preferredTime: "9:00 AM" }]]);
      const text = spoken(results[0]);
      expectMatch(text, /has already passed/, "past wording");
      if (text.includes(`Closest openings: ${weekdayOf(yesterday)} 9:00 AM`)) {
        throw new Error("the past time was offered as an opening");
      }
      await expectNoOvernight(results);
      return text.slice(0, 160);
    });
  } finally {
    await putSettings(owner, { businessId: B, businessHours: SEED_HOURS }).catch((err) => {
      log(`  ! could not restore seed hours: ${err?.message ?? err}`);
    });
  }

  ctx.cancel = () => cancelCreated(owner, tag);
  if (!keepBookings) {
    await ctx.cancel().catch(() => undefined);
  }
  await sleep(200);
  return { ok: rows.every((row) => row.ok), rows, ctx };
}

if (require.main === module) {
  console.log("Booking reliability scenarios (real app, real ElevenLabs webhooks, emulated Firebase)\n");
  runBookingScenarios()
    .then((result) => {
      const failed = result.rows.filter((row) => !row.ok);
      console.log(`\n${result.rows.length - failed.length}/${result.rows.length} scenarios passed.`);
      if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
      process.exit(failed.length ? 1 : 0);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = { runBookingScenarios, SCENARIO_HOURS, SEED_HOURS };
