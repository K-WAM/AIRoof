# Roofing hardening + usability audit — 2026-10-03

Scope: every company screen a roofing tenant uses (owner, staff, viewer, field-only Crew), the no-login field QR
screen, and the Admin/Hub entry screens; judged against Nielsen's 10 heuristics, edge-case/security behaviour of the
APIs behind them, and load cost. Method: the local smoke harness (`npm run e2e:up:bg`), a full call → invoice run
(`npm run e2e:call`) to fill the screens with real data, then desktop 1280×800 + phone 375 px screenshots of every
screen and a code read of each flagged issue. New repeatable check: `e2e/screen-audit.spec.ts` (first-content time,
distinct API calls while loading, phone overflow, a screenshot per screen).

Heuristic key: H1 visibility of status · H2 match with the real world · H3 user control · H4 consistency ·
H5 error prevention · H6 recognition over recall · H7 efficiency · H8 minimalist design · H9 error recovery · H10 help.

## Load times (warm visit, `next dev`, phone)

All screens reach first content in ~1.0–1.9 s in dev mode (production is faster); none overflow at 375 px. The real
speed/reliability problem was not first paint, it was **what the open screens kept re-reading** — see "Firestore cost".

| Screen | First content | API calls while loading |
|---|---|---|
| Dashboard | 1.2 s | 9 data + bootstrap/profile |
| Calls | 1.9 s | 7 |
| Pipeline | 1.5 s | 8 |
| Calendar | 1.1 s | 6 |
| Jobs | 1.0 s | 3 |
| Job detail | 1.4 s | 11 |
| Field (office / Crew) | 1.1 s | 4 |
| Customers · Library · Team · Settings · Guide | 1.0–1.4 s | 2–6 |

## Firestore cost (reliability — fixed)

Firebase is on Spark (50k reads/day) by owner decision. Before this pass, one open tab re-read on every 10 s tick:
Pipeline — every upcoming booking (unbounded) + 500 recent ones; Calls — 100 full transcripts; Dashboard — 100 jobs +
50 actions + the setup checklist's count queries. **One open Pipeline or Dashboard could spend the whole day's quota in
under an hour, and then every tenant's screens and the phone AI's booking tools fail together.** Now:

- Pipeline/Calls: background refreshes read only what can change (newest callbacks, the next two weeks, pending
  requests / newest 15 calls) and merge by id into what is on screen.
- Dashboard: jobs + escalation log once a minute; agent config + checklist on first load only.
- Every live screen: untouched for 3 min → refreshes once a minute; the first touch catches up immediately.

Still recommended (**NEEDS-HUMAN**): move to Blaze before selling. Polling is now ~10× cheaper, but Spark's hard daily
cap is still a single point of failure for every tenant at once; Blaze at this volume costs cents.

## Security / edge cases (fixed)

| Finding | Risk | Fix |
|---|---|---|
| Photo base64 from the no-login field QR was interpolated unescaped into the emailed report's HTML | HTML injection into a customer email sent from the business | strict base64 validation, thumb ≤150 KB (`src/lib/photos/store.ts`) |
| Two photos saved in the same millisecond got the same id | silent photo loss on multi-select upload | random id suffix |
| Photo label could be an object | crashed every screen rendering the photo | PATCH refuses non-string labels |
| Field notes used client-sent `jobContext`/`businessName` in the model prompt | prompt injection by any QR holder | context read from the stored job (`src/lib/jobs/fieldInput.ts`) |
| Field notes unbounded; corrections accepted NaN | model-cost abuse; NaN poisoned materials/labor totals | 5,000-char cap; finite non-negative quantities only; unknown job → 404 |
| Malformed JSON → 500 on 14 job/admin routes | noisy errors, no client message | 400 "Invalid JSON" |
| `POST /api/jobs` with a booking id never stamped the booking | **duplicate jobs** (Pipeline kept offering Create Job) | shares from-request's marker in one transaction; legacy jobs found by `appointmentId` |
| `POST /api/jobs` trusted field types/lengths | 500s; job doc bloat toward 1 MB | trimmed, typed, capped |

## Screen by screen

Legend: ✅ fixed this pass · ⚠️ open (recommendation, not done) · — no issue found.

### Navigation shell
- ✅ H6/H7: at 1280×800 the sticky Help group covered **Team and Settings** (2 of 12 links unreachable without a
  hidden scroll). Sidebar now fits every link on screens ≤900 px tall.
- — Phone: "+ New" and "Menu" are always in reach; the menu groups match the sidebar.

### Dashboard ("Today's Work")
- ✅ H8/H7 phone: four full-width number cards pushed the work below the fold → 2×2 block.
- ✅ H1/H4: "AI answering calls" was warning-orange whether the AI was on or off → green on, red off.
- ✅ H2: an invoiced job counted as "active".
- ✅ (T-179, 2026-10-04) H8: the subtitle repeats what the tiles say; consider dropping it.

### Calls
- ✅ H2/H4: "1 total" pill was warning-orange and capped silently at 100 → neutral "N calls" / "100+ calls".
- ✅ (T-172, 2026-10-04) H8 phone: each call card offers "Open call", "Details" and "Booked · open in Pipeline" — three ways in. Keep one
  primary ("Open call") and fold the rest into Details.
- ✅ (T-173, 2026-10-04) H8: transcripts show the classifier's internal reason line; only useful to staff debugging.

### Pipeline
- ✅ H5: "Create Job" on a booking that already had a job (made from the New Job form) → now "Open Job J-…".
- — Booked/Callbacks split, one primary action per card, review sheet with explicit accept/decline.

### Calendar
- ✅ H2: an invoiced job showed under "Unscheduled jobs".
- ✅ (T-175, 2026-10-04) H4: "+ Manage crews" uses an add icon for a manage action.

### Jobs list
- ✅ H1: clicking a status tab refetched and **zeroed every other tab's count** → tabs filter in memory, counts real
  (≤100 jobs; above that each tab asks the server and counts are hidden rather than wrong).
- ✅ H7: tab switches are instant (no round trip).
- ✅ H8: no jobs yet → no search box and six "(0)" tabs, just the empty state.
- ✅ H4: active-filter chip said "complete" while the tab said "Ready to invoice".
- ✅ H5: "Field view" opened the no-login QR screen, which tells a signed-in user "This link isn't active" — removed
  (Field is in the nav; crew links are the job's Field QR).

### Job detail
- ✅ H5/H1: a background refresh marked the draft invoice "Unsaved changes" every few seconds and **Send was refused**
  ("Still saving your edits") though nothing was edited.
- ✅ H2: status pill showed the raw enum ("invoiced") → StatusChip, "Paid" once the invoice is paid; invoice badge
  reads Draft/Sent/Void instead of lowercase enums.
- ✅ H1: a paid job left the last progress step open → all five done.
- ✅ H6 desktop: the Invoice tab (the money step) was scrolled off the right edge at 1280 px → group labels become a
  divider below 1440 px.
- ✅ (T-174, 2026-10-04) H8: Activity shows each note's parsed chips *and* the Work log below repeats the same lines. Consider collapsing
  the per-note chips behind "View parsed" once the Work log has them.

### Field (office login and Crew login) and Field QR
- ✅ H7: a sole open job is preselected (one fewer tap per visit); invoiced jobs no longer listed.
- ✅ H9: an inactive QR link showed the error *plus* a page of dead controls → only the message and a sign-in link.
- ✅ (T-176, 2026-10-04) H8: the "Add to Home Screen" banner still shows above the inactive-link message.

### Customers · Library · Team · Guide
- — Library: one primary per empty state ("Load example prices"), counts on tabs.
- ✅ H4: Team "seats in use" pill neutral, not warning.
- ✅ (T-177, 2026-10-04) H8 phone: Library's five tabs wrap to three rows with "Work catalog" alone on the last.

### Settings
- ✅ H8: phone page was ~7,200 px. The nine legal notices (2,438 px of textareas) now fold behind "Edit notices
  (n of 9 on)" with status + approve visible; switched-off notices are one line; duplicate "Terms & notices" heading
  removed; hours are one compact card per day on a phone. (Terms −83 %, Hours −19 %.)
- ✅ (T-178, 2026-10-04) H7: still the longest screen; a sticky section switcher (instead of the "Jump to" select) would help.

### Admin / Hub (superadmin)
- — Loads in ~1.1 s; not part of the roofing customer's path. Not re-audited beyond load/overflow.

## Verification

- `npx tsc --noEmit` clean; full `npx vitest run` 1,781 pass (new: jobs POST, photo store, field input, legacy
  from-request, idle back-off).
- `npm run e2e:call` 12/12 on the final code.
- Full `npm run e2e:test` (150 tests, 47 min): 138 passed, 3 flaky (passed on retry), 4 failed. Resolution:
  screen-audit ×2 — budgets too tight for pages that legitimately make 11 requests (fixed in the spec);
  **doc-photos (phone) — a real bug**: the invoice autosave re-fired on every 5 s refresh and refused Send with
  "Still saving your edits" (fixed, 9d5e626); booking calendar (phone) — leftover bookings from an earlier failed run
  held Monday 8:00 (reseeded; no booking code changed). Reruns on the final code: doc-photos, empty-states,
  screen-audit, booking all pass on phone; doc-photos + screen-audit pass on desktop.
- Not done: a real phone call (no booking/scheduling code changed — the Booking-change gate is not triggered), and no
  production deploy from this session.


## Follow-up 2026-10-04 — field updates (T-181) against the 10 heuristics

Owner: "a lot can go wrong with updates going to the wrong job… knows who provided an update… the arrived at office
and started lunch buttons were confusing." Both field screens now share one `FieldNoteComposer`, `RecentNotes` and the
reworked `TimeClock`. Proven by `e2e/field-updates.spec.ts` (desktop + phone).

| Heuristic | Before | After |
|---|---|---|
| H1 Visibility of status | "✓ Logged" for 2–3 s, no job named; clock showed "At J-1003" with no time | Receipt stays: "Saved to J-1001 by Carlos · Added 1 material, 8 h labor, 1 issue"; clock: "At J-1001 · 1h 05m", today's total |
| H2 Match the real world | "Arrived at office / Done for the day"; "Update 1 by Crew (no name given)" | "Clock in at the shop / at J-1001 / Leave J-1001 / Clock out for the day"; "from Carlos" (+ "field link" for QR) |
| H3 User control | One tap ended the paid day; correction applied to whatever job was selected | Clock out asks once; a correction is tied to its job and a job switch drops it; "Keep as is" |
| H4 Consistency | Two different field screens (orange vs purple, typing only on one) | One composer, one clock, one recent list on both |
| H5 Error prevention | Notes and hours could point at different jobs silently; same-ms notes overwrote each other; anonymous notes; body-supplied names | "Notes go to J-…" before talking; warning when clocked in elsewhere; clocked-in job auto-selected; random-suffix ids; QR needs a name, login name can't be spoofed |
| H6 Recognition over recall | Crew had to remember which job was selected | Job + address + "Sent as" printed at the button; "Your crew" tag in the job list |
| H7 Flexibility | Hold-to-talk only (signed-in) | Hold OR tap-start/tap-stop; type on both screens |
| H8 Minimalist | Job page repeated parsed chips and the Work log | The note's words lead; AI extraction folds behind "What the AI read (n)" |
| H9 Error recovery | "Failed — try again" | Says what to do: mic blocked → allow or type; no speech → hold the whole time; invoiced → ask the office; no signal → text kept, try again |
| H10 Help | None at the button | One example line under the mic; shop time explained where offered |

**Who is on a job (the "assigned by number?" question):** jobs have a number (J-1001) and are assigned to a **crew**
on the Calendar; a person belongs to one crew (Library → Crews). A signed-in person is identified by their login
(stored as a uid), a QR user by the name they type — every note, photo and clock tap carries that identity, and
punched hours go onto the job's labor under the same name. Not yet shown: the author's crew name on office note
cards (TODO T-181 follow-up).

**Verification (2026-10-04, final tree):** full `npm run e2e:test` — **149 passed, 0 failed, 0 flaky** (5 skipped by
design), 27 min on a freshly seeded harness. Earlier runs that day failed at random because `next dev` evicted compiled
routes every 60 s and stalled requests 5–15 s; `next.config.ts` now keeps dev routes warm (`onDemandEntries`, dev-only).
Real bugs found by those runs and fixed: the previous job's notes showing under the next job's heading, and the QR
composer saying "Pick a job" while the link's job was still loading. Screen audit (warm, phone): every screen
1.0–1.9 s to first content, 2–10 API calls, no overflow. Also: full vitest 1,790 pass, `e2e:call` 12/12.

### Second pass, same day — "no training, no friction, really decluttered"
- **A sub sees the job.** The signed-in field screen no longer hides jobs outside the person's crew (that was the
  one thing a worker subbed in from another crew hit first). Every open job is listed, their own crew's first with a
  "Your crew" tag. Empty state: "No open jobs right now" (was "No job assigned to you — ask the office", a dead end).
- **Pick the job without a dropdown.** Nothing selected → the jobs are a plain list under "Which job are you at?".
- **Fewer boxes.** The separate "Notes go to" card is one line above the button ("Note goes to J-1001 · as Carlos");
  the four-section Job Log card is one line ("So far on J-1001: 12 bundles shingles · 8.0 h labor"); Photo and Finding
  share a row; the time clock lost its "Last tap" and helper paragraph (folded into the status line). Screen order:
  job → clock → talk → photo/finding → what's logged.

### Third pass — many jobs, finished jobs, "office" not "shop"
- **50 open jobs no longer means 50 rows.** `JobPicker` (both field screens): a search box (number, name or address),
  the 5 likeliest jobs (the one you're clocked in at → the one you used last on this phone → your crew's, today's
  first → newest), and "Show all N jobs". A picked job collapses to one card with "Change".
- **Finished jobs are reachable.** They are in search and under Show all, tagged "Done", and accept notes — a late
  photo or a callback should never bounce. The 2026-10-04 refusal on invoiced jobs was removed the same day: the
  invoice is already locked, a note can't change it, and the office sees the note.
- **"Clock in at the office"** (there is no shop); "Office time is paid, not billed to a job."
- Verified: JobPicker unit tests (50 jobs → 5 rows + search + Show all; search finds a Done job; ranking), field
  specs desktop + phone, phone screenshots with 30 open jobs.
