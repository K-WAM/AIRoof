# SESSION_HANDOFF.md — Current state

Updated: 2026-09-08 (Claude) — full end-to-end review of the roofing demo→job→invoice pipeline and the
client-onboarding→self-service-team-invite flow, ahead of a demo the following week. No code changed. Traced
every hop (Vapi call → webhook → 7 agent tools → Firestore; Pipeline → "Create Job" → prefilled Jobs form;
field voice/photo updates → `parseFieldUpdate` → `buildProjection` → `job.parsed` → invoice generation → Send;
onboarding wizard/fast-create → `businessUsers.active: true` (T-074's fix, re-confirmed present) → Settings
Team panel self-service invites) and confirmed the whole chain is connected and code-correct — nothing broken
found. Also caught that T-080 (previously marked "not yet pushed" here and in `HANDOFF.md`) is in fact already
on `origin/main` (`090dcea` == local `HEAD`) and live in production, though its Stripe payment-link feature is
non-functional there because `STRIPE_SECRET_KEY` was never added to Vercel. Six small gaps/polish items found
during the trace (none demo-blocking) were filed as `TODO.md`'s new Phase 11 (T-081–T-086); `TODO.md`'s
"Current snapshot" and `NEEDS-HUMAN` were updated with the corrected T-080 status and full findings — see
`TODO.md` for the complete list rather than duplicating it here.

Previous: 2026-09-07 (Claude), continued — T-080 (Phase 10, new) done, not pushed: Stripe Payment Links for
Luxor's own invoice billing (card/Apple Pay/Google Pay via a Stripe-hosted Checkout Session, no webhook — still
a manual "Mark paid"), plus a manual Twilio account-setup + Canadian-number/porting runbook added to the
onboarding guide (v2.5). Owner asked directly, in one message: had Canadian Twilio+Vapi steps been written
(no — see the T-055 entry below, that was never picked), how does payment actually get collected anywhere in
this app (nowhere — zero payment code existed before this), and Stripe or something easier. Answered plainly,
then let the owner pick scope off a menu rather than guess: "need to set up Twilio first" (docs-only, hold off
automation) and "Payment Links for our own billing" (not full webhook integration, not client-customer
collection). Added the `stripe` npm SDK and a `stripe` capability to `src/lib/config/env.ts` (shows up in
`/api/health` automatically). New `src/lib/billing/stripePayments.ts` builds a one-time Checkout Session from
an invoice's line items — each collapses to a fixed `quantity: 1` line rather than re-deriving Stripe's
`quantity` from the invoice's own (sometimes fractional, e.g. "3.5 labor hours") quantity field, since Stripe
requires a positive integer there. New superadmin-gated `POST /api/admin/invoices/[invoiceId]/pay-link`
persists the link on the invoice so reopening it doesn't spawn a second Checkout Session; `/admin/invoices`
gained a "Generate payment link" button, and the send-email route now renders a "Pay now →" button when one
exists. Two new public pages, `/pay/success` and `/pay/cancelled`, are Checkout's redirect targets (the payer
is a client, not a portal user, so these can't sit behind `verifySuperadmin`). Full detail, including exactly
why the fractional-quantity collapse matters, in `TODO.md`'s T-080 entry. `tsc`/lint(0/21) clean, `vitest run`
462/462 (up from 450, all new, zero flakes this run — including a fix to a pre-existing `env.test.ts` case that
needed the new `STRIPE_SECRET_KEY` stubbed alongside its existing ones), `next build` green with both `/pay/*`
pages and the new route present. Not pushed — awaiting owner review.

Previous: 2026-09-07 (Claude), continued — T-055 (Phase 7) done, pushed: split Demo Studio, the onboarding
wizard, and Playbooks out of `/admin/*` into a new `/hub/*` route group (Businesses/Usage/Invoices stay in
`/admin`). Owner picked this off a 3-option menu of Phase 7's remaining tasks (T-054/T-055/T-058) — each
genuinely needed a call, and T-055 was the one with no external dependency (no live Twilio credential, no PDF-
library choice). Moved the three page directories via `git mv` (history preserved); new `src/app/hub/layout.tsx`
+ `hub-nav.tsx` reuse the exact same superadmin gate and CSS as `/admin` — re-route/re-skin, not a redesign, per
the spec. `src/middleware.ts` now gates `/hub` too; old links 307-redirect via a new `next.config.ts`
`redirects()` (confirmed live in a real build's `routes-manifest.json`). Updated every doc where the old path
was current instruction (`CLAUDE.md`, `docs/ADMIN-ONBOARDING.md`, `docs/ADMIN-QUICK-START.md`,
`docs/TESTING.md`, `docs/README.md`, the onboarding guide's 6 literal URLs) — left `docs/HANDOFF.md` alone since
it's already stale in unrelated ways (historical, not current). No Next e2e harness exists here, so a new
`middleware.test.ts` + `next-config-redirects.test.ts` stand in for the spec's route test. Full detail in
`TODO.md`'s T-055 entry (nested under Phase 7) and `MASTER_PLAN.md`'s T-055 spec. `tsc` clean (after clearing a
stale `.next/types` cache from the pre-move build), lint 0/21, `vitest run` 450/450 (up from 442, +8 new; same
3 pre-existing concurrent-load flakes reconfirmed clean in isolation), `next build` green. **Pushed and live**
(2026-09-07, owner said "commit and push to github") — this push also carried T-079, previously local-only;
see the Repository section below for the production redirect re-verification.

Previous: 2026-09-07 (Claude) — T-079 (Phase 10, new) done, not pushed: superadmin client management — a
"+ Client" quick-create modal, seat-capped team invites with CSV bulk import, recurring Luxor invoice
drafting, and a subscription pause/resume that locks a client's dashboard only (owner confirmed up front:
never the phone agent). Owner: "add a really smooth way for me set up new clients... + client account...
they get one license, and they can +users manually... or they can upload a csv... monthly recurring
invoice... pause their subscription for non payment... superadmin of a company can only see their company."
Almost entirely linking/extending existing plumbing (business creation, `TeamPanel`, Luxor invoices,
`useBusinessModules`'s existing Firestore read) rather than new subsystems — a shared `inviteTeamMember()`
helper now backs both the single-invite and new bulk-CSV routes, and a shared `nextLuxorInvoiceNumber()`
helper backs both the manual invoice editor and the new daily recurring-invoices cron (drafts only, never
auto-sends). Full detail, including the `FieldValue.delete()` vs. plain-`undefined` gotcha found while
building the pause/resume route, in `TODO.md`'s T-079 entry. Also updated `public/guides/onboarding-guide.html`
(fast-path callout, CSV/seat-limit notes, new "Phase 6 — Ongoing Account Management" section, two
troubleshooting rows, v2.4) in the same pass. `tsc`/lint(0/21) clean, `vitest run` 442/442 (up from 428, all
new), `next build` green with every new route present. **Pushed and live** (2026-09-07) — see the Repository
section below.

Previous: 2026-09-06/07 (Claude), continued — T-078 (Phase 9, fourth slice) done: added Junk & Trash Removal as
the platform's 11th vertical (jobs-mode, agent "Dusty", full FAQ/emergency/booking rule set — tsc's
`Record<VerticalId,…>` exhaustiveness check caught both required consumers, `VERTICAL_ICONS` and demoSeed's
`RESOURCES`, immediately), plus a Calendar readability pass. Audited "what's draggable" first: the jobs-vs-
appointments split plus per-vertical `vocab.resourceNoun` already gives roofers Crews, dentists Providers,
childcare Sitters — the distinction the owner described already exists, so the real fix was the cards
themselves. Found a genuine gap: scheduled job tiles showed no time at all (the appointments-mode equivalent
already did) even though `scheduledStart`/`scheduledEnd` were already being set — fixed by surfacing data that
already existed, not adding new state. Enlarged the whole grid (column widths, day-cell height, rail width,
fonts) for the "large enough to be easily readable, modern view" ask. Full detail in `TODO.md`'s T-078 entry.
`tsc`/lint(0/21) clean, `vitest run` 424/424 (3 pre-existing concurrent-load flakes, clean in isolation),
release suite 16/16, `next build` green.

Previous: 2026-09-06 (Claude), continued — T-077 (Phase 9, third slice) done: audited the invoice/materials/
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
- Pushed baseline: `origin/main` is at `472d14f` (2026-09-07, owner said "commit and push to github") — a
  single combined commit carrying T-079 (Client Management) and T-055 (hub split), on top of `0e08e3e` (T-078,
  pushed in an earlier session). Vercel's GitHub auto-deploy reached Ready (confirmed via `vercel inspect` on
  the specific new deployment, not just the deployments list — an earlier `vercel ls`-based check in this same
  session gave a false-positive "Ready" by matching an older deployment row instead of the new one, caught and
  corrected before relying on it). Production re-verified post-deploy: `/api/health` → `200`/`"connected"` with
  all six capabilities `configured`, unauthenticated webhook `POST` → `401`, `/login` → `200`, and — the actual
  point of this deploy — `/admin/demo`, `/admin/onboarding`, and `/admin/guide` each confirmed `307` to their
  new `/hub/*` destination directly against production (not just locally). **T-080 (Stripe payment links +
  Twilio runbook), built immediately after in the same session, is local-only** — not yet approved for push.
- **Live Vapi assistant config was changed directly via API this session (T-060)** — independent of git/Vercel
  deploys. Assistant `9267a84a-0f4f-416b-a328-1dc539f5265e` now runs `model: openai/gpt-realtime-2025-08-28` +
  `voice: openai/cedar`, up from `vapi/Savannah` + `gpt-4o-mini` (a pre-existing config this session found was
  already undocumented — see the 2026-09-05 T-060 entry below). Rollback snapshot saved outside the repo
  (session scratchpad), not in git.
- Vercel: deployed via the GitHub-integration auto-deploy on each push to `main`.
- No worker branches, active worktrees, or development blockers otherwise.
- Untracked in the working tree: `example image irrigation.png` (repo root) — the owner's T-056 reference
  screenshot, not an app asset; not added to git. Delete or relocate on request.

## 2026-09-07 — T-079: superadmin client management (Phase 10, new)

New session, new phase — not a continuation of Phase 9's UI-modernization slices. Owner: "add a really smooth
way for me set up new clients, like a new client tab where I click + client account, and a form pops up for me
to input the info required of the business... use existing tools where possible since we already have
invoicing... one license, and they can +users manually by filling out a form and submitting per user, or they
can upload a csv... set them up on a monthly recurring invoice, and I can pause their subscription for non
payment... superadmin of a company can only see their company." Investigated first and found most of the
plumbing already existed (business creation, `TeamPanel`, Luxor invoices, tenant-isolation rules) — planned and
built this as linking/extending those, not new subsystems. Confirmed one product decision with the owner before
building: pausing a subscription locks the client's dashboard only, never the phone agent.

**Client creation:** a `+ Client` quick-create modal (`admin/businesses/NewClientModal.tsx`) posting to the
existing `POST /api/admin/businesses`, now also accepting `address`/`employeeCount`/`seatLimit`. Faster than
the full 6-step `/admin/onboarding` wizard (still available as "Advanced setup") because it leaves every
agent-specific field on its existing template/plan-preset default.

**Team & seats:** extracted the single-invite logic (find-or-create Auth user, upsert `businessUsers`, email a
branded reset link) out of `POST /api/company/team` into a shared `inviteTeamMember()` helper
(`src/lib/team/invite.ts`), so a new `POST /api/company/team/bulk` (CSV import, capped 200 rows/request) reuses
it instead of duplicating it. Added a `seatLimit` field (default 5) enforced uniformly for owner and superadmin
alike. `TeamPanel.tsx` (already shared between the company Settings page and, new this session, mounted a
second time unmodified on the admin Config page) gained a dependency-free CSV `email,role` parser with a
preview/results table.

**Subscription pause + billing:** a superadmin-gated `POST /api/admin/businesses/[id]/subscription` route
flips `subscriptionStatus` between `active`/`paused`. Found and fixed a real gotcha while building it: the
Admin SDK's `ignoreUndefinedProperties` (see CLAUDE.md) silently *strips* a plain `undefined` field from a
write instead of clearing it, so "resume" has to use `FieldValue.delete()` to actually clear `pausedAt`/
`pausedReason` — a plain `undefined` would have left stale data behind. The pause itself is enforced by
extending `useBusinessModules()`'s existing single Firestore read (industry + `subscriptionStatus` now cached
together) and reusing `company/layout.tsx`'s existing `blockedModule` short-circuit pattern for a full-page
"Account paused" screen — superadmin (including `?preview=`) always bypasses. `LuxorInvoice` gained an optional
`businessId` link; `/admin/invoices` prefills from a `?businessId=` deep link off the Config page's new
"Generate invoice" button (wrapped in `Suspense` — `admin/layout.tsx`, unlike `/company/*`, has no ancestor
Suspense boundary for `useSearchParams`). A shared `nextLuxorInvoiceNumber()` helper
(`src/lib/billing/invoiceNumber.ts`) now backs both the manual invoice editor and a new daily
`/api/cron/recurring-invoices` cron, which **drafts only, never auto-sends** — the owner still reviews and
clicks Send — and only acts on clients with `billing.autoInvoice` explicitly opted in.

Also updated `public/guides/onboarding-guide.html` (fast-path callout before Phase 1, CSV/seat-limit notes in
Phase 4, a new "Phase 6 — Ongoing Account Management" section, two new troubleshooting rows, version → 2.4).

**Verified:** `tsc` clean; lint 0 errors/21 warnings (unchanged baseline); `vitest run` 442/442, up from 428 —
14 new tests covering seat-limit rejection/fallback, CSV bulk-import per-row outcomes (including hitting the
seat limit mid-batch), the pause/resume route's audit-event + `FieldValue.delete()` behavior,
`nextLuxorInvoiceNumber` monotonicity, and `useBusinessModules`'s new `subscriptionStatus` resolution/caching
(including migrating one pre-existing test off the old bare-string sessionStorage cache format, with a
dedicated legacy-cache-fallback test added so that migration doesn't silently regress); `next build` green,
every new route present in the route table. Full detail in `TODO.md`'s T-079 entry. **Pushed and live**
(2026-09-07, owner approved) — see the Repository section above for the production verification.

## 2026-09-06/07, continued — T-078: Junk & Trash Removal vertical + Calendar readability pass

Direct continuation of T-077, same session. Owner: "one of the client types should be junk / trash removal.
that's a big potential one. the calendar is tricky to tailor, so like for roffers, crews make sense, but for
dog walkers, different, and for dentists, etc. really put thought into what is draggable in the calendar, also
make sure its clear and that work assigned has associated times visible, and that the calendar is large enough
to show easily readable, modern view."

**Part 1 — Junk & Trash Removal, the 11th vertical.** Added a full `VerticalTemplate` block to
`src/lib/verticals/templates.ts`: jobs-mode, `family: "field"`, vocab (`jobNoun: "Pickup"`,
`resourceNoun: "Crew"`), realistic FAQs (what they don't take — hazmat, asbestos — pricing by volume,
same/next-day availability), trade-tuned emergency rules (hazardous materials get flagged for manual review
rather than auto-booked; hoarding situations get a compassionate escalation; eviction/move-out deadlines get
same-day priority), agent "Dusty", icon `Trash2`, color `#c2410c` — checked against all 10 existing palette
values first so it's genuinely distinct, not just picked. Adding `"junk-removal"` to the `VerticalId` union did
exactly what CLAUDE.md's design promise says it should: `tsc` immediately failed on every
`Record<VerticalId, …>` consumer until handled — `VERTICAL_ICONS` in `admin/demo/page.tsx` and `RESOURCES` in
`verticals/demoSeed.ts` (5 truck-crew demo names: Truck 1/2 Crew, Cleanout Crew, Heavy Haul Team, Same-Day
Crew). One thing `tsc` couldn't catch: `family-palette.test.ts` hardcoded
`expect(byFamily.field).toHaveLength(7)` — now 8, since junk removal joins the "field" family. Updated
`public/guides/onboarding-guide.html` throughout — card count ("ten"→"eleven" in 4 places), the Demo Studio
industry list, the field-service summary table, the "swap table" walkthrough (added a Junk Removal row with a
realistic caller line and voice-note script), and the colored vertical-card pitch grid — the same reconciliation
CLAUDE.md's 2026-08-25 3-vertical-expansion entry describes, just for one vertical. Grepped for any other
hardcoded per-industry list outside these spots — found none.

**Part 2 — Calendar: draggable-content audit + a real gap fix + sizing/legibility.** Audited what's actually
draggable before assuming a redesign was needed: `calendarMode` (jobs vs. appointments) plus each vertical's
`vocab.resourceNoun` already differentiate "roofers drag jobs onto Crews" from "dentists drag bookings onto
Providers" from "childcare drags bookings onto Sitters" — the roofer/dog-walker/dentist distinction the owner
described is the same jobs-vs-appointments split the platform already has. So the actual fix was making the
cards clearer and fixing what they were missing, not building a third calendar mode.

Found a real, concrete gap in "times visible": `ScheduledTile` (the jobs-mode crew×day card) showed only the
job ID and title — no time — even though `job.scheduledStart`/`scheduledEnd` were already real fields, set the
moment a job is dropped onto a crew+day. The appointments-mode equivalent (`ScheduledApptTile`) already showed
its time; jobs mode was the one silently missing it. Fixed by surfacing data that already existed (a
start–end range), not adding anything new. Also added the appointment's `serviceType` as a second line on
`ScheduledApptTile` so a placed booking reads as clearly as a placed job.

Sizing/legibility, all deliberate reviewed increases sized to the now-larger tile content (time + title +
id/footer + action row), not a blanket scale: crew×day grid column widths (140px→168px resource column,
150px→190px min day columns, 700px→900px grid floor), day-cell minimum height (64px→116px), the unscheduled/
unassigned rail (220px→260px wide, 560px→680px scroll height), and tile/label font sizes (11-12px→12-13px body
text). Today's date now renders as a filled accent circle — the same convention Google/Apple Calendar use —
instead of just a colored number.

**Verified:** `tsc` clean (the `Record<VerticalId,…>` exhaustiveness check caught both required consumers
immediately, exactly as designed); lint 0 errors/21 warnings (unchanged baseline); `vitest run` 424/424 (3
pre-existing concurrent-load flakes — `send.test.ts`, `example-lib.test.ts`, `registry.test.ts` — reconfirmed
clean on an isolated rerun); release suite 16/16; `next build` green (`/company/calendar`'s route entry is
unchanged at 104kB since `CalendarBoard` is code-split per T-068 — size growth there is invisible to the route
table by design). **Honest limit:** could not do a live authenticated visual check in this sandbox (no real
Firebase credentials, the same standing limitation documented throughout this session) — verified by careful
review of the grid-column/cell-height arithmetic instead of a screenshot; worth an owner glance at the live
Calendar after this ships to confirm it reads as intended. Committed locally; push pending owner confirmation.

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
with real new logic; every other route unchanged). **Pushed and live** (2026-09-06, owner approved) —
`origin/main` now at `9eda6ad`; Vercel's auto-deploy reached Ready and production was re-verified healthy
post-deploy (`/api/health`, `/login`, webhook 401) — including the two newly-gated endpoints, both confirmed
`401` unauthenticated in production.

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

0. **Phase 9 (UI/UX Modernization) candidate next slices** — see `TODO.md`'s T-075/T-076/T-077/T-078 entries for
   the full list: a breadcrumb/back-link audit on nested pages beyond Jobs, a second look at Pipeline/Calls
   status filters as the option count grows, a `PageSkeleton` pass on the pages that don't yet use it, a further
   audit for other blocked-workflow dead ends beyond Calendar's crew-empty state and the Invoice tab's material/
   labor rows, and — the one that needs an owner product decision rather than a self-executable pick — whether
   to build a net-new manual "add appointment" flow so it can join Job/Crew/Material/Teammate in the quick-add
   picker (today appointments are voice-booked by Alice only).
0c. **T-078's Calendar changes need a live visual glance** — sizing/font increases were verified by reviewing
    the grid arithmetic, not a screenshot (no real Firebase credentials in this sandbox to log in and see it
    rendered). Worth a quick owner look at the live Calendar (any vertical) after this ships.
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
