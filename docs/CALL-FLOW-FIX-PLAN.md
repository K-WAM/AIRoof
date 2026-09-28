# Call-flow fix plan — Phase 31 (written 2026-09-28 by the integrator)

Source: the owner's test calls on 2026-09-28 (inbound `conv_2201m3ma3sg5fn3rm8w721rpfb0d`, 11:28 AM ET, "Carla Esnaida";
outbound confirmation `conv_4701m3matcwsfba9ar1aw8w81z7p`, 11:41 AM ET, reached voicemail) + the owner's 15-point write-up.
Goal in one line: **every service call ends in a booked visit with everything the inspector needs, the customer is
told exactly what happens next, and follow-up goes by text, not an AI voicemail.**

Target workflow: Inbound call → answer questions → name, address + ZIP, phone, email, OK-to-text, access notes →
book → the booking is the lead (Pipeline) → office assigns an **inspector** on the Calendar → confirm (customer texted,
inspector emailed) → inspection → estimate/proposal.

## 1. What the transcripts show (causes, not guesses)

| # | Symptom | Cause (file) |
|---|---|---|
| A | Alice asked "is the leak active?", escalated, then "Anything else?" — booking only happened because Carla insisted | Prompt `## Emergency Rules` + `## Escalation` (`src/lib/ai/agentPromptBuilder.ts:130-160`) + roofing intake "Active leak" |
| B | Booked 11:28 AM Monday, told "Since we're currently after hours… first thing in the morning" | `bookAppointment` sets `pendingConfirmation: true` on EVERY booking (`agentTools.ts:660`, intended: the office reviews all) and the dispatcher treats that flag as "after hours" (`toolDispatcher.ts:82-88`); the UI does the same (`pipeline/page.tsx:466`, `dashboard/page.tsx:413-421`). **Not a timezone bug.** |
| C | Gate code 1010 + "call me to open the gate" — Alice said "I've noted it", it was never saved | Given after `bookAppointment`; no tool can add to a booking; booking notes = "Active leak in the garage." only |
| D | Email never asked | Prompt makes email a once-only optional offer "right before booking" (`agentPromptBuilder.ts:143`); it was skipped |
| E | "Who's coming?", "Who confirms?" → vague answers + "Is there anything else?" after every answer | No workflow facts in the prompt; no rule against premature closing |
| F | Name saved as "Es Carla Esnaida"; outbound call greeted "Hi Es" | Spanish "Es" (= "It's") taken as part of the name; outbound uses the first token |
| G | Outbound call hit voicemail, left a message, then "Are you still there?" ×9 for 2 minutes | ElevenLabs **voicemail detection is off** and the agent has no `end_call` it uses; ~10 s silence re-prompts the LLM |
| H | Roofing template says "Minimum 24-hour notice" while urgent calls must book same day | `templates.ts` roofing `bookingRules` (the open Phase 28 owner question — this plan takes option (b): drop it) |
| I | Phone AI capacity = all active crews, but phone bookings are inspections | `schedulingCapacity()` (`agentTools.ts:154`) — becomes "active inspectors when the business has any" |

## 2. Decisions (owner's, or integrator defaults marked ◆ — say if you disagree)

1. **Escalation off** — a per-business switch `escalationEnabled` (missing = **off**). Urgent = book the soonest opening,
   notes start `URGENT: …`. Immediate danger (fire, electrical, someone hurt) → "call 911 first", then keep booking.
   ◆ A switch, not a deletion: the ElevenLabs agent is shared by every tenant, and Care Homes/Daycares may need it back.
   The server refuses `escalateCall` while the switch is off, so the model can't escalate even if it tries.
2. **Every AI booking still waits for the office's OK** (`pendingConfirmation` stays true — jobs are never auto-created).
   What changes is the wording: during hours "The office will confirm it by text shortly"; after hours "…first thing
   <next open day>". A new `bookedAfterHours` flag drives the "after hours" label.
3. **Lead = booked appointment.** Pipeline's first tab is **Booked**; createLead messages become **Callbacks**. Nav:
   Dashboard → Calls → Pipeline → Calendar → …
4. **Inspector** = a team member with title Inspector (role Staff — they write proposals) on an **inspector row** (a
   crew with `kind: "inspector"`). Phone bookings are dragged onto inspector rows; work jobs onto crew rows.
5. **Follow-up = text.** Order: text (if texting is on and the caller said OK) → email → "call them yourself" (tel:
   link). The AI phone call is no longer offered by default.
6. **Texting ships switched off** (`SMS_ENABLED` env + carrier registration, NH-29). Twilio credentials are already on
   Vercel; US carriers block business texts from an unregistered number, so the code is built now and turned on when
   registration clears. Until then everything falls back to email.

## 3. Contracts (so the two workers can build in parallel) — **I1 Step 0 adds these types; the integrator merges that commit before I2 starts**

- `BusinessConfig`: `escalationEnabled?: boolean` (missing = false) · `smsEnabled?: boolean` (missing = true; still off
  unless env `SMS_ENABLED === "true"`) · `smsFromNumber?: string` (missing = env `TWILIO_PHONE_NUMBER`).
- `Appointment`: `bookedAfterHours?: boolean` · `callSummary?: string` (ElevenLabs transcript summary, written post-call)
  · `textOk?: boolean` (caller agreed to texts).
- `Crew.kind?: "crew" | "inspector"` (missing = "crew").
- Bootstrap `business.smsEnabled: boolean` — effective state (env on + credentials + tenant not off).
- `PATCH /api/appointments/[appointmentId]` body `notifyChannel?: "sms" | "email" | "none"` (default when
  `notifyCustomer` is true: sms → email → none by availability); response adds `notifiedVia: "sms" | "email" | null`
  and `staffEmailed: number` (inspector row address + members, when the booking has `assignedCrewId`).
- New agent tool `addBookingNote({ note })` — appends to the booking made in THIS call.
- `bookAppointment` gains optional `textOk: boolean`.

## 4. Work split — one Deepseek, one Codex, the integrator in between

| ID | Who | What | Starts | Worktree |
|---|---|---|---|---|
| **I1 / T-152** | Deepseek · V4.1 Flash, Thinking: Hard | Alice books, always: prompt, tools, booking wording, name cleanup, notes after booking, post-call summary, texting backend, confirm route, capacity by inspectors | now | `air-wt-call-flow` / `task/call-flow` |
| **I2 / T-153** | Codex · GPT-6 Sol, medium | Calls → Booked → Inspector UX: nav, Pipeline tabs + labels, booking details on screen, inspector rows + drag, "My inspections", text/email follow-up buttons | after H3 + I1 Step 0 are on main | `air-wt-call-ux` / `task/call-ux` |
| **I0 / T-154** | Integrator | ElevenLabs voicemail/end-call config, NH-29 steps, merge H3; after merges: live tools + agent tests + the full gates + push | now | main |

Prompts: `docs/WORKER_QUEUE.md` section **I**.

## 5. Test policy for this phase (owner, 2026-09-28: "comprehensive tests before the push, not on every worktree")

- Workers: `npx tsc --noEmit`, eslint on changed files, vitest on the folders they touched, and (Codex only) ONE new
  Playwright spec for the screens it changed, phone screenshots read. **No** full vitest, full Playwright, `next build`
  or `e2e:call` in a worktree. Deepseek's booking-engine edits also run `npx vitest run src/lib/scheduling src/lib/tools`
  (seconds — it's the booking-change gate).
- Integrator, once, on the merged tree before the push: full vitest, `next build`, `e2e:call`, `e2e:booking`, full
  `e2e:test`; then the ElevenLabs agent tests and one real call (owner) with the transcript read.

## 6. Owner items

- **NH-29 texting registration** (the only thing between "built" and "texts go out"): steps in `docs/NEEDS-HUMAN-CHECKLIST.md` (I0 writes them).
- After the push: relaunch Demo Studio (Roofing), call the line with an urgent leak + a gate code + a question about who
  comes; then confirm it from the Pipeline. The integrator reads the transcript.

## 7. Later (not in this phase)

Inspector workload board (who is out, for how long — Dominic's "2–3 hours at a job site"), proposal-heavy customers
(schools) tracking, ElevenLabs data-collection fields (email / gate code) as a second safety net, texting per client
number (one registered number per business), inbound text replies ("C" to confirm).
