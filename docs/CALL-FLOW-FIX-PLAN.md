# Call-flow fix plan — Phase 31 (integrator, 2026-09-28; revised the same day)

Source: the owner's test calls on 2026-09-28 (inbound `conv_2201m3ma3sg5fn3rm8w721rpfb0d`, 11:28 AM ET, "Carla Esnaida";
outbound confirmation `conv_4701m3matcwsfba9ar1aw8w81z7p`, 11:41 AM ET, reached voicemail) + the owner's 15-point write-up.

## 0. The workflow this phase delivers (owner, 2026-09-28) — and who builds each link

| # | Step | Today | After Phase 31 | Built by |
|---|---|---|---|---|
| 1 | Call comes in, recorded on the app | ✓ call row + transcript + recording after the call ends (a live row *during* the call is D1 Part 2, later) | + the call's summary is copied onto its booking | I1 |
| 2 | Alice books an inspection | books, but escalates first, skips email/access, says "after hours" | books every service call; email, OK-to-text, access notes before booking; notes after booking saved; honest confirmation words | I0 (live path) |
| 3 | It becomes a lead | Pipeline opens on "Leads" (= callback messages) | Pipeline opens on **Booked**; Calls → "Booked · open in Pipeline" | I2 |
| 4 | The inspector is notified | nobody is | the booking is **auto-assigned** to a free inspector and they get an email (+ text once texting is on) with time, address, access/gate code, phone, call summary | I0 assigns · I1 notifies |
| 5 | The inspector manages their time | no inspector concept | "My schedule" on the Field screen: their inspections + **Block time** ("site visit — St. Mary's", "materials pickup"); the phone AI never books them into a block | I2 UI · I1 API · I0 engine |
| 6 | The inspector's calendar updates | — | office drags/reassigns on the Calendar → the inspector is told (moved, reassigned, cancelled); **"Add to my phone calendar"** feed keeps their phone calendar in step | I1 notices · I2 Calendar + feed |
| 7 | The customer is told | AI phone call → voicemail loop | text (once registered) → email → "I'll call them"; the AI call is never the default | I1 backend · I2 buttons |

## 1. What the transcripts show (causes, not guesses)

| # | Symptom | Cause (file) |
|---|---|---|
| A | "Is the leak active?" → escalated → "Anything else?"; booking only because Carla insisted | Prompt `## Emergency Rules` + `## Escalation` (`src/lib/ai/agentPromptBuilder.ts:130-160`) |
| B | Booked 11:28 AM Monday, told "Since we're currently after hours… first thing in the morning" | `pendingConfirmation: true` on EVERY booking (`agentTools.ts:660`, intended — the office reviews all) is read as "after hours" by the dispatcher (`toolDispatcher.ts:82-88`) and the UI (`pipeline/page.tsx:466`, `dashboard/page.tsx:413-421`). **Not a timezone bug.** |
| C | Gate code 1010 — "I've noted it" — never saved | Given after `bookAppointment`; no tool can add to a booking |
| D | Email never asked | Optional once-only offer (`agentPromptBuilder.ts:143`), skipped |
| E | "Who's coming?" / "Who confirms?" → vague + "anything else?" after every answer | No workflow facts, no rule against premature closing |
| F | Name "Es Carla Esnaida"; outbound greeting "Hi Es" | Spanish "es" (= "it's") kept as part of the name |
| G | Voicemail answered, message left, then "Are you still there?" ×9 — sounded like a live call, not a voicemail | Agent's **voicemail detection is off** and it has no working `end_call`; every ~10 s of silence re-prompts the LLM |
| H | No text ever arrived | **No texting code exists** — nothing tried to send one. Twilio credentials are on Vercel, but US carriers also block business texts from an unregistered number (NH-29) |
| I | "24-hour notice" rule vs same-day urgent booking | roofing `bookingRules` (`templates.ts`) — dropped (the open Phase 28 question, option b) |
| J | Phone-AI capacity counts work crews for inspections | `schedulingCapacity()` (`agentTools.ts:154`) |

## 2. Decisions (owner's, or integrator defaults marked ◆)

1. **Escalation off** via a per-business switch `escalationEnabled` (missing = off). Urgent = soonest opening, notes start
   `URGENT: …`; immediate danger → "call 911 first", then keep booking. ◆ A switch, not a deletion — the ElevenLabs agent is
   shared by every tenant; the server refuses `escalateCall` while it's off.
2. **Every AI booking still waits for the office's OK** (jobs are never auto-created). Words change: in hours "the office will
   confirm it by text shortly"; after hours "…when we open <day, time>". `bookedAfterHours` drives the "after hours" label.
3. **Lead = booked appointment.** Pipeline tabs **Booked** / **Callbacks**; nav Dashboard → Calls → Pipeline → Calendar → …
4. **Inspector** = team member with title Inspector (role Staff — they write proposals) on an **inspector row** (a crew with
   `kind: "inspector"`). ◆ **The AI auto-assigns** each booking to the first active inspector free at that time (no booking, no
   block); none free → unassigned and the office drags it on the Calendar. Capacity for phone bookings = active inspectors.
5. **Time blocks** (`businesses/{bid}/timeBlocks`): an inspector (or the office) blocks time on an inspector/crew row. The AI
   never books into a block; the office gets an "inspector is busy then — assign anyway?" check.
6. **The inspector is notified** on: assigned (by AI or office), time moved, reassigned away, cancelled/declined. Email now;
   text to the row's phone once texting is on. ◆ Plus a private **calendar feed** (.ics link) per inspector for their phone.
7. **Follow-up = text** → email → "I'll call them" (tel: link). The AI outbound call is never a default.
8. **Texting ships off** (`SMS_ENABLED` + carrier registration, NH-29) and turns on with one env change when approved.

## 3. Contracts — I1 Step 0 commits the types; the integrator merges it first so I0 and I2 build on it

- `BusinessConfig`: `escalationEnabled?` (missing=false) · `smsEnabled?` (missing=true, still needs env `SMS_ENABLED=true`) · `smsFromNumber?`.
- `Appointment`: `bookedAfterHours?` · `callSummary?` · `textOk?` · `assignedBy?: "ai" | "office"`.
- `Crew.kind?: "crew" | "inspector"` (missing = crew).
- `TimeBlock` (`src/types/schedule.ts`): `{ blockId, businessId, crewId, startTime, endTime, label, createdByUid, createdAt }`
  at `businesses/{bid}/timeBlocks/{blockId}`.
- Bootstrap `business.smsEnabled: boolean` (effective state).
- Helpers I1 builds and I0 calls (exact signatures): `cleanCallerName(raw: string): string` (`src/lib/format/name.ts`) ·
  `nextOpeningLabel(now: number, timeZone: string, hours: unknown): string | null` (`src/lib/scheduling/hours.ts`) ·
  `isSmsEnabled(business): boolean` + `sendSms({ businessId, to, body, messageType, entityId }): Promise<NotificationDeliveryState>`
  (`src/lib/comms/sms.ts`) · `smsTemplates.bookingReceived/bookingConfirmed(...)` · `notifyInspector({ db, businessId,
  appointment, change: "assigned" | "moved" | "reassigned_away" | "cancelled", crewId }): Promise<{ emailed: number; texted: number }>`
  (`src/lib/crews/inspectorNotify.ts`).
- `PATCH /api/appointments/[appointmentId]`: body `notifyChannel?: "sms"|"email"|"none"`, `force?: boolean`; response adds
  `notifiedVia: "sms"|"email"|null`, `staffNotified: number`; 409 `{ code: "inspector_busy", message }` when the chosen inspector
  has a block/booking then and `force` isn't set.
- `GET|POST|DELETE /api/company/time-blocks` (I1). Calendar feed `GET /api/calendar/feed/[token]` + token route (I2).
- Agent tool `addBookingNote({ note })`; `bookAppointment` gains `textOk` (I0).

## 4. Work split

| ID | Who / model | What | Starts |
|---|---|---|---|
| **I1 / T-152** | Deepseek · **V4.1 Flash, Thinking: Hard** | Plumbing, nothing on the live call: contracts, pure helpers, time-block API, texting module (off), inspector notifications, confirm route, post-call summary, bootstrap flag | now |
| **I2 / T-153** | Codex · **GPT-6 Sol, medium** | Every screen: nav, Pipeline Booked/Callbacks, booking details, inspector rows + drag + blocks, My schedule, calendar feed, text/email follow-up buttons | after H3 + I1 Step 0 are on main |
| **I0 / T-154** | Integrator (Claude Opus 5.5) | The live call + booking engine (prompt, tool wording, addBookingNote, auto-assign, blocks respected, capacity), ElevenLabs voicemail config, Twilio/NH-29 check, merges, one full gate run, push, live tools, agent tests | now |

Why this split: live-call paths, booking logic and anything a caller hears stay with the integrator (they broke twice on
2026-09-27; agent tests + a real call are part of the job); Codex does UX best (owner); Deepseek gets well-specified plumbing.
Prompts: `docs/WORKER_QUEUE.md` section **I**.

## 5. Test policy (owner: "comprehensive tests before the push, not on every worktree")

Workers: `npx tsc --noEmit`, eslint on changed files, vitest on the folders they touched; Codex also ONE new Playwright spec
(phone screenshots read). No full vitest, full Playwright, `next build` or `e2e:call` in a worktree. Integrator, once, on the
merged tree before the push: full vitest, `next build`, `e2e:call`, `e2e:booking`, full `e2e:test`; then agent tests + one real call.

## 6. Owner items

- **Start texting registration now** (NH-29 — days to weeks at the carriers): I0 writes the click-steps after checking the number's
  status in Twilio. Nothing else gates texting.
- After the push: relaunch Demo Studio (Roofing), add Dominic as Staff + title Inspector and an inspector row "Dominic", call with an
  urgent leak + a gate code + "who's coming?"; check Dominic's email; confirm from the Pipeline. The integrator reads the transcript.

## 7. Later (not in this phase)

A live call row while the call is still going (D1 Part 2), an inspector workload board (hours out, proposal-heavy customers like
schools), inbound text replies ("C" to confirm), one registered texting number per client, ElevenLabs data-collection fields as a
second safety net, two-way Google Calendar sync.
