# NO-TRAINING-UX-PLAN.md — the workflow is the tutorial (T-144, T-145)

Written 2026-09-27 by the integrator (Claude) for Codex to execute. Owner direction: the product's main sales claim is
**"no training needed"** (the competitor story: $10–15K setup, 2 days of training, then weekly training for a year).
That claim is only true if every screen explains itself. This plan turns it into concrete, testable work.

Two tasks, **run in order** (they touch the same pages):

| Task | What | Model | Worktree / branch |
|---|---|---|---|
| **T-144** | Shared primitives (EmptyState, BlockedAction href, setup checklist) + every empty state + replace the "read the Guide" nudge | GPT-5.5 Terra, medium | `D:/Apps/air-wt-empty-states` / `task/empty-states` |
| **T-145** | Page-by-page roofing pass: one primary action per screen, prerequisite guards, plain words, Guide rewrite, declutter | GPT-6 Sol, medium | `D:/Apps/air-wt-ux-workflow` / `task/ux-workflow` — cut from `main` **after T-144 merges** |

Paste-ready prompts: `docs/WORKER_QUEUE.md` section **F**.

---

## 1. Who we are designing for

Assume the user:
- reads **nothing** — no helper paragraphs, no Guide, no tooltips;
- taps **the biggest button** on the screen;
- is often on a **phone**, outside, in sun glare, possibly with gloves (crew), or at a desk juggling calls (office);
- is **not technical** and will conclude "it's broken" the moment a screen is blank, a button does nothing, or a
  word is unfamiliar.

Personas to walk every screen as (all exist in the smoke harness, `docs/SMOKE-HARNESS.md`):
**Owner** (`owner@roofing.e2e.test`, desktop + phone), **Office staff** (`staff@…`), **Crew** (`crew@…`, phone only,
`/company/field` and the `/field` QR screen), **Viewer** (`viewer@…`, read-only), and — new in T-144 — a **brand-new
owner with an empty account** (`owner@empty.e2e.test`).

The standard behind this plan: `D:\Apps\0 - Coding Standards & Specs\App Design Specification for Clear, Minimal,
High-Trust Products.md` and the pass/fail list in `docs/ROOFING-DEMO-UX-REVIEW.md` ("What decluttered and modern
means"). This plan adds the rules below on top of those.

## 2. The rules (pass/fail — reject any screen change that breaks one)

1. **One job, one primary button.** Every screen, card and tab answers "what do I do here?" in one short line and
   has exactly ONE `.button.primary`. Everything else is secondary/ghost. (T-145 adds an automated check.)
2. **Empty is never blank.** Every list, panel or tab that can be empty shows the shared `EmptyState`: what goes
   here (title), where it comes from (one line, optional), and ONE button that fills it. Never "All caught up" for
   an account that has never had a call or job.
3. **No dead ends.** A control whose prerequisite is missing must never silently fail, sit disabled with no
   explanation, or bounce to an error. In priority order:
   - **a. Show the next step instead of a locked door.** No crews yet? The Calendar shows "Add your first crew",
     not an empty grid with a disabled drag.
   - **b. If the blocked control must stay (it's what they came for), keep it tappable.** Tapping shows the inline
     `BlockedAction` card right there: one plain sentence + ONE button that fixes it — in place (quick-add) when
     possible, otherwise a link straight to the exact place.
   - **c. Never explain a prerequisite with a hover tooltip.** `Tooltip` is hover-only and deliberately suppressed on
     touch devices (see its doc comment) — a phone user never sees it. Tooltips stay reserved for icon-only
     buttons. A disabled button + tooltip = an invisible dead end for our users.
4. **Role-aware.** Never show a button the current role can't use. Viewer: no create/send/assign buttons; empty
   states say "Ask the owner to …" with no button. Crew: no office actions (the crew can't complete a job — owner
   decision). A button that would 403 is a bug.
5. **Industry-aware.** All nouns from `useBusinessModules().vocab` (`jobNoun`, `resourceNoun`, `customerNoun`…);
   jobs-only content gated by `isEnabled("jobs")`; Calendar copy follows `calendarMode`. Never hardcode "crew",
   "job", "roof". Dental must read correctly too (CLAUDE.md Industry-Applicability rule).
6. **Plain words.** Buttons are verbs ("Add a crew", "Send quote"), never nouns ("Crews"). Helper lines ≤ 12 words.
   No internal words (`propertyType`, `reportOptions`, "provisional", "projection"). No "Read the Guide" / "Learn
   more" as a call to action inside a workflow screen.
7. **Design system.** One teal `var(--accent)`, `.button` variants, tokens in `globals.css` — no inline hex (the
   current empty states use `#888`/`#94a3b8`; those go). 375 px with no horizontal scroll; tap targets ≥ 44 px.
8. **The Guide is the safety net, not the path.** It stays in the nav under Help, gets shorter (T-145), and nothing
   in the workflow depends on anyone reading it.

## 3. T-144 — primitives, empty states, first-run setup

### 3.1 Shared primitives (build first, unit-test)

- **`src/components/ui/EmptyState.tsx`** — props: `icon?` (lucide icon), `title` (required), `body?`, `action?`
  (`{ label, href? , onClick? }` — exactly one of href/onClick), `secondary?` (`{ label, href?, onClick? }`),
  `compact?` (inside a tab/panel), `testId?`. Renders a centered block with `.empty-state` tokens (new, in
  `globals.css`: muted icon, title, body, action row). Action renders as `.button primary`, secondary as a ghost
  button/link. No action passed → no button (the viewer case). Tests: renders title/body, href vs onClick, no-action
  variant, `compact` class.
- **`BlockedAction`** (`src/components/ui/BlockedAction.tsx`) — add optional `href` (renders a `Link` styled as the
  primary button) as an alternative to `onAction`; keep the existing API working (CalendarBoard uses it). Test both.
- **`src/lib/onboarding/setupChecklist.ts`** — pure `setupChecklist(input, modules, vocab) → SetupItem[]`,
  `SetupItem = { id, label, done, href, cta }`. Items, in order, each skipped when its module is disabled:
  1. `phone` — "Your phone line is connected" (done when the tenant has an ElevenLabs agent/number or Vapi IDs).
     Not done → no client action (Luxor does this at setup): show "Luxor is connecting your line" with no button.
  2. `prices` — "Add your prices" (done when Library pricing or work catalog has ≥ 1 item; skipped when `pricing`
     is disabled) → `/company/library` (prices section), cta "Add prices".
  3. `resource` — "Add your first {resourceNoun}" (done when crews/resources ≥ 1) → Library crews, cta "Add {resourceNoun}".
  4. `logo` — "Upload your logo" (done when a library logo or legacy `logoUrl` exists) → Library Branding, cta "Upload logo".
  5. `team` — "Invite your team" (done when active team members ≥ 2) → `/company/team`, cta "Invite someone".
  6. `testCall` — "Make a test call" (done when calls ≥ 1) → `tel:` the business line, cta "Call your line".
  Unit tests: each item's done/not-done, module skipping (dental: no prices-if-disabled; appointments-mode noun),
  order, all-done → every `done: true`.
- **`GET /api/company/setup-status?businessId=`** — owner/staff/superadmin (`verifyAuthAndRole`); returns the raw
  inputs (booleans/counts) using Firestore `count()` aggregations and single doc reads — never full collection
  reads. `jsonWithCache(data, "noStore")` (never `public`/`s-maxage` — Cache-Control rule). Route tests: auth,
  wrong tenant 403, counts → booleans, a tenant with nothing.

### 3.2 First-run Dashboard

- **Remove** `FirstLoginGuideNudge` ("Take the quick Guide tour") from `src/app/company/layout.tsx` (delete the
  component + `guide-nudge-storage.ts` + update `workflow-click-paths.test.ts`). It is the opposite of the claim.
- **Add** a `SetupChecklist` card at the top of the Dashboard for **owner and superadmin (preview) only**, shown while
  any item is not done: title "Get your business ready — {done}/{total}", one row per item (check icon when done,
  otherwise its cta button). "Hide for now" collapses it to one line ("Setup 4/6 · Continue") — per-user
  `localStorage`, wrapped in try/catch, the page must work without it. All done → the card disappears for good.
  Note for the owner: Luxor's paid setup is meant to hand the client a checklist that is already complete; in
  `?preview=` the superadmin sees exactly what is left.
- **Dashboard feed empty states** (replace the unconditional "All caught up"):
  - never had a call AND setup incomplete → nothing extra (the checklist is the page's job);
  - setup complete, never had a call → EmptyState "Your phone line is ready" / "Call {business phone} to hear your
    AI receptionist — the call shows up here in seconds." / action "Call your line" (`tel:`); desktop shows the
    number large;
  - has history, nothing pending → keep "All caught up — nothing urgent right now."
- **Agent Setup panel**: leave its data as is in T-144 (T-145 decides its fate).

### 3.3 Empty-state inventory (every one uses `EmptyState`, copy is a starting point — keep it ≤ 12 words a line)

| Screen / area | Condition | Title | Body | Primary action (role-gated) |
|---|---|---|---|---|
| Pipeline | no leads or appointments ever | "New requests land here" | "When a customer calls, the AI takes their details and the request waits here for you." | "Make a test call" (`tel:`) |
| Pipeline tab | this tab empty, others not | "Nothing here right now" | — | "Show all" (switch tab) |
| Calls | no calls | "No calls yet" | "Every call shows up here within seconds, with a summary." | "Call your line" (`tel:`) |
| Calendar (jobs mode) | no crews | "Add your first {resourceNoun}" | "Then drag {jobNounPlural} onto their day." | "Add {resourceNoun}" — convert the existing `BlockedAction` |
| Calendar (jobs mode) | crews, nothing to schedule | "Nothing to schedule" | "{jobNounPlural} you create show up here to drag onto a day." | "Review requests" (Pipeline) if requests are waiting, else "New {jobNoun}" |
| Calendar (appointments mode) | the same two cases with providers/bookings | vocab-driven | vocab-driven | same pattern |
| Jobs list | zero jobs | "No {jobNounPlural} yet" | "Accept a request in Pipeline, or add one yourself." | "Review requests ({n})" when n > 0 requests wait, else "New {jobNoun}" |
| Jobs list | filter/search empty | keep today's text | — | "Clear filter" |
| Job › Activity | no field notes | "No field notes yet" | "Send the field link; the crew talks, it fills in here." | the existing "Field QR" / "Copy field link" action |
| Job › Photos | none | "No photos yet" | "The crew adds them on site, or add one here." | "Add photo" (existing capture control, if office can add) |
| Job › Materials / Labor | none | "Filled in from field notes" | "When the crew says “used 12 bundles”, it appears here." | "Add manually" only where a manual add exists |
| Job › Findings | none | "What did you find?" | "Pick from your Library or add your own." | the existing Library picker |
| Job › Quote / Report / Invoice | nothing yet | keep the current (good) copy, move it into `EmptyState` | — | the tab's existing create/add action |
| Customers | none | "No {customerNounPlural} yet" | "They're added automatically when you accept a request." | "Add {customerNoun}" |
| Library › prices | none | "Add your prices once" | "Quotes and invoices fill in from these automatically." | "Load example prices" (existing starter-kit call) + secondary "Add a price" |
| Library › crews | none | "Add your first {resourceNoun}" | — | "Add {resourceNoun}" |
| Library › logos | none | "Upload your logo" | "It goes on every quote, invoice and report." | "Upload logo" |
| Library › documents | none | "No documents yet" | — | the existing upload action |
| Team | only the owner | "Just you so far" | "Invite your office and crew — they get an email and set a password." | "Invite someone" |
| Field screen (crew) | no jobs for this crew | "No jobs for you today" | "When the office assigns you one, it appears here." | none (crew can't create jobs) |

Viewer: same titles, bodies say "Ask the owner to …", no buttons. Dental owner: vocab reads correctly everywhere.

### 3.4 Test rig for empty states

- `scripts/e2e/config.cjs` + the seed: a fourth tenant **`e2e-empty`** ("Fresh Roofing Co", roofing, phone line
  configured, **no** library, crews, logos, jobs, calls, customers) and one account `owner@empty.e2e.test` (same
  password). Do not change the other tenants' seed data.
- `e2e/empty-states.spec.ts` (desktop + phone): as the empty owner, visit every screen in the table, assert the
  EmptyState title and its button are visible, click each primary action and assert it lands on the right place (or
  opens the right quick-add); screenshot each (`test-results/screens/<project>/empty-*.png`). As the roofing viewer,
  assert no create/send button appears in any empty state. As the dental owner, spot-check one vocab string.
- The setup checklist: empty owner sees it with 1/6 or 2/6 done; complete the prices item via the starter kit in the
  spec and assert the count goes up.

### 3.5 Out of scope for T-144

Button hierarchy, copy on populated screens, the Guide page, the Agent Setup panel, Pipeline card clutter — all T-145.
No logic changes to money, auth, webhooks, voice, `agentTools.ts`, document content rules. No new dependencies.

---

## 4. T-145 — page-by-page roofing pass ("the workflow is the tutorial")

Starts from `main` after T-144 merged; uses T-144's `EmptyState`, `BlockedAction`, checklist.

### 4.1 Method

1. `npm run e2e:up:bg`, then `npm run e2e:call` so the roofing tenant has a real, busy job (J-1000+).
2. Walk the **golden path** as the personas, at 375 px and 1280 px, and write down every step:
   call comes in → request in Pipeline → Review request → Confirm & create job → assign a crew on the Calendar →
   crew opens the field link → crew logs a note (English and Spanish), a photo, a finding → office sees it on the job
   → Quote → send → Report → send → Invoice → send → Mark paid.
   For each step record: taps needed, whether the NEXT action is a visible primary button on the current screen, any
   dead end / blank screen / error, any unfamiliar word.
3. Record findings in **`docs/UX-PASS-FINDINGS.md`**: one row per finding — screen, persona, finding, severity
   (`blocks-path` › `confusing` › `clutter` › `polish`), fix, before/after screenshot paths.
4. Fix every `blocks-path`, `confusing` and `clutter` finding within the rules and guardrails; fix `polish` only when
   it is a one-liner. One commit per screen. Anything that needs a product decision → "QUESTION FOR INTEGRATOR", do
   the safe part, keep going.

### 4.2 Decisions already made (do not re-open — apply them)

- **Prerequisite guidance = inline `BlockedAction`, never tooltips** (rule 3). Known chains to check and fix:
  - Assign a crew when none exist (job page and Calendar) → "Add a crew first" quick-add in place.
  - Send quote/invoice/report with no customer email → a `BlockedAction` with an inline email field that saves to
    the job (and customer) and then continues; never a dead Send button.
  - A material with **no price on file** (job page Materials/Invoice rows) today explains itself only in a hover
    `Tooltip` — invisible on phones. Replace with visible inline text + an "Add price" button.
  - Report with nothing to say (no findings, no notes) → the Report tab's empty state points to Findings.
  - Quote: "+ Add item" already creates the finding — keep it the primary action; no extra prerequisite.
  - Team invite at the seat limit: the API message today says "Raise the seat limit in Client Config" — a
    superadmin instruction shown to a client owner who has no such screen. Client-facing copy: "You're using all
    {n} seats on your plan. Ask Luxor to add more." + a button that opens the existing Feedback form. (Superadmin
    keeps the Client Config hint.)
  - Any button that returns 403 for the current role → hide it for that role instead.
- **Pipeline card clutter**: the list card shows at most two buttons — primary "Review request", secondary "Call
  back". Confirm / Decline / Create job live inside the Review request card, where the details are (T-113 design).
- **Dashboard**: Needs Attention stays the busiest thing. The read-only "Agent Setup" panel becomes one compact status
  line ("Phone line: Live · English & Spanish · Settings ›") or moves into Settings — it must not compete with the
  feed. The setup checklist (T-144) owns setup.
- **Jobs list**: "New {jobNoun}" is the only primary; Export CSV and Field view become secondary/ghost.
- **Job page**: the "Next: … →" button is the single primary on the header; tab labels stay numbered; any second
  primary on a tab is demoted.
- **Guide page** (`/company/guide`) rewrite: today it is stale (it still says "click Generate Invoice / Generate
  Report" — the report now drafts itself and the invoice is "Create draft"). Replace with **"How it works — 5
  steps"**, one line + one button per step into the real screen: 1 Your line answers every call → Calls;
  2 Accept or decline each request → Pipeline; 3 Put the {resourceNoun} on the calendar → Calendar; 4 The crew logs
  the work by voice, English or Spanish → a job's field link; 5 Send the quote, report and invoice → Jobs. Then a
  "Talk to us" box: the Luxor support email + the Feedback button (and a support phone number only if the owner
  provides one — NEEDS-HUMAN; never invent one). Vocab/module-gated like today. Keep the per-industry how-tos only
  if they are still accurate and short; otherwise delete them.
- **Words**: rename internal/technical labels on screen; keep code identifiers unchanged.

### 4.3 Automated guard: one primary per screen

Add to `e2e/smoke.spec.ts` (same pattern as `KNOWN_PHONE_OVERFLOW`): for every page already visited, count visible
`.button.primary` elements inside `main` (exclude modals/sheets that are closed) and assert ≤ 1, with a
`KNOWN_MULTI_PRIMARY` allow-list for genuine exceptions (each with a one-line reason). The list should shrink to
empty by the end of T-145 or each remaining entry must be justified in `UX-PASS-FINDINGS.md`.

### 4.4 Guardrails (what T-145 must NOT do)

- No new pages; never remove a nav destination (Navigation Completeness Rule); dead pages redirect.
- No changes to money math, auth/roles logic (hiding a button is UI — changing who is allowed is not), webhooks,
  voice, `agentTools.ts`, the price-free report rule, notices approval logic.
- No global restyle (T-129 just fixed phone overflow — `KNOWN_PHONE_OVERFLOW` must stay empty); no new
  dependencies; no per-page inline button styles.
- Don't rewrite a screen to "fix" it — smallest change that satisfies the rules.

### 4.5 Done means

- `docs/UX-PASS-FINDINGS.md` complete with before/after screenshots for every fixed finding.
- The golden path walked again after the fixes: every step's next action is a visible button on the screen before it.
- Gates: `tsc`, eslint (changed files), full `vitest run`, full `npm run e2e:test` green (desktop + phone),
  `npm run e2e:down` **before** `npx next build` (the harness dev server shares `.next` — T-129 hit this), build green.

## 5. Owner items this plan surfaces (NEEDS-HUMAN)

- A support phone number for the "Talk to us" box (the one-pager sells "a direct line to the owner") — optional.
- Confirm the setup-checklist framing: Luxor's paid setup completes the checklist for the client.
