# BOOKING-TEST-SCRIPT.md — the calls that prove booking works

For the owner (no technical steps). Every call below goes to the live demo line **+1 (689) 204-2643** after you have
**relaunched Demo Studio (Roofing)** — the relaunch writes the real hours (Mon–Fri 8:00–5:00, Saturday and Sunday
Closed) and re-seeds appointments at business-hour times. If a call fails, stop and send the transcript; do not try to
fix anything yourself.

Each row has: **what to say**, **what the agent must answer**, **what to check in the app afterwards**, and a pass/fail
box. Rows S7 and S9–S14 depend on a fixed clock or on typing raw hours and are covered by the automated tests only
(`src/lib/scheduling/__tests__/booking-scenarios.test.ts`), not by a phone call.

> The same six conversation tests run against the live agent automatically (ElevenLabs **Tests**):
> `test_2701m3jvc0htecdvh181ha74b2tv` (Carla replay) · `test_2001m3jttnf6ef48wqqmkt707q09` (time taken) ·
> `test_6301m3jvbznpe8t9r2x6gw392gpr` (conflict at booking) · `test_7601m3jvmemdfsarcfbe658ffy9a` (exact time booked) ·
> `test_5701m3jttq3ger8s3gs99pejjmhv` (weekend → Monday) · `test_1801m3jvmfdrecwrew492thc9553` (after-hours "tomorrow").
> They must all pass before this script is run.

---

## S1 — Book a weekday at 8:00 AM (the exact call that failed on 2026-09-27)

- **Say:** “Hi, I'd like to book a roof inspection for Monday morning at 8.”
- **The agent must answer:** confirm the real weekday and time — “Monday … at 8:00 AM” — and say the office will
  confirm. It must **not** say the time is taken unless it really is, and must **never** offer a time between 9 PM and
  7 AM.
- **Check in the app:** open **Pipeline → Appointments**. The request is there with your name, service “Roof
  inspection” and Monday 8:00 AM. Open the booking; Confirm it, and the customer confirmation email is sent.
- **Also check:** open **Calendar**, go to that week, the booking sits at **8:00 AM**.

`- [ ] PASS    - [ ] FAIL`

## S2 — A specific morning time is open

- **Say:** “Can I get an inspection Monday at 10 AM?”
- **The agent must answer:** that **10:00 AM Monday is open** and offer that exact time first — it must not read out
  midnight, or times it did not check.
- **Check in the app:** the Pipeline request shows Monday 10:00 AM (Pipeline → Appointments), and it sits at 10:00 AM
  on the Calendar.

`- [ ] PASS    - [ ] FAIL`

## S3 — A busy time offers the closest openings (no guessing)

- **Setup:** a weekday 8:00 AM slot must already be full (book it once; the demo business has one crew).
- **Say:** “Book me Monday at 8 AM.”
- **The agent must answer:** “Sorry, 8:00 AM Monday was just taken. The closest openings are 8:30 AM, 9:00 AM or
  9:30 AM. Which works best for you?” — it must name real, nearby times. It must **not** say “you're booked”.
- **Check in the app:** no second booking was created at 8:00 AM; the first one is unchanged.

`- [ ] PASS    - [ ] FAIL`

## S4 — After hours / no preferred time

- **When:** call outside business hours (after 5 PM, before 8 AM, or on the weekend).
- **Say:** “What's your next availability?” (no day or time).
- **The agent must answer:** real **daytime** openings on the next business day — **never a time between 9 PM and
  7 AM**, never “we're closed” as the whole answer. If you then book one of those times, it is reserved and the agent
  says a team member will confirm it first thing.
- **Check in the app:** the booking appears in Pipeline → Needs confirmation, flagged for morning confirmation.

`- [ ] PASS    - [ ] FAIL`

## S5 — Saturday is closed

- **Say:** “Do you have anything Saturday at 10 AM?”
- **The agent must answer:** “We're closed Saturdays,” then offer the next Monday's openings.
- **Check in the app:** no Saturday appointment was created; the next-Monday request appears in the Pipeline.

`- [ ] PASS    - [ ] FAIL`

## S6 — A time after closing

- **Say:** “Can you come at 6 PM on Monday?”
- **The agent must answer:** that 6:00 PM is outside business hours, and offer **Monday 4:00 PM** then **Tuesday
  8:00 AM** (the closest real times).
- **Check in the app:** a booking made from the offer lands at one of those times, not 6 PM.

`- [ ] PASS    - [ ] FAIL`

## S8 — A time that already passed today

- **When:** call in the late afternoon.
- **Say:** “Can I do today at 9 AM?”
- **The agent must answer:** that 9:00 AM has already passed, and offer later times instead — it must never offer a
  time in the past.
- **Check in the app:** any booking created is at a future time only.

`- [ ] PASS    - [ ] FAIL`

---

## Covered by automated tests only (do not call these)

| Row | Why it is offline-only |
|---|---|
| **S7** | A 24/7 tenant and a 2:00 AM request need the clock set to a specific hour; the offline suite controls time. |
| **S9** | Hours typed as free text (“8am-5pm”, “Mon-Fri 8-5”) or missing; a phone call cannot type raw hours into the database. |
| **S10** | Daylight-saving correctness (booking across 1 Nov) needs a fixed calendar date. |
| **S11–S13** | Multi-crew capacity and one-crew job overlap need exact seeded calendars. |
| **S14** | Every Demo Studio launch hour 0–23 must leave morning slots; this runs as a loop over the real seed, not one call. |

These run in CI on every commit (`src/lib/scheduling/__tests__/booking-scenarios.test.ts`) and through the real webhooks
locally (`npm run e2e:booking`, plus `e2e/booking.spec.ts`).

## If a call fails

Write the time, what you said, what the agent answered, and open the call in **Calls** (or send the ElevenLabs
transcript). A failed S-row is a booking-engine bug; the fix starts from that transcript, never from guessing.
