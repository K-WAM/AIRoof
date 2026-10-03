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
- ⚠️ H8: the subtitle repeats what the tiles say; consider dropping it.

### Calls
- ✅ H2/H4: "1 total" pill was warning-orange and capped silently at 100 → neutral "N calls" / "100+ calls".
- ⚠️ H8 phone: each call card offers "Open call", "Details" and "Booked · open in Pipeline" — three ways in. Keep one
  primary ("Open call") and fold the rest into Details.
- ⚠️ H8: transcripts show the classifier's internal reason line; only useful to staff debugging.

### Pipeline
- ✅ H5: "Create Job" on a booking that already had a job (made from the New Job form) → now "Open Job J-…".
- — Booked/Callbacks split, one primary action per card, review sheet with explicit accept/decline.

### Calendar
- ✅ H2: an invoiced job showed under "Unscheduled jobs".
- ⚠️ H4: "+ Manage crews" uses an add icon for a manage action.

### Jobs list
- ✅ H1: clicking a status tab refetched and **zeroed every other tab's count** → tabs filter in memory, counts real
  (≤100 jobs; above that each tab asks the server and counts are hidden rather than wrong).
- ✅ H7: tab switches are instant (no round trip).
- ✅ H8: no jobs yet → no search box and six "(0)" tabs, just the empty state.
- ✅ H4: active-filter chip said "complete" while the tab said "Ready to invoice".
- ✅ H5: "Field view" opened the no-login QR screen, which tells a signed-in user "This link isn't active" — removed
  (Field is in the nav; crew links are the job's Field QR).

### Job detail
- ✅ H2: status pill showed the raw enum ("invoiced") → StatusChip, "Paid" once the invoice is paid; invoice badge
  reads Draft/Sent/Void instead of lowercase enums.
- ✅ H1: a paid job left the last progress step open → all five done.
- ✅ H6 desktop: the Invoice tab (the money step) was scrolled off the right edge at 1280 px → group labels become a
  divider below 1440 px.
- ⚠️ H8: Activity shows each note's parsed chips *and* the Work log below repeats the same lines. Consider collapsing
  the per-note chips behind "View parsed" once the Work log has them.

### Field (office login and Crew login) and Field QR
- ✅ H7: a sole open job is preselected (one fewer tap per visit); invoiced jobs no longer listed.
- ✅ H9: an inactive QR link showed the error *plus* a page of dead controls → only the message and a sign-in link.
- ⚠️ H8: the "Add to Home Screen" banner still shows above the inactive-link message.

### Customers · Library · Team · Guide
- — Library: one primary per empty state ("Load example prices"), counts on tabs.
- ✅ H4: Team "seats in use" pill neutral, not warning.
- ⚠️ H8 phone: Library's five tabs wrap to three rows with "Work catalog" alone on the last.

### Settings
- ✅ H8: phone page was ~7,200 px. The nine legal notices (2,438 px of textareas) now fold behind "Edit notices
  (n of 9 on)" with status + approve visible; switched-off notices are one line; duplicate "Terms & notices" heading
  removed; hours are one compact card per day on a phone. (Terms −83 %, Hours −19 %.)
- ⚠️ H7: still the longest screen; a sticky section switcher (instead of the "Jump to" select) would help.

### Admin / Hub (superadmin)
- — Loads in ~1.1 s; not part of the roofing customer's path. Not re-audited beyond load/overflow.

## Verification

- `npx tsc --noEmit` clean; full `npx vitest run` 1,781 pass (new: jobs POST, photo store, field input, legacy
  from-request, idle back-off).
- `npm run e2e:call` 12/12 on the final code.
- Full `npm run e2e:test` on the final tree — see the commit/handoff note for the result.
- Not done: a real phone call (no booking/scheduling code changed — the Booking-change gate is not triggered), and no
  production deploy from this session.
