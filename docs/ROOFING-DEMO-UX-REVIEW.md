# ROOFING-DEMO-UX-REVIEW.md — end-to-end screen review for demo readiness

Written 2026-09-26. Scope: make the roofing tenant's whole path — call in, review, schedule, do the work, get paid —
feel like one clear product instead of a set of separately-shipped screens. Roofing is the example; every screen here
is driven by `useBusinessModules()`/`VERTICAL_TEMPLATES` (see CLAUDE.md's Industry-Applicability rule), so a fix made
here should read as "fix the shared component," not "fix the roofing page" — that is what makes it transfer to the
other 12 industries later.

**Standard this review measures against:** `D:\Apps\0 - Coding Standards & Specs\App Design Specification for Clear,
Minimal, High-Trust Products.md` — one job-to-be-done per screen in plain language, navigation separated from local
actions, progressive disclosure over front-loaded complexity, immediate feedback on every consequential action, plain
English microcopy (no "unlock," "seamlessly," "supercharge"), and finishing one step should make the next step
obvious without a menu hunt.

**How to run this:** `npm run e2e:up:bg`, then walk each row below in the browser as `owner` (password
`E2e-Passw0rd!`, see `docs/SMOKE-HARNESS.md`) at both 1280px and 375px. Screenshot with `shot()` in a spec, or by eye.
Log a finding as a `KNOWN_PHONE_OVERFLOW`-style line in `e2e/smoke.spec.ts` if it's a phone-only overflow, or as a new
`TODO.md` task if it's a layout/copy/flow fix — never fix silently without a screenshot proving the before state, and
re-run the suite after to prove the after state.

## The intended flow (what "smooth" means here)

```
Call comes in  ->  Pipeline (request appears, badged "New request")
                        |  Review request card: who, what, when, transcript
                        v
                  Confirm & notify  -------->  Create Job (prefilled)
                        |                              |
                        v                              v
                   Calendar (job appears          Job page: numbered tabs
                   on the crew's day)              guide the office through
                        |                          Findings -> Quote -> Report -> Invoice
                        v                              |
                  Crew works the job                   v
                  (Field screen, photos,          Quote sent/accepted -> Report emailed
                   findings)                      (price-free unless "Include quote")
                                                        |
                                                        v
                                                  Invoice sent -> job is Invoiced -> Mark paid
```

Every arrow above should be a **visible button on the screen you're already on** — not "go find it in the sidebar."
The numbered job tabs (① Findings ② Quote ③ Report ④ Invoice) already encode this order; the review below checks
whether the screens *before* the job page (Calls, Pipeline, Calendar) hand off into it just as clearly, and whether
the tabs *within* the job page stay legible once real data (5+ photos, a long quote) fills them in.

## Per-screen checklist

For each screen: **Job** (the one thing this screen is for, in plain language) · **Primary action** (the one button
that should be the most visually prominent) · **Check** (what to look for) · **Verify with** (how to confirm).

### Dashboard (`/company/dashboard`)
- **Job:** "What needs me right now, and how is the phone line doing."
- **Primary action:** open the most urgent item in Needs Attention.
- **Check:** the four stat tiles (Open Jobs, Awaiting Invoice, Today's Bookings, Total Calls) are read at a glance,
  not counted; Needs Attention rows are the busiest thing on the page but still fit the screen at 375px (currently
  they don't — `T-129`); Agent Setup panel doesn't compete with Needs Attention for top billing.
- **Verify with:** `e2e/smoke.spec.ts` (already checks it loads clean); phone screenshot for the overflow.

### Pipeline (`/company/pipeline`)
- **Job:** "Decide on every request the AI captured."
- **Primary action:** Review request (or Confirm & notify customer, when the decision is obvious).
- **Check:** "New request" badge is unmissable; five buttons (Review request / Confirm & notify / Call Back / Create
  Job / Confirm without email / Cancel) on one card is a lot — confirm the visual hierarchy makes ONE of them read
  as primary and the rest as secondary, not six equal buttons (a `.button` vs `.button-secondary` question, not a new
  component); Leads vs Appointments tabs are named the way an owner would say them, not internal states.
- **Verify with:** `e2e/call-to-cash.spec.ts` (drives Review request + Confirm today); screenshot the card at 375px —
  6 stacked buttons on a phone is the most likely clutter finding here.

### Calls (`/company/calls`)
- **Job:** "What did this call actually say, and what did it produce."
- **Primary action:** open a call to read its transcript; "Review request" when the call produced one.
- **Check:** the transcript is the focus, not buried under metadata; "This call produced: <link>" is a real
  hand-off into Pipeline/Jobs, not a dead label.
- **Verify with:** `e2e/call-to-cash.spec.ts` step 1.

### Calendar (`/company/calendar`)
- **Job:** "What is each crew doing today and this week."
- **Primary action:** drag a job onto a crew×day cell; Confirm a provisional (grey) slot.
- **Check:** grey/provisional vs confirmed is distinguishable at a glance and in a screenshot, not just by hover
  tooltip; an empty calendar (a new tenant, or a slow day) still explains itself instead of looking broken.
- **Verify with:** a new spec is needed — this flow has no browser coverage yet (`src/e2e/demo-path.test.ts` covers
  booking via the API only). Write `e2e/calendar.spec.ts`: seed a job via `api("owner")`, drag it onto a crew cell,
  confirm, assert the color/state change and that a crew email was captured in `outbox()`.

### Jobs list (`/company/jobs`)
- **Job:** "Find a job; see its status at a glance."
- **Primary action:** New Job; open a row.
- **Check:** the status tabs (All/Needs quote/Quote sent/In progress/Ready to invoice/Invoiced) match the job page's
  own numbered-tab language — an owner should never wonder if "Ready to invoice" and "① Findings done" are the same
  thing; the table becomes a card list on phones instead of a horizontally-scrolling table (`T-129`); Export CSV and
  Field view don't outrank New Job visually.
- **Verify with:** `e2e/smoke.spec.ts` (loads); needs a phone-layout fix, tracked in `T-129`.

### Job detail (`/company/jobs/[jobId]`)
- **Job:** "Everything about this one job, and what to do next."
- **Primary action:** the highlighted numbered tab (whichever of Findings/Quote/Report/Invoice is current);
  otherwise "Next: <action> →".
- **Check:** the split between plain record tabs (Activity/Photos/Materials/Labor) on the left and numbered workflow
  tabs on the right reads as two different *kinds* of tab, not six equal ones — confirm the visual weight matches
  that intent; the Invoice tab's in-app letterhead preview is legible on a phone without horizontal scroll (today it
  isn't — the reference invoice is a full US-letter layout; either a phone-specific condensed preview or an
  explicit "view full invoice" affordance is needed, `T-129`); a job with 20 photos, 3 findings, and a sent quote
  doesn't make any tab feel like a wall of text — check the busiest real job (`J-1000`+ from `npm run e2e:call`).
- **Verify with:** `e2e/call-to-cash.spec.ts` (walks all 8 tabs at both breakpoints, screenshots every one).

### Quote / Report / Invoice (tabs within the job page + their emails)
- **Job:** "Turn the job into a document a customer can read, without leaking a price it shouldn't."
- **Primary action:** Send.
- **Check:** hide-materials/hide-labor and "Include quote" toggles are near the content they affect, not in a
  far-away settings panel; the customer-facing preview (already shown inline) and the actually-sent email agree
  (E5 fixed one such gap — re-check after E6b, which touches this area again); the price-free-unless-ticked rule is
  stated once, plainly, where the toggle lives — not just in `TODO.md`.
- **Verify with:** `e2e/call-to-cash.spec.ts` (send-and-read-the-email steps); once E6b lands, extend it to assert a
  photo appears in a sent email's HTML.

### Field screen (`/company/field`, `/field`)
- **Job:** "Log what happened on site, fast, on a phone, maybe one-handed."
- **Primary action:** Submit update (voice or text); the time clock.
- **Check:** everything reachable with a thumb at the bottom of a 375px screen, not the top; the "+ Finding" sheet
  doesn't get cut off (E3 fixed the sheet's own `max-height`; confirm it stays fixed as content grows); no control
  requires horizontal scroll (`T-129`).
- **Verify with:** `e2e/smoke.spec.ts` phone project; a dedicated field-flow spec would be a good `T-129` follow-up
  (submit a voice-shaped note, add a finding, take a photo, all as `crew`).

### Library / Customers / Team / Settings
- **Job:** Library — "the prices and crews the rest of the app pulls from." Customers — "who is this job for, have we
  met them before." Team — "who can sign in, and lock the ones who shouldn't." Settings — "the handful of things that
  change how the AI/documents behave."
- **Check:** these are correctly NOT part of the main call-to-cash flow, so they should read as reference/admin
  screens (calmer, denser tables) rather than competing with the workflow screens for visual energy; Settings in
  particular should not force a scroll through every option to find Documents/Terms — confirm the panel grouping
  still makes sense after E5's additions.
- **Verify with:** `e2e/smoke.spec.ts` (loads clean for owner and dental, so cross-industry gating already holds
  here — Jobs-only concepts stay out of Library for a dental tenant).

## What "decluttered and modern" means as a pass/fail, not a vibe

Reject a screen change (yours or a worker's) if it:
- adds a second button that means roughly the same thing as an existing one, instead of removing/merging;
- puts the busiest content first with no way to collapse it (progressive disclosure, not front-loading);
- uses internal words ("propertyType," "reportOptions") where a plain word exists ("Commercial property," "Hide
  labor");
- makes the next step require the sidebar when a direct link/button would do (every arrow in the flow diagram above
  should be clickable from the screen before it);
- passes on desktop but has never been looked at on a phone screenshot.

## Sequencing

1. `T-129` (already queued, `docs/WORKER_QUEUE.md` section E) fixes the phone-overflow list this review already
   found. Do this first — it's mechanical and unblocks an honest look at the rest.
2. Write `e2e/calendar.spec.ts` (no coverage today) before judging the Calendar screen — a screenshot from a spec
   beats one taken by hand, because it re-runs.
3. Walk this document's checklist end to end at both breakpoints once `T-129` and E6b are merged; file findings as
   `TODO.md` tasks (small, one screen each) rather than one giant redesign task.
4. Re-run `npm run e2e:test` after every fix — a screen that "looks fixed" and a screen the suite agrees is fixed are
   different claims; only report the second one.
