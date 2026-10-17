# SELF-LED-DEMO-PLAN.md — a demo that sells itself

Written 2026-10-16 (Claude). **STATUS (end of 2026-10-16): v1 built as T-224 at https://crm.luxordev.com/demo.**

What v1 is, and how it deviates from the full plan below (owner: conserve tokens, don't break anything):
- **Real:** the setup (business name required, phone/email optional), the browser call with live captions, the no-code
  phone join (§6.4, `claimArmedTrial` in the initiation webhook), the booking (shown on the stage from the trial's own
  record via `GET /api/demo/roofing-trial?live=1`), the caller's spoken name, "Have us reach you" (instant email to
  connect@luxordev.com + 7-day keep) and the measured call→booking seconds.
- **Illustrated, not generated:** after the booking, the stage (`src/components/demo/DemoStage.tsx`) shows the job,
  calendar drag, field update, inspector's quote, report and invoice as presentation screens. They use the visitor's
  booking details and the starter price list's example prices, labelled as examples. No autopilot server writes, no
  same-origin iframe of the real app: the T-224 iframe spike and §6.1/§6.3 are deferred. "Explore the app" stays in
  this stage with every menu item clickable.
- **Not built yet:** Just-watch audio/TTS (captions only), all-industry trials (roofing only; other `/try/<industry>`
  pages unchanged), the Hub rehearsal button (D5), the funnel stamps and Hub columns (§6.7).
- **Cost guard:** 20 demos/day and 300/month across everyone, 3 per network per day, 2 calls × 3 min per demo. When
  the cap is hit, the page offers Just watch and the read-only sample app.
- **Tests:** `e2e/self-led-demo.spec.ts` covers Just watch end to end, the browser call and the no-code dial-in.
- **Owner checks:** NH-36 in `TODO.md`.

Task numbers start
at T-224 (T-223 is the last used). This replaces the current `/try/roofing` flow (setup modal → Call and Book → See Your
Booking → Add a Voice Update, with a spoken four-digit code for phone callers).

Owner brief (2026-10-16): self-led, amazes the person watching, 3 steps (4 at most), no filler copy, as few clicks as
possible, easy to turn into a call or an enquiry, the app visibly working in front of them (large and easy to read),
personalized with no effort from them, works for every industry. Never ask a visitor to do work for us. No codes.

---

## 1. The demo in one minute (what a prospect does, sees and hears)

| # | They do | They see and hear |
|---|---|---|
| 1 | Type their business name, press **Start my demo**. | Within a second, a big screen shows **their own app**: their business name in the sidebar, their initial as the logo. |
| 2 | Press **Talk to Alice** and say one sentence. A suggested line is on screen. Or dial the number from their phone (no code), or press **Just watch**. | Alice answers: *"Thanks for calling Maria's Roofing…"* Their words show as big live captions. When Alice books, the booking **appears in their app while she's still talking**. |
| 3 | Nothing. They watch. They can pause, go back or skip ahead. | The office runs on autopilot, one screen at a time, each one zoomed and labelled: the booking, the job, a crew voice note filling the job by itself, a priced quote, a clean report, an invoice with **their** letterhead and **their** name as the customer. |
| 4 | Press **Book a call with us**, or **Have us reach you** (one field: phone or email). | A measured line, e.g. *"Call to invoice: 1 min 48 s."* Luxor gets an email with who they are and what they said. |

Every screen they see is the **real app** with **their real data**. The call is real: their words, their booking, their
name. Only "Just watch" is a sample call, and it says so on screen. The only thing they type is their business name.

**Wow moments, in order:** their name everywhere instantly → Alice says their business name → their words appear live →
the booking pops in mid-call → a crew voice note fills the job → quote, report and invoice with their letterhead in under
a minute → a real stopwatch figure.

## 2. What changes from today

| Today (live) | New |
|---|---|
| A modal asks for name, business and email before anything happens | One field: business name. Alice asks the caller's name during the call, like a real receptionist. No email up front. |
| Phone callers say a four-digit code | No code. The call goes to the demo page that is open and waiting (§6.4). |
| After the call: "See Your Booking", then "Add a Voice Update", then the visitor clicks around document tabs | Autopilot walks the real app screen by screen. Recording a note yourself is an optional extra, not a step. |
| Quote and invoice previews say "Pending office pricing" | Real quote and invoice built from the business's example price list, tagged **Example prices** (owner decision D2). |
| Roofing gets the private demo; the other 13 industries get a read-only sample | Every industry gets the same private demo, with screens and wording from its template. |
| "Schedule a Live Demo" sits below everything | **Book a call** and **Have us reach you** on the final screen, plus a small **Get this for {Business}** button visible throughout. |
| Luxor finds out by opening Hub → Demo Enquiries | Luxor is emailed instantly when someone asks to be contacted. Every demo records how far the visitor got. |

## 3. Owner decisions (answered 2026-10-16)

1. **D1 — Business name required; phone or email optional.** One required field. A second, clearly optional field
   ("Phone or email — optional") pre-fills **Have us reach you** and, if it is an email, receives the [Demo] booking
   confirmation. Alice asks the caller's name during the call; that name goes on the booking, job and invoice. "Just
   watch" uses a sample customer name.
2. **D2 — Example prices, labelled.** The quote and invoice use the industry's starter price list, tagged "Example
   prices — you set your own". This replaces the private preview's "Pending office pricing".
3. **D3 — Phone calls without a code go to the newest open demo page** on the "Call" step (§6.4). Accepted risk: two
   people calling within the same minute could land in each other's demo. Calls with no open page get the normal shared
   demo.
4. **D4 — Hot leads: email the owner instantly and keep the demo 7 days.** Confirmation promise: "We'll reach out today"
   during business hours, "tomorrow" after hours.
5. **D5 — Yes to a Hub rehearsal button** (**Open a rehearsal demo**): superadmin only, its own daily allowance, so
   testing never uses up prospects' demos or hits the 3-per-network limit. Not a bypass of any guard.
6. **D6 — Keep the luxordev.com/demo request picker** for **Book a call with us** until a Calendly event is connected
   (NH-34), then set `LIVE_DEMO_BOOKING_URL`.
7. **Wording (owner):** the second button is **Have us reach you**, not "Have us call me", which read as confusing. Its
   one field takes a phone number or an email, whichever the visitor prefers.

## 4. Screens and exact words

Nothing appears on these screens beyond what is listed. `{Business}`, `{Customer}` and `{Agent}` are filled from data:
`{Agent}` is the industry's receptionist name (`demoAgentName`, "Alice" for roofing). Industry wording comes from the
template's `vocab` (job/customer/resource nouns).

### Step 1 — Start (the only screen with a form)
- Voice orb, captions alternating: "Hi, I'm {Agent}. I answer your phone." / "Hola, soy {Agent}. Contesto su teléfono."
- Headline: roofing keeps the owner's line "24-Hour English & Spanish Support for Your Customers"; other industries use
  `VERTICAL_PITCH[...].headline`.
- Field label "Your business name" · second field "Phone or email (optional)" · button **Start my demo** · small line
  "Free · no signup" (optional; cut it if you prefer).
- On press: the stage opens straight away (it loads while they read step 2).

### Step 2 — Call {Business}
- Card: "You're the customer. Try saying:" plus one industry line that gets a booking in one breath, e.g. roofing
  *"Hi, my roof is leaking near the chimney. Can someone come Friday morning?"* (new `VERTICAL_PITCH[...].demoLine`).
- Primary **Talk to {Agent}** → "Connecting…" → in call: a red **LIVE PHONE CALL** tag (turns into **BOOKED**), live
  captions (last two turns, large) and **End call**. Just watch shows the same tag plus "Sample call".
- "Or dial (689) 204-2643". A tap-to-call link on phones. Desktop adds "This screen follows your call".
- Text button **Just watch** → sample call (§6.5).
- After Alice books: a "Booked ✓" chip and **See what happens next**, which ends the browser call and starts step 3.

### Step 3 — the stage (autopilot)
One caption per scene, 5–9 seconds each. A segmented **progress bar** across the top of the stage (Call & booking · Job ·
Calendar · Field updates · Quote · Report · Invoice) fills as the demo moves, so the visitor always knows where they
are and how much is left. The call and the booking it makes are one step. Controls: Pause · Back · Next (icons with
labels for screen readers).

**The whole sidebar is clickable** (owner, 2026-10-16): Dashboard, Calls, Pipeline, Calendar, Jobs, Field, Billing,
Customers, Library, Team, Settings — the app's real menu for that industry. A click pauses the autopilot and shows that
screen with what exists so far; a "Resume demo" button brings the tour back. In the real demo this needs no extra build
because the stage *is* the app; the trial seed only has to fill what a visitor would open: starter Library (common fixes,
prices & rates), a demo crew with two named people on Team, and Settings from the trial config. Customers and Library are
shown this way, not as autopilot steps.

| Scene | Real screen shown | Caption |
|---|---|---|
| Call | Calls, live call row highlighted | "{Agent} is answering for {Business}…" |
| Booking | Pipeline, `?appt=<id>`, new card highlighted | "Booked. It's already in your app." |
| Job | Job page header (customer, address, time) | "One tap turns it into a {job}." + chip "Your office: 1 tap" |
| Calendar | Calendar: the {job} card moves from Unscheduled onto a crew's day, then shows "Confirmed · crew emailed" | "Drag it onto a crew. They get an email." + chip "Your office: 1 drag" |
| Field updates | A teal banner "Foreman's phone → Job details · Instantly · no office trip · no waiting" over the real field screen in a phone frame (foreman recording, words appearing), an arrow ("Straight to the job" → "Saved in N s", the measured save time), and the {job}'s work log, which fills in and stamps "Updated just now · from the field by {foreman}" | "Your foreman updates the {job} from the field. No office, no waiting." |
| Inspector's quote | Job page, quote tab, total highlighted | "Your inspector's quote builds itself from your prices." |
| Report | Job page, report tab | "A clean report for {Customer}. No prices." |
| Invoice | Job page, invoice tab; halfway through, the **"Hide the breakdown from the customer"** switch flips on and the lines collapse to one project price (the existing `priceMode: "project"` / hide-materials feature) | "Invoice ready. Hide the breakdown with one switch." |
| *Appointment industries:* Request | Pipeline card with the captured intake details | "Every detail captured." |
| *Appointment industries:* Calendar | Calendar on that day, booking on the {resource}'s column | "On {resource}'s calendar." |
| *Appointment industries:* Confirmation | The confirmation email {Customer} gets, shown in a mail frame | "{Customer} gets this right away." |

### Step 4 — end card
- "{Business}: answered, booked and invoiced." (appointment industries: "answered, booked and confirmed.")
- "Call → lead → booked appointment: {s} seconds." Measured from the call starting to the booking being saved, never
  estimated. (Owner: a call-to-invoice time means nothing, because real inspections take days.)
- Primary **Book a call with us** · secondary **Have us reach you** → one field "Your phone or email" (pre-filled with
  their number when they dialed from a phone) → **Send** → "Done. We'll reach out {today|tomorrow}." (D4)
- Links: **Explore the app** · **Watch again**. Explore the app closes the card and leaves the visitor in the same stage,
  with every sidebar tab clickable: their private demo with their call, booking and documents, view-only, for the rest
  of the hour. A "Back to summary" button reopens the card. It never drops them into a bare app without the side panel.
- Visible from step 2 onwards: a small **Get this for {Business}** button in the top bar that opens this card.

### Error and limit wording
- Daily limit reached: "Today's demos are all taken. Book a call and we'll show you live." + **Book a call** +
  **Open the sample app** (the existing read-only industry sandbox, which has no budget).
- Microphone blocked: "Your microphone is blocked. Tap Just watch, or dial (689) 204-2643."
- Call dropped: "The call dropped. Tap Talk to {Agent} to try again."
- Expired: "This demo timed out. Start again. It takes 10 seconds."

### Layout
- **Desktop:** a 340 px side panel on the left (step, call control, captions, call-to-action) and the stage filling the
  rest. The stage is the real app in a browser-style frame showing the real address (`crm.luxordev.com/company/pipeline`).
  The app lays itself out at the stage's width, so nothing is scaled down. The highlight dims everything except the new
  item and puts the caption next to it; on desktop the stage also zooms in to about 1.4× on that item. That is the "large
  and easy to identify" part.
- **Phone (375 px):** top bar (business name + **Get this**), the stage showing the app's phone layout in the middle,
  and a bottom sheet with captions and controls. Same highlight, no zoom.
- The voice orb follows Alice's real voice volume during a browser call.

## 5. Industry rules (one source of truth, as CLAUDE.md requires)

- Every `/try/<industry>` page renders the same `SelfLedDemo` component. Nothing per industry is hardcoded in it.
- **Scenes are derived** in one new function, `scenesFor(template)` in `src/lib/demo/scenes.ts`, from `calendarMode`,
  `disabledModules` and `quotes`:
  - **jobs mode with quotes** (roofing, HVAC, general contractors…): Call & booking → Job → Calendar → Field updates →
    Quote → Report → Invoice.
  - **jobs mode with `quotes: false`** (pet care): Call & booking → {Job} → Calendar → Field updates (visit note) →
    Report → Invoice.
  - **appointments mode** (dental, care homes, daycares, childcare, property management): Call → Request → Calendar →
    Confirmation.
- **New per-industry copy** in `VERTICAL_PITCH` (a `Record<VerticalId, …>`, so `tsc` fails until every industry has it):
  `demoLine` (the step 2 sentence) and `sampleCall` (four short lines for "Just watch").
- **Trial business:** `trialConfig(industry)` builds services, FAQs, rules, agent name and greeting from
  `VERTICAL_TEMPLATES[industry]`. It seeds what that industry's scenes need: J-1001, a crew, starter prices and the
  starter work catalog for jobs mode; the demo resources (providers/rooms) from `demoSeed` for appointments mode.
- **Rollout order:** roofing → the other 8 field-service industries (same scenes) → the 5 appointment industries.
  Update `docs/INDUSTRY-READINESS.md` as each group ships.

## 6. How it works (for whoever builds it)

Almost everything already exists: the private trial tenancy and its budgets (`src/lib/demo/roofingTrial.ts`), the
booking engine and ElevenLabs tools, the browser call (`@elevenlabs/client`), the Calls/Pipeline/Job screens with live
refresh and new-row highlighting (`useLiveRefresh`, `useNewRowIds`), the field-note parser, `suggestFindings` + the
starter work catalog, the quote/invoice builders, `DocumentPreview`/letterhead, the cleanup cron and Hub's enquiry list.
The new work is a stage that steers the real app, an autopilot that runs the office steps, phone matching without a
code, the sample call, and lead capture.

### 6.1 The stage: the real app in a same-origin iframe
- `/try/<industry>` stays the top-level page and owns the call, so moving between app screens never interrupts it. The
  stage is an `<iframe src="/company/dashboard?present=1">`. `next.config.ts` already sends
  `frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN`, so no header change is needed.
- **Presentation mode** (`?present=1`, honoured only when `user.isDemoTrial`). The company layout hides
  `PrivateDemoNav`, the feedback button and the setup checklist, keeps live refresh fast (the idle slowdown in
  `useLiveRefresh` assumes someone is clicking), and mounts a small **bridge**. The bridge accepts `postMessage` from
  its own origin only and understands:
  - `navigate` (client-side `router.push`, so no reload flicker)
  - `spotlight` (a `data-demo-spot` selector: dim, ring, caption anchor, scroll into view)
  - `zoom` (returns the element's position so the parent can scale the frame)
- Screens get `data-demo-spot` attributes on the few elements scenes point at: live call row, appointment card, job
  header, work-log entry, materials, quote total, report findings, invoice letterhead/total, calendar event.
- **Private job page:** when a real quote or invoice exists, show the real read-only quote/invoice view instead of
  `PrivateDemoDocuments`, which stays as the fallback for an empty job.
- **Fallback if the spike fails (T-224):** move the call into a root-level provider so it survives navigation, and run
  the stage as the top-level app with the same bridge.

### 6.2 Live state for the page
- `GET /api/demo/trial/live`: trial-cookie only, `noStore`, polled every 2 s from step 2 until the end card. It returns
  a small snapshot of the visitor's own tenant: call status, the appointment (id, time, service, address, caller name),
  what the autopilot has finished, quote/invoice ids and totals, and the elapsed-time stamps.
- Browser-call captions come straight from the SDK's `onMessage`, both speakers (today only the agent's lines are
  used). Phone calls get no live captions; they show tool progress instead ("Checking Friday…" → "Booked ✓").

### 6.3 The office autopilot (server, real records, nothing sent)
- Starts the moment `bookAppointment` succeeds for a trial (via `after()` in the tools route, building on
  `finishTrialBooking`), so the results are ready by the time the visitor hangs up. It is idempotent: one run per trial
  booking, and a second booking does not run it again. Each step stamps `autopilot.<step>At`.
- Jobs mode:
  1. Link the booking to J-1001 (generalize `finishTrialBooking` beyond roofing), link the caller to a Customers record
     (`resolveCustomer`), and assign the demo crew at the booked time through the assign route's own logic. The crew
     email goes nowhere: the demo crew has no address. The Calendar scene animates the card moving onto that crew.
  2. Pick the 1–2 starter catalog items that best match what the caller described: `suggestFindings` on the
     appointment's service and notes, with a fallback to the industry's first item.
  3. Write the crew note from those items (fixed template: problem, fix, quantities from the item's lines). Run it
     through the **real** typed field-note parser, author "Crew (demo)". The parser costs about $0.01 (one gpt-4o read).
  4. Add the items as findings → draft quote from findings → report data → draft invoice from the projection/quote
     lines. Prices come from the trial's starter catalog, tagged as example prices (D2).
- Appointments mode: confirm the appointment (`finishTrialBooking` already does) and render the customer confirmation
  email (`buildCustomerConfirmationEmail`) for the Confirmation scene. It is not sent.
- The page reveals scenes at its own pace (about 6 s each) whatever the server timing.

### 6.4 Phone calls without a code
- **Arming:** while step 2 is on screen, the page calls `POST /api/demo/trial/arm` every 15 s, which sets
  `phoneArmedUntil = now + 45 s`. Tapping "Or dial…" sets a stronger `dialIntentAt` and arms for 120 s, because on a
  phone the page goes to the background while they talk.
- **Binding:** at call start the initiation webhook (`src/app/api/webhooks/elevenlabs/initiation/route.ts`, demo line
  only) looks for armed trials. It prefers a recent `dialIntentAt`, then the newest arm. In one transaction it binds the
  conversation to that trial (same writes `connectPhoneTrial` does today, without a code), records `callerPhone` on the
  enquiry, and answers with the trial's own greeting and phone prompt. Alice's first words are already "Thanks for
  calling {Business}". No match → the normal shared demo greeting, without the code question.
- **Remove** the code UI, `issuePhoneCode`, the code opener in `phonePrompt.ts` and, once binding is proven,
  `connectDemoSession` from the live agent (`setup-elevenlabs-agent.mjs --update-tools`, read the dry-run diff first).
- **Accepted risk (D3):** two open demos and two callers in the same minute can cross. Exposure is bounded by the
  short arm window, one binding per arm, and the two-call cap.

### 6.5 "Just watch"
- `POST /api/demo/trial/sample-call` books a fictional customer through the **real** scheduling engine: the next open
  slot, the industry's sample service, and a sample address. It writes a Calls record marked "Sample call" with the
  scripted transcript and counts against the trial's call budget.
- The page plays the four `sampleCall` lines as captions with audio. Alice's greeting with their business name is
  generated at run time (ElevenLabs text-to-speech, one short line per trial, built only from the validated business
  name). The other lines are pre-generated clips per industry (`scripts/generate-demo-audio.mjs` →
  `public/demo-audio/<industry>/`). An industry with no clips yet plays captions only.
- The autopilot then runs exactly as after a real call.

### 6.6 Shorter real calls
Target: booked within 60–75 s (owner calls ran 84–179 s). This is a prompt change to `buildTrialPrompt`, so it falls
under the Booking-change gate:
- Ask the caller's first name once, because setup no longer has it. The tools route currently forces
  `callerName = trial.name`; use the spoken name when the trial has none.
- City only, no ZIP and no digit-by-digit ZIP readback.
- If no address is given, offer "I'll use a sample address for the demo" and use the industry's sample address.
- One question per turn; book as soon as the time is accepted.
- No email or phone intake (unchanged).

### 6.7 Lead capture and measuring the funnel
- **Have us reach you:** `POST /api/demo/trial/contact` (trial cookie, origin check, rate limit; accepts a valid phone
  number or email) stores it on `demoProspects`, sets `keepUntil = now + 7 days` (D4), and emails connect@luxordev.com through
  `sendWithLedger`. The email, with every value HTML-escaped, includes business, industry, caller name, phone, the
  appointment line, a three-line call summary and a Hub link that opens their demo with `?preview=`.
- **Funnel stamps** on the trial and enquiry: `startedAt`, `callStartedAt` (browser/phone/sample), `bookedAt`,
  `autopilotDoneAt`, `endCardAt`, `cta` (`book` | `reach` | `explore`).
- **Page views:** a cookie-free daily counter per industry (`demoFunnelDays/{date}`).
- **Hub → Demo → Demo Enquiries** gains columns for industry, furthest step, CTA and phone, plus a "Wants a call"
  filter.
- The cleanup cron (`src/app/api/cron/demo-trials/route.ts`) skips tenants whose `keepUntil` is in the future. The
  sign-in account is still deleted when the hour is up.

### 6.8 Limits, cost, security
- **Kept:** 1-hour session, 2 calls of up to 3 min, 24 tool calls, 20 demos/day overall and 3 per network (the
  per-email cap no longer applies). The rehearsal path (D5) has its own cap and requires the superadmin claim.
- **Cost per demo:** at most about $0.33. That is ≤ 3 min × $0.10/min ElevenLabs (`aiCostRates.ts`), plus $0.01 for the
  note read, $0.002 for the summary and under $0.01 of text-to-speech. Worst case at the 20/day cap is about $7/day.
- **Firestore (Spark):** a 2 s poll for about 3 min is roughly 300 reads per demo, about 6k/day at the cap, well inside
  the free 50k.
- **Security review covers:**
  - phone binding without a code (§6.4)
  - every new trial route (cookie-bound, own tenant only, no request field ever selects a tenant, `noStore`)
  - the bridge (same origin only, trial users only)
  - text-to-speech (server-built text only, once per trial)
  - the contact-request email (escaping)
  - the CSP: the ElevenLabs `connect-src` addition currently applies only to `/try/roofing`; extend it to `/try/*`
    and add `media-src blob:` for the audio
- **Unchanged:** normal-business screens, guards, manual send gates and the shared phone line's own prompt.

## 7. Build plan

Spike first; everything else depends on it. v1 is roofing end to end (T-225–T-230); T-231 extends it to every industry.
Rough size: v1 about 4 focused days, every industry about 2 more.

| Task | What | Main files | Done when |
|---|---|---|---|
| **T-224** spike (½ day) | Prove the iframe stage: trial sign-in carries into the frame (session-storage auth), client-side `navigate` and `spotlight` on Pipeline, SDK captions for both speakers + volume readings, booking→visible delay, the API key allows text-to-speech. | throwaway branch | Go/no-go on the iframe written into this file; fallback chosen if no. |
| **T-225** page shell | `SelfLedDemo` for `/try/roofing`: one-field start, call side panel, stage frame, end card, the §4 wording; retire the setup modal and code UI; audio-reactive orb (from `DemoHero`). | `src/components/demo/selfled/*`, `src/app/try/[vertical]/page.tsx`, `RoofingTrial.tsx` | Desktop + 375 px screenshots read; no copy beyond §4. |
| **T-226** stage + scenes | Presentation mode + bridge in the company layout; `data-demo-spot` attributes; `scenes.ts`; scene player (6 s, pause/back/next, desktop zoom); real read-only quote/invoice on the private job page. | `src/app/company/layout.tsx`, `src/lib/demo/scenes.ts`, Calls/Pipeline/Job/Calendar pages (attributes only) | Unit tests for `scenesFor` across all 14 templates; a normal tenant's screens unchanged. |
| **T-227** live + autopilot | `GET live`; autopilot after booking; generalized `finishTrialBooking`; catalog-matched crew note → real parser → findings → quote → report → invoice; prompt v2 (§6.6). | `src/lib/demo/*`, tools route, `src/app/api/demo/trial/*` | Booking scenario suite green; autopilot idempotent (tested twice); **Booking-change gate**: agent tests + one real browser call after deploy, transcript read. |
| **T-228** leads + funnel | CTAs; contact route + hot-lead email; funnel stamps + page-view counter; Hub columns + filter; 7-day `keepUntil` in the cleanup cron; rehearsal button (D5). | `src/app/api/demo/trial/contact`, `src/app/hub/demo/page.tsx`, cleanup cron | Email arrives in the owner's inbox from a real run; cron keeps a hot lead and deletes the rest. |
| **T-229** phone, no code | Arm/heartbeat; binding at initiation; shared opener without code; remove the code UI, issuing and opener; then remove `connectDemoSession` from the live agent (dry-run first). | initiation route, `phoneTrial.ts`, `phonePrompt.ts` | Unit tests for selection (none / one / two armed / dial-intent wins / expired); **real phone call** from the owner's phone with the laptop open lands in the demo, greeting says the business name. |
| **T-230** Just watch | Sample-call route through the real engine; caption/audio player; run-time greeting text-to-speech; clip script; roofing clips. | `src/app/api/demo/trial/sample-call`, `scripts/generate-demo-audio.mjs`, `public/demo-audio/roofing/` | Works with sound on and off; the Calls screen labels it "Sample call". |
| **T-231** every industry | `industry` on the trial (keep the existing private-trial namespace so no guard regex changes; add a field); `trialConfig(industry)`; per-mode seed; `demoLine` + `sampleCall` for all 14; appointment scenes; all `/try/<industry>` pages on `SelfLedDemo`. | `roofingTrial.ts` (rename later), `pitch.ts`, `templates.ts` consumers | Spec runs roofing + pet care + dental at 375 px; `INDUSTRY-READINESS.md` updated. |
| **T-232** later | A `/try` link with no industry, which guesses the industry from the business name with a one-tap correction; crew-note audio; "Email me this demo"; logo/colours from their website (needs URL-fetch safety work); Spanish page wording; daily digest email. | — | Separate approval. |

**Parallel split (when prompts are written):** Stream A = page and stage (T-225, T-226, T-230's player). Stream B =
server (T-227, T-228, T-229, T-230's route). File-disjoint apart from the shared `src/app/api/demo/trial/` contract,
which T-224 fixes first. The integrator runs the merged-tree browser suite (memory: worker merges hid six regressions
once).

## 8. Tests and gates
- **New spec `e2e/self-led-demo.spec.ts`** (desktop + 375 px), with the mocked ElevenLabs socket `private-demo.spec`
  already uses. Paths:
  - start → talk → booking appears mid-call → all scenes → end card → contact request stored
  - Just watch
  - pet care (no quote scene)
  - dental (appointment scenes)
  - daily-limit screen
- **Unit tests:** `scenesFor` (all templates), armed-trial selection, catalog match → note → totals, live snapshot
  scoping, contact validation (phone or email) and escaping.
- **Existing:** `private-demo.spec` is rewritten, not deleted. `e2e:call` runs because the initiation route changes;
  the shared call → invoice flow must stay green.
- **Booking-change gate (AGENTS.md):** T-227 (prompt), T-229 (initiation/prompt) and T-230 (booking through the engine)
  each need the scenario suite, ElevenLabs agent tests with the real per-call prompt, and one real call after deploy
  with its transcript read.
- **Owner run-through** (new NEEDS-HUMAN item when v1 ships):
  1. laptop browser call
  2. dial from your phone with the laptop open
  3. the whole thing on a phone's browser
  4. Just watch with sound
  5. "Have us reach you" email arrives

## 9. Deliberately not doing (v1)
- **"Alice calls you" (outbound):** anyone could make Alice ring any number (abuse and calling-law risk), and carrier
  setup is still blocked (NH-34/NH-35). Dialing in gives the same feeling.
- **Text-message confirmations:** no ready texting sender (NH-34). Nothing on screen promises a text.
- **Recording your own voice note as a required step:** an optional "Try it yourself" link on the crew-note scene only.
- **A fake cursor clicking office buttons:** the trial visitor has view-only access, so the office buttons aren't
  theirs to press; the "Your office: 1 tap" chip says the same thing honestly.
- **Pulling a logo from their website:** strongest personalization, but it needs safe URL fetching and image handling;
  in T-232.

## 10. Risks and how we'll know early
| Risk | Check |
|---|---|
| The frame doesn't share the trial sign-in | T-224 spike; fallback in §6.1. |
| The ElevenLabs key can't do text-to-speech | T-224; if not, NEEDS-HUMAN key permission, and Just watch uses captions until fixed. |
| Prompt changes make Alice less reliable | Booking-change gate; real calls before calling it done. |
| Two phone callers cross (D3) | Accepted; arm window + dial-intent preference keep it rare; enquiry log shows it if it happens. |
| Autopilot output looks wrong for the caller's problem (e.g. "chimney" call, "gutter" quote) | Catalog match on the caller's own words + unit tests on each industry's starter catalog; fallback item is the most generic. |
| Quotas or cost creep | Caps unchanged; per-demo cost about $0.33; usage shows in Admin → Usage & costs. |

## 11. How we'll judge it
From the funnel (§6.7), after the first 30 visitors:
- page view → start ≥ 50%
- start → booked ≥ 60%
- booked → end card ≥ 80%
- end card → CTA ≥ 25%

And the owner's own test: a stranger completes it on a phone without asking a question.
