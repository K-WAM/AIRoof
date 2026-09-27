# BOOKING-RELIABILITY-PLAN.md — booking must be flawless (Phase 28, G1–G4)

Written 2026-09-27 by the integrator (Claude) after a real caller's booking failed. Owner direction: **booking must be
flawless; "that can never happen."** This file is the spec. Paste-ready prompts: `docs/WORKER_QUEUE.md` section **G**.

---

## 1. What actually happened (from the real call, not from reading code)

Call `conv_2901m3jamh7yfz6raa84jqg2rxzs`, 2026-09-27 16:59 EDT (a Sunday), caller Carla Snyder, line +1 (689) 204-2643,
tenant `demo-roofing`. Pulled with the ElevenLabs conversation API — tool calls and results verbatim:

| Caller asked | Tool call | Tool result | Agent said |
|---|---|---|---|
| Monday 8:00 AM | `bookAppointment` start `2026-09-28T08:00` | `That requested time was just taken.` | "that time is already taken" |
| Monday 10:00 AM | `checkAvailability` date `2026-09-28` | `Mon 12:00 AM; 12:30 AM; 1:00 AM` | "only midnight, 12:30 or 1 am" |
| Tuesday 8:00 AM | `bookAppointment` start `2026-09-29T08:00` | `That requested time was just taken.` | "also taken" |
| Wednesday 8:00 AM | `checkAvailability` date `2026-09-30` | `Wed 12:00 AM; 12:30 AM; 1:00 AM` | "only midnight…" |

The requested times were parsed correctly (8:00 AM Eastern). So there are **two separate failures**, plus design gaps:

1. **Midnight suggestions.** The demo line's hours were set to `00:00 - 24:00` every day. `buildAvailableSlots()` only
   knows a preferred DATE, never a TIME, and offers the first 3 slots from the day's opening minute — so every day
   offered 12:00 / 12:30 / 1:00 AM.
2. **"Just taken" on 8:00 AM Monday and Tuesday.** Booking treats the WHOLE company as ONE calendar: any appointment
   (even one assigned to a crew) or any scheduled job at that time blocks every new booking. The demo seed places
   appointments at whole-day offsets from the moment Demo Studio was launched (`now + 0.5, 1, 1.5 … days`), so their
   time of day equals the launch time; earlier test bookings also sit on the calendar. Something occupied Mon 8:00 and
   Tue 8:00 — most likely seeded demo bookings. **Not yet confirmed against the live database** (G1 step 0 is a
   read-only check the integrator runs).
3. **Design gaps that made it look terrible:** the tool can't hear "8 AM"; a conflict returns no alternatives, so the
   agent makes the caller guess; hours are free text parsed by three different parsers (a typo silently closes a day);
   local times are converted with today's UTC offset, so a booking across the DST change (Nov 1) lands an hour off.

## 2. Why it "used to work" — the drift

| When (PDT) | Change | Effect |
|---|---|---|
| 09-24 | ElevenLabs line lived on a clean test tenant: normal hours, no demo data | Booking worked (`conv_2901m3atg8…`: checked, booked 8 AM) |
| 09-25 day | The number moved to `demo-roofing` — a tenant full of seeded appointments and jobs | Calendar now crowded |
| 09-25 16:36 | `d1bee4e` (integrator): round-the-clock hours "so the demo never sounds closed" | Suggestions start at midnight |
| 09-25 ~21:00 | Booking "tomorrow 8 AM" still worked (`conv_8301…`) | Old overlap rule still in place |
| 09-26 02:50 | `e9caef0` (E2, Codex, merged by the integrator): "one business-wide overlap rule" | Every appointment and job blocks the whole company |
| 09-27 16:59 | Carla's call | Hit both |

Why nothing caught it: each change passed unit tests **for its own rule in isolation**. No test covered "a seeded demo
tenant + a caller asking for a normal time", and **no real booking call was made after either change**. The 09-27
hotfix (`6fcbe12`, real hours + booking-forward after-hours greeting) repairs failure 1 only, is on local `main`, and is
not deployed.

## 3. Decisions (apply them; do not re-open)

- **Demo hours:** Monday–Friday 08:00–17:00, Saturday and Sunday Closed, America/New_York (owner, 2026-09-27).
- **Every client picks operating hours at setup.** Hours are required, entered with a structured editor (no free text),
  validated on the server, and parsed by ONE shared module. Missing or unparseable hours are an error the owner sees,
  never a silent "no openings".
- **Capacity instead of one calendar.** A time is free when the number of overlapping, non-cancelled appointments +
  scheduled jobs is below the business's capacity. **Capacity = number of crews/resources in Library (minimum 1).**
  A one-crew business behaves exactly like E2 (no booking over a job); a five-crew business can take parallel
  bookings. (If the owner prefers a separate "appointments at the same time" number, that is a one-line change later.)
- **The agent books what the caller asked for when it is free.** `checkAvailability` takes an optional preferred TIME.
  The result says plainly whether that exact time is open; if not, it lists the closest openings (same day first).
- **A conflict never makes the caller guess.** A booking conflict returns the closest openings in the same result.
- **Never offer overnight times** (21:00–07:00 local) unless the caller explicitly asked for that time. Emergencies are
  escalations, not bookings.
- **After hours:** the agent still checks the real calendar and offers real next-business-day times, and books them
  (flagged for morning confirmation, as today).
- **Seeded demo data never blocks the demo:** seeded appointments/jobs sit at realistic business-hour times on business
  days, inside hours, leaving most of each morning free.

## 4. The booking truth table (tests must prove every row)

Fixed clock: Sunday 2026-09-27 16:59 EDT (Carla's call). Tenant: `demo-roofing` after a roofing Demo Studio launch
(its real seed), demo hours above, capacity = seeded crew count.

| # | Scenario | Expected |
|---|---|---|
| S1 | Carla replay: book Mon 08:00 | Booked for Monday 8:00 AM |
| S2 | Check Mon, preferred 10:00 | "10:00 AM Monday is open"; list starts at 10:00 |
| S3 | Mon 08:00 filled to capacity; book Mon 08:00 | Conflict result naming the 3 closest open times that day |
| S4 | Call at Sun 21:00, no date | Next business day daytime slots; after-hours greeting has no "closed"; booking flagged for morning confirmation |
| S5 | Ask Saturday 10:00 | "We're closed Saturdays" + next openings Monday |
| S6 | Ask Monday 18:00 | Outside hours + closest (Mon 16:00, Tue 08:00) |
| S7 | 24/7 tenant, check Mon without a time | No slot between 21:00 and 07:00; with preferred 02:00 → 02:00 allowed |
| S8 | Ask "today 9 AM" at 16:59 | Never offers a past time |
| S9 | Hours typed "8am-5pm"; hours "Mon-Fri 8-5" string; hours missing | First two parse; missing/garbage → explicit "hours not set up" result + lead captured; never "no openings" |
| S10 | On 2026-10-30 book 2026-11-03 09:00 | Stored as 14:00Z (EST), not 13:00Z |
| S11 | 2 crews: two bookings Mon 10:00 | Both succeed; the third conflicts with alternatives |
| S12 | Cancel one of them | Slot bookable again |
| S13 | 1 crew with a job Mon 10:00 | Mon 10:00 not offered and not bookable |
| S14 | Launch Demo Studio at every hour 0–23 | Next 3 business days each have ≥ 6 free slots 08:00–12:00; no seeded item outside hours |

## 5. How we make sure it stays working ("can we guarantee it?")

No software can promise zero bugs. What we can guarantee is that **a broken booking is caught before a caller hits it**:

1. **Booking scenario suite** (G1, offline Vitest, runs in CI on every commit): every row of §4, on the real demo seed.
2. **Smoke-harness booking scenarios** (G3): the same rows through the real webhooks and screens on local emulators.
3. **Live agent tests** (integrator, ElevenLabs "Tests" via the MCP): scripted caller conversations on the real agent —
   Carla replay, a taken time, an after-hours call, a weekend request. Run after every prompt/tool/agent change and
   before every demo day.
4. **Daily production canary** (G4): every morning, check the demo line's (and every live tenant's) availability for
   the next business day; email the owner and flag Admin if a slot is overnight, in the past, outside hours, or if
   hours don't parse.
5. **Booking-change gate** (AGENTS.md): a change touching scheduling, booking, demo seed/hours, tool schemas or the
   agent prompt is not done until 1–3 pass AND one real phone call has been made and its transcript read.

## 6. Tasks

| Task | What | Worker / model | Worktree / branch | Order |
|---|---|---|---|---|
| **G1** | Booking engine: shared hours module, capacity, preferred time, alternatives on conflict, overnight guard, DST fix, demo hours + seed times, tool schema + prompt, scenario suite, setup-script tool update | Codex, **GPT-6 Sol, medium** | `D:/Apps/air-wt-booking` / `task/booking-engine` | **Now** (parallel with T-144 — files disjoint) |
| **G2** | Operating hours at setup: structured editor in Settings, onboarding wizard (required step) and admin client config; server validation; Calendar uses the shared parser | Codex, **GPT-5.5 Terra, medium** | `D:/Apps/air-wt-hours-setup` / `task/hours-setup` | After G1 **and** T-144 merge; before T-145 |
| **G3** | Smoke-harness booking scenarios + the owner's live test-call script | Deepseek, **V4.1 Flash, Thinking: Hard** | `D:/Apps/air-wt-booking-tests` / `task/booking-tests` | After G1 merges |
| **G4** | Daily booking canary (cron + email + Admin flag) | Codex, **GPT-5.5 Terra, medium** | `D:/Apps/air-wt-booking-canary` / `task/booking-canary` | After G1 merges |

Integrator after G1 merges: push the tool-schema change to the live agent (setup script `--update-tools`, needs the
key, owner OK), create and run the ElevenLabs agent tests, relaunch Demo Studio, place the §4 test calls.

## 7. Owner, right now (no deploy needed, 2 minutes)

The live line is still broken until a deploy. Until then:
1. As superadmin open `/company/settings?preview=demo-roofing` → Business hours → Monday–Friday `08:00 - 17:00`
   (type it exactly like that), Saturday and Sunday `Closed` → Save. This stops the midnight suggestions immediately.
2. **Do not relaunch Demo Studio** until the fix is deployed — a relaunch on the current production code puts the
   round-the-clock hours back.
3. The "8 AM just taken" problem can remain until G1 ships (it depends on what is sitting on the live calendar).
