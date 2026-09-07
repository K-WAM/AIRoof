# SESSION_HANDOFF.md — Current state

Updated: 2026-09-06 (Claude), continued — T-077 (Phase 9, third slice) done: audited the invoice/materials/
Library "handshake" the owner asked about and fixed what was actually silently broken, plus added the
requested educational tooltips. Two real gaps, not just missing UI polish: (1) unpriced material rows on the
Invoice tab looked identical to a real $0.00 — now flagged with a tooltip explaining why + a one-click "+ Add
material" quick-add (extends T-076's picker with a 4th kind); (2) Library's "Labor rates & tax" role rates were
never actually read by invoice generation — a fully dead feature — now wired in via a new `lookupLaborRate()`
helper plus a per-row "pick a saved role" dropdown. Also surfaced a previously-silent Library-fetch failure
(banner + retry) and, found while tracing every reader of the Library/Crews data, fixed a real security gap:
`GET /api/company/crews` and `GET /api/company/library` had no auth gate at all (only their write methods did)
— both now session-gated. Full detail in `TODO.md`'s T-077 entry. `tsc`/lint(0/21) clean, `vitest run` 424/424
(3 pre-existing concurrent-load flakes, clean in isolation), release suite 16/16, `next build` green.

Previous: 2026-09-06 (Claude), continued — T-076 (Phase 9, second slice) done: a global quick-add ("+") reachable
from every company page, plus a reusable "add X first" blocked-workflow card, converted onto Calendar's
empty-crew state as the flagship example. Owner: "in modern apps, its nice to be able to click + ... like in
airbnb, i can do a lot from almost any page ... tool tips if the workflow is blocked ... a popup card that says
'add X first' ... use your best judgement ... like modern airbnb ... update todos and docs." Built a reusable
`Modal` primitive, a `QuickAddProvider`/`useQuickAdd()` context (picker + jump-straight-to-one-form), a
`QuickAddButton` in the sidebar/mobile nav, and `BlockedAction`; the three quick-add forms (Job/Crew/Teammate)
POST to the exact same endpoints their home pages already use — no duplicated business logic — and are gated by
the same module/role rules those pages already enforce. A small event bus lets Jobs/Library/Team/Calendar
refresh their own list when something of their kind is created from elsewhere. Manual Appointment creation was
deliberately left out of v1 (no staff-facing booking flow exists today to extract — building one is a separate
product decision); full detail, including that scope call, in `TODO.md`'s T-076 entry. `tsc`/lint(0/21) clean,
`vitest run` 409/409 (2 pre-existing concurrent-load flakes, clean in isolation), release suite 16/16, `next
build` green with no First Load JS regression on any touched route. **Pushed and live** (2026-09-06, owner
approved) — this push also carried T-071 through T-075, previously local-only; see the Repository section
below. Vercel's auto-deploy reached Ready and production was re-verified healthy post-deploy.

Previous: 2026-09-06 (Claude), continued — T-075 (Phase 9, first slice) done: a new reusable `Toggle` switch
component applied to two persisted binary settings (Settings business-hours "Closed", job-detail photo "In
report"), `company/jobs/[jobId]` brought onto the standard `PageSkeleton` loading pattern (it was the one major
detail page still on a bare loading `<div>`), and its "Job not found" state fixed from a genuine dead end (no
way back) to a "Back to Jobs" link. First slice of an open-ended UI/UX modernization pass, not full "every page"
coverage — see `TODO.md`'s T-075 entry for the audit findings and the candidate next-slice list. `tsc`/lint(0/21)
clean, `vitest run` 386/389 (3 pre-existing concurrent-load flakes, clean in isolation), release suite 16/16,
`next build` green with no bundle-size regression. Pushed as part of the T-076 push above (2026-09-06).

Previous: 2026-09-06 (Claude) — T-072/T-073/T-074 done, same session, continuing straight off T-071: (1) fixed
the Calendar→Pipeline appointment link (deep-link + a "Needs Confirmation" bucket that no longer strands
overdue-but-unconfirmed bookings without a Confirm button), reordered the company nav into workflow order, and
moved Calendar's last client-side Firestore read server-side; (2) built self-service team management — an
owner can add teammates by email and assign Owner/Staff/Viewer with no superadmin involved, the feature the
owner asked for with "we may already have it" (audited: we didn't); (3) found and fixed a real bug while
building (2) — the onboarding wizard's business-creation endpoint wrote owner `businessUsers` docs without
`active: true`, which every `verifyAuthAndRole` check requires, so a freshly wizard-onboarded owner could log
in but got 403 from nearly every company-portal API. Full detail in the dated sections below. `tsc`/lint/build
clean throughout; `vitest run` 388/389 (one more instance of the pre-existing parallel-load timeout flake,
clean in isolation, different file each time it's shown up — confirmed environmental, not a real failure).
Pushed as part of the T-076 push above (2026-09-06).

Previous: 2026-09-06 (Claude) — T-071 done: moved Dashboard/Calls/Pipeline/CommandBar's Firestore reads
server-side (4 new admin-SDK endpoints) to cut round-trip time — the thing T-070 explicitly flagged as the next
lag source once bundle weight was fixed (owner: "do the round-trip time thing to reduce page lag"). Also fixed
a real pre-existing bug found along the way: CommandBar's lead search has 404'd silently since it was built.
Local commit only at the time — see the Repository section below for current push status.

## Repository

- Root: `D:\Apps\AI Receptionist` (this machine).
- Branch: `main`.
- Pushed baseline: `origin/main` is at `d381907` (2026-09-06, owner approved this push) — it carried T-071
  through T-076 in one push (all six had been sitting local-only across this session; the owner approved
  pushing once T-076 was ready rather than one push per task). Vercel's GitHub auto-deploy reached Ready
  (confirmed via `vercel ls`, not just assumed from the push); production re-verified post-deploy:
  `/api/health` → `200`/`"connected"` with all six provider/runtime capabilities `configured`, unauthenticated
  webhook `POST` → `401`, `/login` → `200`. **T-077 (this session) is local-only** — not yet approved for push.
- **Live Vapi assistant config was changed directly via API this session (T-060)** — independent of git/Vercel
  deploys. Assistant `9267a84a-0f4f-416b-a328-1dc539f5265e` now runs `model: openai/gpt-realtime-2025-08-28` +
  `voice: openai/cedar`, up from `vapi/Savannah` + `gpt-4o-mini` (a pre-existing config this session found was
  already undocumented — see the 2026-09-05 T-060 entry below). Rollback snapshot saved outside the repo
  (session scratchpad), not in git.
- Vercel: deployed via the GitHub-integration auto-deploy on each push to `main`.
- No worker branches, active worktrees, or development blockers otherwise.
- Untracked in the working tree: `example image irrigation.png` (repo root) — the owner's T-056 reference
  screenshot, not an app asset; not added to git. Delete or relocate on request.

## 2026-09-06, continued — T-077: invoice/materials/Library handshake audit + educational tooltips

Direct continuation of T-076, same session. Owner: "make sure the information handshake between invoice and
materials and library is all set up as needed for ultra smooth use, with tooltips explaining to user why
something might be blocked, in educational matter of fact tone, and what they need to do to unblock."

**Traced the real data flow instead of guessing.** `generateInvoice()` in `company/jobs/[jobId]/page.tsx` is
entirely client-side; the server route at `api/jobs/[jobId]/invoice/route.ts` has zero callers anywhere in the
app (grepped, confirmed) — flagged as dead code below, not removed without the owner's sign-off since deleting
a route is a more consequential call than this task's scope needed. The client builds material/labor invoice
rows from field-update data plus the Library catalog (`/api/company/library`).

**Found and fixed:**
1. **Materials — silent, not blocking.** `lookupUnitPrice()` already correctly leaves a material's price blank
   on no catalog match (never fabricates a number) — but a blank price rendered identically to a real $0.00,
   with the "0.00" placeholder indistinguishable from an actual zero. An owner could send an invoice silently
   undercounting a material with nothing telling them to look. Fixed: unpriced rows get a small warning icon
   next to the price field; its tooltip explains why in the requested tone ("No price on file for 'X' — it
   isn't in your Library pricing catalog, and this field note didn't include a cost...") and clicking it opens
   a new "+ Add material" quick-add form — extending T-076's `QuickAddContext` with a fourth kind, prefilled
   with the item name. Because the catalog is a whole-array PUT (unlike Job/Crew/Teammate's single-row POST),
   the form reads the current catalog first and appends, rather than risking a race that wipes the rest of it.
2. **Labor rates — a genuinely dead feature, not a UX gap.** Library's "Labor rates & tax" panel lets an owner
   save $/hr by role with a real UI and save path, but grepping every consumer of `library.laborRates` found
   none outside the Library page itself — `generateInvoice()`'s labor rate was always either an explicit
   field-note cost or one flat business-wide default, never the saved-by-role rate. Careful role-rate setup was
   silently doing nothing on every invoice. Fixed with the same non-fabricating discipline as materials: added
   `lookupLaborRate()` to `types/library.ts` (mirrors `lookupUnitPrice`'s exact/substring match — a logged
   person's name like "Mike" correctly returns no match rather than guessing, covered by a test) and wired it
   into the rate fallback chain between an explicit cost and the flat default. Also added a per-row "pick a
   saved role" dropdown (only rendered when roles exist, so it's not clutter for a tenant with none) and a
   header tooltip explaining where rates come from.
3. **Library-fetch failure was fully silent.** `library?.materials ?? []` treats "the fetch threw" identically
   to "fetched fine, catalog's just empty" — a transient network error would silently zero out every price with
   no distinguishing signal. Added a `libraryLoadFailed` flag (tracked separately from a genuinely-empty
   catalog) and a banner on the Invoice tab explaining it, with a Retry button.
4. **Bonus find, not part of the tooltip ask:** while tracing every reader of the Library/Crews collections,
   found `GET /api/company/crews` and `GET /api/company/library` had no `verifyAuthAndRole` gate at all — only
   POST/PATCH/DELETE/PUT were guarded. Anyone who knew or guessed a `businessId` could unauthenticated-GET a
   tenant's crew roster (names/emails/phones) or full pricing catalog. Confirmed every caller already runs from
   an authenticated `/company/*` page before changing anything, so nothing legitimate breaks; both routes now
   require session auth. Same "found and fixed a real bug along the way" pattern as T-071/T-074 this session.

**Verified:** `tsc` clean; lint 0 errors/21 warnings (two new `react/no-unescaped-entities` catches fixed, same
baseline otherwise); new tests — `types/library.test.ts` (8: `lookupUnitPrice`/`lookupLaborRate` matching and
no-fabrication behavior), 2 new auth-gate regression tests (crews/library GET, both proving 401 with no session
and that Firestore is never reached first), 4 new `QuickAddContext.test.tsx` cases (material kind gated
independently of jobs by the `pricing` module, the read-then-append-then-PUT round trip, prefill when opened
directly the way a blocked-workflow card would) — `vitest run` 424/424 with these included (3 pre-existing
concurrent-load flakes — `example-lib.test.ts`, `send.test.ts`, `registry.test.ts` — reconfirmed clean on an
isolated rerun); release suite 16/16; `next build` green (`/company/jobs/[jobId]` 121kB → 135kB, the one route
with real new logic; every other route unchanged). Committed locally; push pending owner confirmation.

## 2026-09-06, continued — T-076: global quick-add ("+") + a blocked-workflow "add X first" pattern

Direct continuation of T-075 below, same open-ended Phase 9 modernization pass. Owner, across two messages: (1)
"in modern apps, its nice to be able to click + or like easy ways to add things with a large +, like modern
apps, so like + Crew or + appointment, etc, as logical, which opens up the same form to fill but available from
different pages, just to make things easy for navigation ... like in airbnb, i can do a lot from almost any
page, and it will link me to the right place from there, i dont have to backtrack ... Also tool tips if the
workflow is blocked or not followed, there should be a popup card that says 'add X first in order to process
Y', with a button that opens the form to add X"; (2), after being asked to confirm scope: "use your best
judgement on a pick, for seamless, intuitive, easy use, like modern airbnb app ... update todos and docs."

**Audit first.** No global create affordance existed anywhere: `CommandBar.tsx`'s `Cmd+K` is search-only, and
each "add" flow (Job, Crew/resource, Teammate) was a full inline form hand-rolled on its own page with no shared
component. The exact "blocked workflow" case the owner described was already shipped, and already a dead end:
Calendar's empty-crew state read "No crews yet. Add crews in the Library →" — a plain link bouncing the user off
Calendar to go find the Library page and guess their way to the Crews tab, with no way back to where they were.

**Built:**
- `src/components/ui/Modal.tsx` — a generic reusable modal shell (backdrop, Escape/click-outside to close,
  `role="dialog"`). Every ad hoc `position:fixed;inset:0` popup already in this app (Field QR, the job-photo
  lightbox) predates this and can migrate to it opportunistically — not rewritten as part of this task.
- `src/contexts/QuickAddContext.tsx` — a `QuickAddProvider`/`useQuickAdd()` context mounted once in
  `company/layout.tsx`. `openMenu()` shows the picker (Job / Crew / Teammate, filtered to what the tenant's
  industry and the signed-in user's role allow); `open(kind)` jumps straight to one form, skipping the picker —
  what a `BlockedAction` card calls so "add a crew first" resolves in place. Each of the three forms is a new,
  deliberately small component that POSTs to the *exact same* endpoint its home page already uses (`/api/jobs`,
  `/api/company/crews`, `/api/company/team`) — no business logic duplicated, no validation drift risk. Gating
  mirrors each home page exactly: "+ New Job" only when `isEnabled("jobs")` (a dental tenant never sees it),
  "Invite teammate" only for `role === "owner"` or superadmin (matches `TeamPanel`'s existing gate); Crew/
  resource is always offered since every industry's Calendar needs one.
- `src/components/ui/QuickAddButton.tsx` — the "+" trigger, rendered in the sidebar footer (desktop), the
  mobile topbar (icon variant, wrapped in the existing `Tooltip`), and the mobile nav sheet — reachable from
  every company page, not just its own.
- `src/components/ui/BlockedAction.tsx` — the generic "add X first" card: a message, an icon, and a button that
  calls the caller's own `onAction` — decoupled from quick-add specifically so it's reusable for any future
  blocked-workflow prompt, not just this one.
- `src/lib/events/quickAdd.ts` — a small `window`-CustomEvent pub/sub (`emitQuickAddCreated`/
  `useQuickAddRefresh`) so Jobs/Library/Team/Calendar refetch their own list when something of their kind is
  created from *anywhere*, including the global "+" on a different page — without lifting state through the
  whole company shell just so a modal that can open from any page can tell one specific page to refresh.

**Flagship conversion:** Calendar's empty-crew dead-end link is now a `BlockedAction` card whose button calls
`openQuickAdd("crew")` directly — the Crew form opens in place over the Calendar board, submitting it refetches
Calendar's crew rows via the event bus, and the board becomes immediately schedulable with zero navigation away
from where the user started.

**Scope call (owner: "use your best judgement"):** v1 covers Job + Crew/resource + Teammate — all mechanical
extraction of already-existing create-flows onto a new reachable-from-anywhere surface, zero new backend logic.
Manual **Appointment** creation was deliberately left out: there is no staff-facing "add appointment" flow at
all today (appointments are voice-booked by Alice only), so including it would mean designing a net-new booking
flow (slot/conflict handling, provider assignment) rather than just surfacing an existing form — flagged as a
candidate follow-up that needs its own product decision, not attempted here. Only one `BlockedAction` conversion
was done (Calendar's crew-empty state, the concrete case the owner's ask was modeled on); a further audit for
other blocked-workflow dead ends elsewhere in the app is a candidate next slice, not assumed exhaustive here.

**Verified:** `tsc` clean; lint 0 errors/21 warnings (unchanged baseline); new tests — `Modal.test.tsx` (7),
`BlockedAction.test.tsx` (2), `quickAdd.test.tsx` (5, the event bus + `useQuickAddRefresh`),
`QuickAddContext.test.tsx` (6: module/role gating of the picker, the Crew create-and-succeed round trip against
a mocked `fetch`, back-to-menu navigation, Escape-to-close) — `vitest run` 409/409 with these included (2
pre-existing concurrent-load flakes, `example-lib.test.ts` and `send.test.ts`, reconfirmed clean on an isolated
rerun of just those two files, the same long-documented pattern as every prior session); release suite 16/16;
`next build` green with no First Load JS regression on any touched route (Calendar still 104kB, Jobs 118kB,
Library 119kB, Settings 111kB — the shared quick-add code adds negligibly to the company shell's baseline).
**Pushed and live** (2026-09-06, owner approved) — `origin/main` now at `d381907`, which also carried T-071
through T-075 (previously local-only); see the Repository section above. Vercel's auto-deploy reached Ready and
production was re-verified healthy post-deploy (`/api/health`, `/login`, webhook 401).

## 2026-09-06, continued — T-072/T-073/T-074: Calendar/Pipeline/nav fixes, self-service team management, an
active-flag regression fix

Owner reported two concrete bugs and one open question in one message: (1) clicking an unconfirmed appointment
on Calendar lands on Pipeline but "that name of the person i clicked is in past an[d] canceled, so i cant
confirm it"; (2) nav tabs aren't in logical order and Settings/Feedback shouldn't be mixed in with the rest;
(3) "we want a way to if we get a client company, they can add emails, assign roles, etc for their company...
smooth, easy, minimal click setup. we may already have it." Then, in the same session, a follow-up asked to
verify everything syncs, ship the team feature (auditing first since "we may already have it" wasn't certain),
keep cutting load time, audit navigation completeness, and commit.

**T-072 — Calendar/Pipeline/nav.** The appointment link itself was already correct
(`/company/pipeline?tab=appointments&appt=<id>`, real per-appointment id) — Pipeline just never read the `appt`
param, so there was no way to tell which card a click meant. Worse: Pipeline split appointments into
Upcoming/Past purely by `startTime`, so an unconfirmed after-hours booking whose slot time had already passed
lost its Confirm/Cancel buttons the moment it fell into "Past & Cancelled" — genuinely, not just confusingly,
unconfirmable. Fixed both in `src/app/company/pipeline/page.tsx`: scroll-to-and-highlight the exact `appt` id,
and a new "Needs Confirmation" section (pending + not cancelled, regardless of elapsed time) rendered with
`isPast={false}` so its action buttons always show. Nav: `company-nav.tsx` reordered to Dashboard → Pipeline →
Calls → Calendar → Jobs → Field → Library → Guide for every vertical (module filtering still hides what a
tenant's industry doesn't use), with Settings + Feedback split into a `.company-nav-secondary` group pinned to
the sidebar bottom via `margin-top: auto` behind a divider. Perf: Calendar's week-appointments fetch was the
last direct client→Firestore read T-070/T-071 hadn't reached; extended
`GET /api/businesses/[businessId]/appointments` with an optional `from`/`to` range (same field as the
`orderBy`, so no new index) and pointed `CalendarBoard` at it — closes out the same round-trip-time fix as
T-071 for the one page it had skipped.

**T-073 — self-service team management.** Audited before building, per the owner's own "we may already have
it": found nothing self-service. The only existing path,
`POST /api/admin/businesses/[businessId]/provision-login`, is superadmin-only, hardcodes `role: "owner"`, one
login per business, and returns a plaintext temp password for the superadmin to relay by hand. Built
`GET/POST /api/company/team` + `PATCH /api/company/team/[uid]`, gated `["owner", "superadmin"]`. Invite creates
(or reuses) the Firebase Auth user, writes an `active: true` `businessUsers` doc, and emails a branded
password-reset link — reusing the `generatePasswordResetLink` pattern T-043 established, via a new
`sendTeamInviteEmail` in `notify.ts` branded to the business rather than to Luxor. Three guards: refuses an
email carrying the `superadmin` custom claim; refuses an email already active on a *different* business (one
Firestore identity = one tenant, matching how `businessUsers` docs are keyed); and `PATCH` refuses any role
change or deactivation that would leave a business with zero active owners. UI is a `TeamPanel` folded into
`/company/settings` (visible only to `role === "owner"` or superadmin) rather than a new nav tab — it's account
administration, not a workflow the nav reorder above was organizing. New `src/types/team.ts` for the shared
`TeamRole`/`TeamMember` shapes. 14 new tests in `src/app/api/company/team/__tests__/route.test.ts` (a
fake-Firestore harness matching the existing `cron-routes.test.ts` pattern) covering invite, both cross-tenant
guards, and both last-owner-lockout guards. Also updated `public/guides/onboarding-guide.html` (Phase 4, the
go-live checklist, and the "handing over the login" script) so whoever's onboarding a client tells them they
can add their own team from Settings → Team — and, while already editing that file, fixed unrelated stale
voice-stack steps it still described (Cartesia Sonic 3.5 / ElevenLabs Flash / Deepgram nova-3, the pipeline
T-060 replaced on 2026-09-05) to the actual live `gpt-realtime-2025-08-28` + `cedar` config; the guide had never
been updated for that switch.

**T-074 — active-flag regression, found while building T-073.** `POST /api/admin/businesses` — the onboarding
wizard's business-creation endpoint, the normal way a new client gets provisioned — wrote the owner's
`businessUsers` doc without `active: true`. Every `verifyAuthAndRole` check requires
`.where("active", "==", true)`; without it, a wizard-onboarded owner's login succeeds (Firebase Auth is fine,
`__session` cookie sets) but then 403s on every session-gated API call — which, after T-071/T-072, is most of
the company portal (jobs, appointments, leads, calendar, settings, and now team). The only way this ever
actually worked was a superadmin separately clicking "Provision Login" on the business's config page afterward
— a second, different code path that has always set `active: true` correctly. Added the missing field; added a
regression test in `src/app/api/admin/businesses/__tests__/route.test.ts` asserting
`businessUsers/{uid}.active === true` after business creation. This is very likely why "we may already have
it" needed checking rather than assuming — a freshly wizard-onboarded client's own login may not have actually
worked end-to-end before this fix.

**Navigation-completeness audit (T-072 ask):** every `page.tsx` under `src/app/company` and `src/app/admin` is
either linked from its nav (`company-nav.tsx`/`admin-nav.tsx`), reachable via an in-page button
(`/admin/onboarding` from "+ New business" on `/admin/businesses`; `/admin/businesses/[id]/config` from that
list's Edit button), or a documented compatibility redirect (`/company/agent`, `/company/appointments`,
`/company/leads` — all pre-existing, all still correctly redirecting). Nothing unreachable found.

**Verified (all three tasks together):** `tsc` clean; lint 0 errors/21 warnings (all pre-existing); `next build`
green with `/api/company/team` and `/api/company/team/[uid]` in the route table; `vitest run` 388/389 — the one
failure is the same pre-existing parallel-load timeout flake as T-071 documented (a different file each full-run
attempt, always clean in isolation — confirmed again this session on two different files). Pushed as part of
the T-076 push above (2026-09-06).

## 2026-09-06, continued — T-071: cut Firestore round-trip time on Dashboard/Calls/Pipeline/CommandBar

Direct continuation of T-070 below: that entry closed with an explicit caveat — "this is a first-load/hydration
weight fix, not a query-latency one; if pages still feel slow, look at per-query round-trip time next." Owner:
"do the round-trip time thing to reduce page lag."

- **What "round-trip time" means here:** even after T-070 made the Firestore SDK load lazily, the actual client
  Firestore *queries* Dashboard/Calls/Pipeline/CommandBar ran still went browser → Firestore directly — paying
  connection setup + client-side security-rule evaluation on top of the query itself, on whatever network the
  user's browser is on. Dashboard alone ran 6 of these in parallel on every single visit (no caching).
- **Fix:** added 4 new endpoints under `/api/businesses/[businessId]/` — `leads`, `appointments` (both take
  `?limit=`/`?order=`), `calls` (`?countOnly=1` for a cheap aggregation-only count), `agent-actions` — all
  admin-SDK reads gated by `verifyAuthAndRole(..., ["owner","staff","viewer","superadmin"])`, the same
  session-role pattern already used by `/api/jobs` and `/api/company/library`'s PUT. Extended the existing
  `/api/businesses/[businessId]/agent-config` response with 4 more fields instead of adding a 5th endpoint, so
  Dashboard's business-doc read reuses it. Rewired Dashboard, Calls, Pipeline (initial load only — its
  `markContacted`/`updateApptStatus` writes are untouched, out of scope for a load-*time* fix), and CommandBar
  to fetch these instead of querying Firestore client-side. CommandBar no longer touches the client Firestore
  SDK at all.
- **Bonus find:** CommandBar has called `fetch(/api/businesses/${businessId}/leads)` since it was built, but
  that route never existed until this task — every command-palette lead search has silently 404'd (swallowed by
  a `.catch(() => null)`) this whole time. Fixed as a side effect of building the endpoint it was already
  calling.
- **Verified:** `tsc` clean; lint 0/21 (unchanged); `vitest run` 373/374 — the one failure is the
  pre-existing, already-documented `example-lib.test.ts` concurrent-load flake, re-confirmed clean in isolation,
  unrelated to this change; `next build` green with the 4 new routes in the table. Smoke-tested against a local
  prod server: all 5 endpoints correctly return `401 Unauthenticated` with no session cookie. Could not verify
  the authenticated happy path locally (no real Firebase credentials in this sandbox) — mitigated by every new
  query being a verbatim move of the exact collection/orderBy/limit the client already ran successfully in
  production, just executed with the admin SDK instead of the client SDK, rather than new query logic.
- **Honest limit:** this is a latency fix, not a bundle-size one — it won't show up in `next build`'s route
  table the way T-070 did, and local tooling can't measure real round-trip time without production traffic.
  Worth an owner glance at actual page-load timing (e.g. browser DevTools Network tab on the live Dashboard)
  after this ships, to confirm it's felt.
- **Pushed** as part of the T-076 push (2026-09-06) — see the Repository section above.

## 2026-09-06 — T-070: lazy-load Firebase Auth/Firestore off every page's critical path

Owner agreed with a nav-design aside (demote a marketing link out of primary nav, fold a thin "Wallet" item into
account settings — feedback on an external reference screenshot, not this codebase) and then: "do whatever is
next too, reduce loading times on every page as you go, still laggy" — despite T-067/T-068/T-069 already
shipped. Investigated rather than assuming those were exhausted.

- **Root cause, found via `next build`'s route table:** every heavy company/admin/login page (dashboard, calls,
  jobs, jobs/[id], field, guide, library, pipeline, settings, login, admin/onboarding, admin businesses/[id]
  config) sat at 248-261kB First Load JS, while Calendar sat at 104kB. Diffed `.next/app-build-manifest.json`
  between a heavy page and Calendar and string-searched the differing chunks — confirmed they were entirely
  `firebase/auth` + `firebase/firestore`. Traced it to `src/lib/firebase/client.ts`: a plain module doing
  top-level `initializeApp`/`getAuth`/`getFirestore`, statically imported (directly or via `AuthContext`/
  `CommandBar`) by every authenticated layout and several pages. Calendar was the one page already exempt,
  because `CalendarBoard.tsx` (T-068) already dynamically imports both `firebase/firestore` and this module
  inline — that existing precedent is what made the pattern obviously correct to extend everywhere else.
- **Fix:** rewrote `client.ts` to export `getFirebaseAuth()`/`getFirebaseDb()` — memoized async accessors. App
  init itself still kicks off at module-evaluation time (not gated behind a call) so the SDK chunk starts
  fetching in parallel with hydration instead of only after some effect runs. Updated every call site (12
  files: `AuthContext`, `company/layout.tsx`, `admin/layout.tsx`, `login/page.tsx`, `CommandBar`,
  `useBusinessModules`, `useBusinessTimezone`, `CalendarBoard`, and the dashboard/calls/pipeline pages' own
  direct Firestore reads) to `await` the accessor and dynamically `import("firebase/auth")` /
  `import("firebase/firestore")` at the point of use — same pattern as T-068's dnd-kit/qrcode split, just
  applied to the SDK that every authenticated page was paying for.
- **Result:** every previously-heavy page dropped from 248-261kB to 109-122kB First Load JS — roughly halved,
  converging on Calendar's ~104kB baseline. This is a first-load/hydration-speed fix (smaller JS to download,
  parse, and execute before a page's own code runs); it doesn't change how fast Firestore itself answers a
  query, so if "still laggy" persists after this, the next place to look is per-query latency (e.g., the
  dashboard's `getCountFromServer` + four parallel Firestore reads), not bundle size.
- **Verified:** `tsc` clean; lint 0/21 (unchanged baseline); `vitest run` 374/374 — one test
  (`useBusinessModules.test.ts`) needed a microtask-flush in `afterEach` because the new async hops meant a
  dangling promise from the "hasn't resolved yet" case could bleed a mock call count into the next test; not a
  product bug, a test-isolation artifact of the new `await`s. `next build` green, sizes confirmed via the route
  table above. Smoke-tested with a local production server (`next start`) + Playwright: `/login` renders clean,
  submitting the email/password form correctly reaches the (locally-unconfigured, so expectedly short-circuited)
  Firebase code path with no crash or console error beyond a pre-existing missing-favicon 404; `/company/dashboard`
  redirects to `/login?next=...` as expected for a logged-out session. **Pushed and live** — owner approved
  the push; Vercel auto-deployed to Ready, production re-verified healthy post-deploy.
- **Also touched:** `example image irrigation.png` (untracked, repo root) — the owner's T-056 reference
  screenshot — was reviewed again this session for a nav-design opinion but not modified; still untracked,
  per the standing "delete or relocate on request" note (no request made).

## 2026-09-05, continued further — T-060: live assistant switched to GPT Realtime + cedar

Owner asked for Vapi set to "the currently most human sounding timing, personality, models, responses... find
out what it is and set it that way." Full detail in `TODO.md`'s and `HANDOFF.md`'s matching entries — summary:

- **Found this file (and `MASTER_PLAN.md`/`CLAUDE.md`) were already stale** about the live stack: a `--dry-run`
  against the real assistant (before touching anything) showed it was already on Vapi's own "Vapi Voices v2"
  (`Savannah`) + Deepgram Flux, not Cartesia + nova-3 as documented. Corrected `CLAUDE.md`/`MASTER_PLAN.md`.
- **Shipped:** OpenAI's `gpt-realtime-2025-08-28` (native speech-to-speech) + `cedar` voice — researched live as
  Vapi's current most human-sounding option. Tool-calling and end-of-call transcripts confirmed unaffected;
  verified live afterward (7 `toolIds` + system prompt round-tripped untouched).
- **A dry-run caught a real regression first**: the initial plan also overwrote `startSpeakingPlan`/
  `stopSpeakingPlan`/`backgroundSound` with generic documented defaults, which would have made the already-tuned
  live line (`waitSeconds: 0.1`, `numWords: 2`) measurably *slower*. Removed before applying anything for real.
- **Cost:** ~$0.15–0.30+/min all-in, up from ~$0.09–0.14/min — an explicit owner quality-over-cost call for the
  customer-facing voice specifically.
- **Not done:** an actual test call — the only real verification of "does it sound human." Rollback is a
  one-command re-PATCH from the saved snapshot.

## 2026-09-05, continued — T-056 (per-industry visual families) + a token-conservation pass

Owner: "proceed with the next todo improvement items, load time reduction and token conservation are
fiduciary... I do want the [roofers] to feel it is for them, and the dentists to feel it is for them." This
cleared NH-13 (owner dropped a reference client-portal screenshot) and matched the owner's other stated
priority with a new, non-numbered cost audit. Full detail (palette values, contrast numbers, file list) is in
`TODO.md`'s matching 2026-09-05 entry — summary:

- **T-056:** `family: "field" | "care" | "ops"` added to every `VerticalTemplate`; `useBusinessModules()` exposes
  it; `company/layout.tsx` sets it as `data-portal-family` on `.company-shell`; `globals.css` overrides
  `--accent`/`--accent-dark`/`--accent-soft`/`--ring` only inside that scoped selector (field keeps today's
  teal — 7 verticals unaffected; care = dental+childcare; ops = property management alone, reusing its existing
  admin-card violet). Every accent ≥4.5:1 against white, verified by reading the actual `globals.css` in a new
  test rather than a duplicated constant. Admin Demo Studio's own per-vertical `color` field is untouched
  (prohibited scope). Palette values are this session's own call from the reference + existing in-repo colors,
  not a live confirmation round-trip — worth a quick owner glance, not a blocker.
- **Token conservation:** live-call path already sends a fully static persona to Vapi (no per-call runtime
  content to reorder — confirmed the old runtime-aware prompt branch is dead code, per the 2026-09-02 finding
  that `assistant-request` never fires for a fixed-`assistantId` number). The real gap: none of the four
  DeepSeek/OpenAI back-office calls (`parseFieldUpdate`/`summarizeTranscript`/`classifyCallOutcome`/
  `generateFaqSuggestions`) capped `max_tokens` — added defensive ceilings (1000/300/200/600) as a cost/latency
  bound, not a quality change. Deliberately left `parse-field-update`'s `gpt-4o` model choice alone — T-048
  already tested and rejected that downgrade on accuracy grounds; not re-litigating without new evidence.
- **Verified:** `tsc` clean, lint 0/21 (unchanged), full `vitest run` 374/374 clean this run, release suite
  16/16, `next build` green (route sizes unchanged — CSS/type/server-side-only changes). New tests:
  `src/lib/verticals/__tests__/family-palette.test.ts`, `src/hooks/__tests__/useBusinessModules.test.ts` (first
  test for this hook), 4 new cases in `src/lib/ai/__tests__/ai-hardening.test.ts`.

## 2026-09-05 — T-067: cut the auth-gate latency on every page load

Owner asked for the next self-executable improvement, specifically to speed up page loads. T-067 was the only
remaining Phase 8 task that was both fully self-executable and load-time-related (T-068/T-069 already done;
T-062's other half is upstream-blocked; T-064 is owner-deferred; T-054/055/056/058/060 all need a product
decision). New `src/lib/auth/profileCache.ts` lets `AuthContext.tsx` render a cached, uid-validated profile
immediately on mount while the real Firebase-token + Firestore read still happens in the background and
refreshes both state and cache — cuts the two-sequential-async-step blocking wait that gated every one of the
app's 26 client-rendered pages behind a "Loading…" screen on every hard refresh and every company↔admin layout
remount. Read-path UX cache only — every server route still independently re-verifies the real ID token, so
this can't affect what the backend allows. `tsc`/lint(0/21)/`vitest run` 356/359 (3 pre-existing concurrent-load
flakes, confirmed clean isolated)/release suite 16/16/`next build` all green. New test:
`src/lib/auth/__tests__/profileCache.test.ts`. Full detail in `TODO.md`'s and `HANDOFF.md`'s matching entries.
Phase 8 is now 7/9. Pushed 2026-09-06 as part of the T-070 push (see that entry above).

**Continuation, same session:** closed a real gap left in T-068's own "done" scope — its spec flagged
`/admin/onboarding`, `/admin/businesses/[businessId]/config`, and `/company/jobs/[jobId]` as a follow-up audit
beyond Calendar, but only Calendar was ever split. `/company/jobs/[jobId]` and `/admin/demo` both had `qrcode`
statically imported despite only using it inside a click-triggered handler / result-gated effect — moved both
to a dynamic `import("qrcode")` at the call site. Measured: `/company/jobs/[jobId]` 269kB→261kB, `/admin/demo`
down to 118kB. The other two flagged routes carry no accidental library bloat (just page code + all-10-
verticals template data) — flagged as a follow-up, not attempted. `tsc`/lint(0/21)/`vitest run` 359/359/release
suite 16/16/`next build` all green. Also pushed 2026-09-06 as part of the T-070 push.

## 2026-09-03/04 — guide content, CI audit gate, webhook alerting, one reverted live incident

Owner asked for the next self-executable improvement, then kept greenlighting further self-selected work.

- **T-057** (2026-09-03): content-only pass on `public/guides/onboarding-guide.html` — added the 3 missing
  vertical pitch cards, generalized the field-service full-demo walkthrough to all 7 trades via a swap table,
  extended the intake-demo section to Childcare, added an "After the Sale — Client Talk-Track" section, and
  fixed a pre-existing CSS bug (`.step-body strong` descendant selector) found while browser-verifying the
  render.
- **T-062, CI-gate half** (`27b8556`): `npm audit --omit=dev --audit-level=critical` added to CI — passes today
  (0 criticals), catches a future critical-severity regression.
- **T-065** (`fbaf541`): sustained Vapi webhook auth-failure alerting — a best-effort counter on every 401, a
  new daily cron reading/resetting that window, one `[Alert]` email past a 5-failure threshold. Resolved the
  shared T-062/T-065 blocker along the way: Vercel Hobby allows 100 cron jobs/project (only frequency is
  capped), so NH-6's "cron slot budget" concern was never actually a constraint.
- **T-062, firebase-admin v14 half — attempted, broke production, reverted.** Migrated `firebase-admin`
  v12→v14.3.0 (`6bef37b`); fully green locally (tsc/lint/352 tests/release suite/build), but production
  `/api/health` and every Firestore/Auth route started 500ing within about a minute of deploy
  (`ERR_REQUIRE_ESM`: `firebase-admin@14`'s Auth module depends on `jwks-rsa@4.1.0` → `jose@^6.1.3`, and `jose`
  went pure-ESM at v6 — a known open upstream issue, [auth0/node-jwks-rsa#493](https://github.com/auth0/node-jwks-rsa/issues/493)).
  `vercel rollback` was attempted and correctly blocked by the permission classifier; fixed forward via
  `git revert --no-edit 6bef37b` (`bf10381`), verified restored properly, not just re-deployed. No safe retry
  today — both `firebase-admin` and `jwks-rsa` are already at their latest releases, and downgrading `jwks-rsa`
  risks a silent API mismatch on the token-verification path. **T-062 stays open**; only its CI-gate half is
  done. Full incident detail in `TODO.md` and `HANDOFF.md`'s matching entries.

Verified end state: `tsc` clean, lint 0/21, full `vitest run` 352/352 (local `node_modules` re-synced to the
reverted lockfile, confirmed `firebase-admin@12.7.0`), release suite 16/16, production health confirmed live.

## 2026-09-02 — live incident fix, demo-persona bug fix, Phase 8 backlog, 4 tasks completed

A user bug report ("no greeting, always have to start the conversation") uncovered and fixed three real
production issues, then a batch of 4 self-selected backlog tasks. Full evidence in `HANDOFF.md`'s matching
2026-09-02 entry and `TODO.md`'s narrative notes; summary:

1. **Vapi webhook secret was out of sync with Vercel's `VAPI_WEBHOOK_SECRET`** — every call was 401ing. Fixed by
   rotating one fresh secret onto both Vapi resources and Vercel, then redeploying; confirmed via `vercel logs`.
2. **The assistant's LLM provider had drifted to a broken `cerebras` config** (0 tokens returned every call).
   Reverted to `openai`/`gpt-4o-mini`.
3. **The real bug**: Vapi's `assistant-request` dynamic-config webhook never fires for a phone number with a
   fixed `assistantId` (every number this platform provisions has one) — so `{{systemPrompt}}`/`{{greeting}}`
   template placeholders always rendered empty on a live call, and **Demo Studio's "one number adapts per
   vertical" feature had zero effect on real calls since it was built**. Fixed by having
   `demo-customize/route.ts` push the rendered persona directly to the live Vapi assistant on every launch
   (`updateAssistantPersona()` in `vapiClient.ts`) instead of relying on the webhook path.
4. Also: removed a `Stop` hook printing a fixed message every turn; renamed the sign-in page to "Luxor Ops";
   moved the company portal nav to a left sidebar; added **Phase 8** (T-061–T-069, hardening/performance/
   discoverability) to `MASTER_PLAN.md`/`TODO.md`; then self-selected and completed **T-053** (retired dead
   `agentVoice` field), **T-059** (Twilio type debris removed, 3 docs archived), **T-068** (Calendar
   code-split, 276kB→104kB measured), **T-066** (new `Tooltip` component + applied to a reviewed control list,
   first component/DOM test in the repo).

Owner also confirmed intent to add a Canadian number to Vapi via **Twilio** specifically — already tracked as
part of T-054's scope (see `MASTER_PLAN.md`), just now provider-confirmed. Not started.

**Continuation, same session:** owner asked for the next task in the suggested Phase 8 order. **T-064**
(secrets hygiene) isn't CLI-doable (resending the full value is required to flip a var's type via `vercel env
update`), but the dashboard makes it a safe, no-re-entry click-through — narrowed to 7 genuine-credential vars.
Owner reviewed and said **skip for now** — deferred, not blocked (full click-through preserved in `TODO.md`).
**T-061** (enforce CSP + self-host fonts) completed instead: Inter moved off the `fonts.googleapis.com`
`<link>` onto `next/font/google`; `next.config.ts`'s CSP header flipped from `-Report-Only` to enforced, with
no directive widening needed. `tsc`/lint/build clean; full test suite 313/315 (2 known concurrent-load flakes,
isolated rerun clean).

**Continuation:** owner said go ahead with T-069 "and other easy things too" — **T-069** (static logos to
`next/image`; base64 photo path audited, already correct, no change needed) and **T-063** (new
`src/lib/auth/rateLimit.ts`, in-memory per-IP budget wired into the 3 public routes, burst tests per route)
both done. Skipped T-062/T-065/T-067 (each carries real risk or an open dependency — see `TODO.md`) rather than
self-select further without checking in. `tsc`/lint 0/20/build clean; full suite 324/325 (1 known flake,
isolated clean); release suite 16/16.

**Continuation — push/deploy verified, then a real field QR feature:** pushed to `origin/main`, confirmed the
Vercel production deploy healthy against the live URL (not just the build log). Owner then asked how a call
becomes a voice-loggable job and whether QR codes could help — traced the real pipeline and found QR access
already existed in code but only for the superadmin demo line; a real tenant's job page had no unauthenticated
field-access option. Built `POST /api/jobs/[jobId]/field-qr` + a **Field QR** button/modal on the job detail
page, reusing the existing signed one-time-grant primitive and the `qrcode` package Demo Studio already used.
Corrected `field-operations-guide.html`'s walkthrough to match. 9 new tests; `tsc`/lint/build/release-suite all
clean. Full detail in `TODO.md`. Pushed (`53a0965`) and confirmed deployed: Vercel build `Ready` in ~90s,
`/api/health` 200, `/login` 200, the new field-qr route correctly 401s unauthenticated, webhook auth unaffected.

**Live incident, same session — T-061's CSP had no `connect-src`, breaking login in production:** owner reported
`Firebase: Error (auth/network-request-failed)` on `/login` right after the above deploy. Root cause: the
enforced CSP (T-061) never declared `connect-src`, so it silently fell back to `default-src 'self'` — blocking
every browser fetch the Firebase client SDK makes (Auth's `identitytoolkit`/`securetoken` calls, Firestore
reads). This broke login for everyone and also silently broke every client-side Firestore read
(`AuthContext`'s `businessUsers` lookup, etc.). Fixed with `connect-src 'self' https://*.googleapis.com`
(covers Auth, Firestore, and Firebase Installations under one wildcard). Added a regression test to
`security-headers.test.ts` asserting `connect-src` is present and includes `googleapis.com`. Pushed (`9a0da8d`),
confirmed deployed, and verified the actual fix — not just the header — with a real browser (Playwright):
navigated to `/login`, ran an in-page `fetch` to `identitytoolkit.googleapis.com`, and confirmed it reached
Google (400 on a deliberately-bogus key/credentials, not a CSP-blocked network error) with zero CSP violations
in the console.

## 2026-08-27 — QoL & multi-vertical audit (Phase 7 added, no code changed)

Owner requested a broad quality-of-life pass — identify and answer only, no execution: split demo/onboarding
onto a dedicated hub/URL, tailor the client-facing look per industry, AI-document consistency, Vapi setup
clarity + a client talk-track, and research on newer voice models + Canadian phone numbers. Findings were
published as an Artifact ("Luxor Platform Audit") and turned into 8 fully-specced candidate tasks — **Phase 7,
T-053–T-060** — added to `MASTER_PLAN.md` in the same template every prior phase uses. See `HANDOFF.md`'s
matching 2026-08-27 session entry for the direct answers (voice models, Canadian numbers) and the full
findings-to-task mapping. **Phase 7 is queued, not assigned — owner prioritization is the next step**, same
posture Phase 6 held before 2026-07-23. Project memory (`~/.claude/projects/.../memory/`) was updated to point
future sessions at the artifact and to retire the now-stale "45% done" release-orchestration memory (that
backlog closed weeks ago).

## Product status

- Phases 0–6 are fully merged: 100% of the currently scoped audited release and UX/demo work. Phase 7: 3/8
  done (T-053, T-057, T-059). Phase 8: 6/9 done (T-061, T-063, T-065, T-066, T-068, T-069) — T-062 is half done
  (CI audit gate merged; the firebase-admin v14 half was attempted 2026-09-04 and reverted after a brief
  production incident, see above — stays open); T-064 deferred by owner choice; T-067 not started.
- Live check 2026-09-02, post-fix: phone line confirmed working end-to-end via a live test call (greeting,
  correct persona, tools) after the incident fixes above. `/api/health` returns `200`, Firestore `connected`,
  all six provider/runtime capabilities `configured`.
- This session's verification: `npx tsc --noEmit` clean, `eslint` clean (only pre-existing `<img>`/no-image
  warnings), full `npx vitest run` 313/313 real passes each run (the one recurring `example-lib.test.ts`
  failure is the long-documented concurrent-load flake, reconfirmed clean in isolation every time), `npm run
  build` green.
- Production sign-off still requires the authenticated/manual checks in `TODO.md#needs-human`.

## 2026-08-23 maintenance cleanup

- Removed eleven obsolete one-off scripts. The universal, guarded `/admin/demo` flow supersedes the old CLI
  customizer, activity/client seeders, and per-vertical tenant seeders; `provision-superadmin.mjs` supersedes
  the partial UID-only grant script; the broken TypeScript demo seeder was superseded by the retained ESM seeder.
- Removed the unused nested Vapi Vitest config; the root config already discovers those tests.
- Removed the unused `sendCrewAssignment()` wrapper. Assignment routes use `buildCrewAssignmentEmail()` with
  the ledger-backed communications service directly.
- Made implementation-only constants, schemas, error classes, helpers, and fixture types private. Retained
  `CallSession`, `CallMessage`, `UserBusinessMembership`, `SuperadminProfile`, `FieldAuditEntry`, and operation
  state types because they describe live/persisted domain data.
- Removed unused Tailwind/Autoprefixer/PostCSS direct dependencies and declared the directly imported
  `@eslint/eslintrc` package. Retained `pptxgenjs` because it generates the committed pitch deck.
- Applied all non-breaking `npm audit fix` updates, including Next.js 15.5.23. Audit moved from 30 findings
  (1 critical, 12 high, 17 moderate) to 23 (0 critical, 6 high, 17 moderate). Remaining production findings
  require separate major migrations (Next.js 16, Firebase 12, Firebase Admin 14); the pitch-deck generator adds
  two development-only high findings. Do not run `npm audit fix --force` as an incidental cleanup.
- Rewrote the active documentation index/testing guide, marked old onboarding/demo plans historical, and
  reconciled `TODO.md`, `HANDOFF.md`, `CLAUDE.md`, and `.env.example` with the current Vapi/universal-demo system.

## Verification

- `npm run type-check` — clean.
- Strict compiler (`--noUnusedLocals --noUnusedParameters --allowUnreachableCode false`) — clean.
- `npm run lint` — 0 errors / 24 existing warnings (improved from 26).
- `npm test` — 32 files / 304 tests passed.
- Release suite — 5 files / 16 tests passed.
- `npm run build` — green on Next.js 15.5.23; 48 routes generated.
- `knip` after cleanup — remaining reports are explained: three operational scripts, the string-loaded
  `eslint-config-next`, `pptxgenjs` for the manual deck generator, and eight protected/domain types. No
  unexplained unused runtime file, dependency, or export remains.
- `git diff --check` — clean.

## Retained operational scripts

- `scripts/seed-demo-business.mjs` — initialize the universal demo tenant.
- `scripts/provision-superadmin.mjs` — set custom claim and `businessUsers` record.
- `scripts/create-pitch-deck.cjs` — regenerate `public/Luxor-AI-Pitch.pptx`.

## 2026-08-25 vertical expansion

- Added `electricians`, `appliance-repair`, and `childcare` to `VERTICAL_TEMPLATES`
  (`src/lib/verticals/templates.ts`) — full template blocks (vocab, services, FAQs, emergency/booking rules,
  agent persona, icon/color). Electricians and Appliance Repair are jobs-mode (same shape as Roofing/HVAC/GC);
  Childcare is appointments-mode (same shape as Dental/Property Mgmt).
- Added the matching resource roster to `RESOURCES` in `src/lib/verticals/demoSeed.ts` — `demoSeedFor()`
  already derives jobs/calls/leads/appointments generically from the template, so that was the only demo-seed
  change needed.
- Wired `Zap`/`Wrench`/`Baby` into `VERTICAL_ICONS` in `src/app/admin/demo/page.tsx`.
- Updated `public/guides/onboarding-guide.html` (card count, industry list, quick-reference table) from seven
  to ten industries.
- Re-verified: `npm run type-check` clean, `npm run lint` 0 errors/24 warnings (unchanged), `npm run build`
  green (48 routes, unchanged), full `npm test` 32/32 files green on isolated rerun of the one known
  concurrent-load flake.

## Next actions

0. **Phase 9 (UI/UX Modernization) candidate next slices** — see `TODO.md`'s T-075/T-076/T-077 entries for the
   full list: a breadcrumb/back-link audit on nested pages beyond Jobs, a second look at Pipeline/Calls status
   filters as the option count grows, a `PageSkeleton` pass on the pages that don't yet use it, a further audit
   for other blocked-workflow dead ends beyond Calendar's crew-empty state and the Invoice tab's material/labor
   rows, and — the one that needs an owner product decision rather than a self-executable pick — whether to
   build a net-new manual "add appointment" flow so it can join Job/Crew/Material/Teammate in the quick-add
   picker (today appointments are voice-booked by Alice only).
0b. **Dead code flagged, not removed:** `POST /api/jobs/[jobId]/invoice` (`api/jobs/[jobId]/invoice/route.ts`)
    has zero callers anywhere in the app — the real invoice-generation logic is entirely client-side in
    `company/jobs/[jobId]/page.tsx`. Left in place pending an owner decision on whether to delete it or wire it
    up as a real API for some future integration.
1. **Review and prioritize the remaining Phase 7/8 backlog** (`MASTER_PLAN.md`, T-054–056/058/060 and
   T-062 firebase-admin half/T-067) — decide what to greenlight next; nothing remaining is assigned or started.
2. **NH-13**: owner to paste reference organizing/roofing apps for T-056's per-industry visual palette work.
3. Complete NH-1/NH-3/NH-4/NH-8/NH-11 production sign-offs. NH-1's Vapi-dashboard-config-matches-production
   concern is now substantially addressed by this session's incident fix, but the human dashboard review itself
   (assistant model/voice/retry/recording settings) is still outstanding.
4. **Dependency majors**: Next.js 16 (`postcss`/`sharp` findings) and the client `firebase` SDK v11+ (`undici`
   findings) still need dedicated migration work with full browser/provider regression testing. `firebase-admin`
   v14 was attempted 2026-09-04 and reverted after breaking production (`ERR_REQUIRE_ESM`, a known open upstream
   `jwks-rsa`/`jose` issue) — do not retry without an upstream fix or dedicated Vercel-runtime `require(esm)`
   testing; see the 2026-09-03/04 entry above.
5. **T-054 when picked up**: owner confirmed Twilio (not Telnyx) as the Canadian-number provider — buy the DID
   from Twilio, import into Vapi as bring-your-own-number.
6. Optional: a live click-through of the three newest verticals (Electricians, Appliance Repair, Childcare) in
   Demo Studio — now meaningfully testable end-to-end on a real call, since T-054's sibling fix this session
   made the Demo Studio → live-call persona push actually work.
