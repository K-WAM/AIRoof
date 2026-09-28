# WORKER_QUEUE.md — who builds what next (single source of truth)

Updated 2026-09-24. Replaces the old `PENDING_WORKER_PROMPTS*.md` files. Rules for every worker are in `AGENTS.md`;
task specs are in `TODO.md`; this file only holds the **assignment queue and the paste-ready prompts**.

Deepseek's credits are limited (it ran out mid-task once), so the queue is: **one Codex session (A)** for the risky/large work, and **Deepseek** for bounded UI work while its credits last. **Update 2026-09-24: the T-114 UX pass (B1) is assigned to Deepseek.** The documents work (B2/B3) stays with Codex — assign it to whichever Codex session frees up first.

| Session | Queue (one at a time, in order) | Worktree(s) |
|---|---|---|
| **Codex A** | ~~A1 T-111b~~ (done, merged) -> **A2b finish T-113** (mostly built) -> A3 T-109 email intake (prompt later) | `air-wt-request-review` |
| **Deepseek** | ~~B1 T-114~~ and ~~T-116~~ (done, merged) -> **T-119** declutter admin config form (V4 Flash Think High; prompt to be written; needs a worktree) | — |
| **Next free Codex** | **B2** T-107a document core (invoice + quote) -> B3 T-107b report (prompt written later) | `air-wt-documents-core` |

The two queues are file-disjoint by design (A: voice/webhooks/pipeline/calls/appointments/comms; B: nav/feedback/css/
documents/invoice/quote/report). Every worktree already exists, has `node_modules` junctioned, and is cut from `main`.
If one is missing, from the main repo: `git worktree add "D:/Apps/<name>" -b task/<branch> main` and junction
`node_modules` (PowerShell: `New-Item -ItemType Junction -Path "D:\Apps\<name>\node_modules" -Target "D:\Apps\6 - AI Receptionist\node_modules"`).

**State (end of 2026-09-24):** T-111a/b, T-114, T-116 merged and pushed. T-113 mostly built. T-111a (provider seam) is merged and pushed (live, dormant: default Vapi; `/api/health` reports `elevenlabs: not_configured` until a key is set). Cancelled: T-108
(no auto job creation — owner decision). Shared contracts: `src/lib/voice/types.ts`, `src/types/documentOptions.ts`,
`src/types/workCatalog.ts`.

## Worker etiquette (added after the first Deepseek run — include in every session)

- **Commit early and often** (at least every ~45 minutes and always before you stop). A worker that runs out of
  credits or time with uncommitted work strands it. Use `WIP:` commits; the integrator squashes/reviews.
- **Stop and ask instead of guessing** when: the spec is ambiguous, a product decision is needed, you want a new
  dependency, or you need to edit a file outside your ownership list. Put the question at the top of your final
  message ("QUESTION FOR INTEGRATOR: ...") and do the safe part of the task; do not expand scope.
- **Do not chase side quests.** Anything you notice but that is not in your task goes in your final message under
  "Noticed, not done" — not into the code.
- **Test screens and flows with the smoke harness** (`docs/SMOKE-HARNESS.md`: `npm run e2e:up:bg` from your worktree, then `npm run e2e:test` / `npm run e2e:call`; screenshots in `test-results/screens/`). It needs no keys. Do not report "browser tool failed" — fix or report the harness.
- You have **no ElevenLabs/Vapi/Resend/OpenAI keys** and must not call live services. Use mocked `fetch`. Never add keys
  to any file. `.env.example` holds names only.
- Mobile-check UI at 375 px; one-teal design system; Cache-Control rule (`jsonWithCache`, never `public`/`s-maxage`).

---

## Model selection (added 2026-09-24 — to conserve tokens)

Owner's Codex tiers, as understood (cheapest -> strongest): **Luna < Terra < Sol < Astra**, each with **low / medium / high** effort.
Deepseek V4 (owner's lineup, Sept 2026 sources — verify): **V4 Flash** (cheap default; ~3x cheaper than Pro per output token) and **V4 Pro**, each with a
thinking level of **Non-think / Think High / Think Max** (the newer V4.1-Flash uses a single reasoning-effort dial instead). Reported rule of thumb:
**Flash @ max ~ Pro @ high** on reasoning/coding, so prefer Flash and turn the think level up before switching to Pro. If any of this ordering is wrong,
fix this section — every recommendation below follows from it.

Pick by RISK first, size second:

| Task looks like... | Use |
|---|---|
| Touches a live customer path (phone webhooks, outbound calls), auth/HMAC/secrets, money math, legal wording, or a data-loss risk | **Sol medium** (never below Terra medium). Have Claude review the diff before merge. |
| Multi-file feature with a clear spec and existing patterns to copy (UI + API + tests) | **Terra medium** |
| Bounded/mechanical: CSS tokens, copy/wording, renames, adding tests to existing code, doc edits | **Terra low** (or Luna low for pure text edits) |
| Ambiguous design, architecture, cross-cutting refactor, deciding between approaches | **Claude (integrator), not a worker** — write the spec first, then hand the well-defined build to Terra/Sol |
| Reviews, merges, conflict resolution, research, planning | **Claude** |
| Deepseek: mechanical (wording, renames, docs, tests on existing code) | **V4 Flash, Non-think** (V4.1-Flash: low effort) |
| Deepseek: bounded feature or UI pass with a clear spec (e.g. T-114) | **V4 Flash, Think High** (V4.1-Flash: medium effort) |
| Deepseek: larger multi-file feature with tests (e.g. T-113) | **V4 Flash, Think Max** (V4.1-Flash: high effort) — the "pro-strength at flash price" setting |
| Deepseek: genuinely hard reasoning/algorithmic problem | **V4 Pro, Think High**; **Pro Max** only when Flash Max already failed |
| Deepseek on anything security-sensitive or on a live customer path | **Don't** — give it to Codex Sol. (The T-111b run went wrong on scope and budget, not just capability; a bigger Deepseek tier does not fix that.) |

Cost tip (third-party pricing page, verify): DeepSeek reportedly charges roughly half price off-peak; the listed PEAK windows are 01:00-04:00 and
06:00-10:00 UTC on weekdays (about 9pm-midnight and 2am-6am US Eastern in summer). Long Deepseek runs are cheaper outside those windows.

Token-saving habits (already in the prompts, worth repeating): point workers at exact files/line ranges (`page.tsx` is 2,250 lines — grep,
don't read it whole); run the full gates once at the end and `next build` once; commit WIP instead of re-deriving; stop and ask on ambiguity
instead of exploring; split big work into risk-ordered prompts rather than one giant prompt on the strongest model.

---

## A1 — Codex A: finish T-111b (ElevenLabs inbound webhooks + provisioning)

**Suggested model: Sol, medium.** Security-sensitive (webhook auth/HMAC) and it must PROVE a live customer-facing route unchanged — worth the stronger model. Don't go lower.

```
You are Codex session A on the AI Receptionist platform. Read docs/WORKER_QUEUE.md's "Worker etiquette" first.

Work ONLY inside: D:\Apps\air-wt-elevenlabs-hooks   (branch task/elevenlabs-hooks)
This worktree ALREADY EXISTS with node_modules junctioned. Do not run npm install or git worktree add.
BEFORE YOUR FIRST EDIT run `git rev-parse --show-toplevel` and `git branch --show-current`; they must be
D:/Apps/air-wt-elevenlabs-hooks and task/elevenlabs-hooks. Re-check before your commit. Never edit
"D:\Apps\6 - AI Receptionist" (main repo).

CONTEXT: another agent (Deepseek) started this task and ran out of credits. Its work is committed as a WIP commit
(16f8d5e) and main (which now includes T-111a's provider seam and the REAL ElevenLabs business lookups) has been merged
into this branch. About 90% is written but NOT finished or verified. Read AGENTS.md, src/lib/voice/types.ts (shared
contract — do not change), TODO.md Phase 19 -> T-111b (the full spec), then read everything the WIP added:
src/app/api/webhooks/elevenlabs/** (initiation, tools/[tool], post-call), src/lib/voice/elevenlabs/** (webhookAuth,
conversationRecords, initiationConfig, toolSchemas.ts/.json, businessLookupShim), src/lib/tools/toolDispatcher.ts,
src/lib/calls/endOfCallWriter.ts, scripts/setup-elevenlabs-agent.mjs, docs/ELEVENLABS-SETUP.md, and the change to
src/app/api/webhooks/vapi/route.ts.

Your job, in this order. Commit after each numbered step (`T-111b: ...`).
1. VERIFY THE LIVE VAPI WEBHOOK IS UNCHANGED IN BEHAVIOR. The WIP rewrote most of src/app/api/webhooks/vapi/route.ts
   (~450 lines) to use the new toolDispatcher.ts / endOfCallWriter.ts. Run `git diff main -- src/app/api/webhooks/vapi/route.ts`
   and compare function by function against main. This route answers REAL customer calls. Add characterization tests that
   pin the Vapi route's outputs for all 7 tools and the end-of-call writer against the OLD behavior (derive expected values
   from main's code). DECISION RULE: if you cannot prove identity, REVERT src/app/api/webhooks/vapi/route.ts to main's
   version (`git checkout main -- that file`) and let only the ElevenLabs routes use the shared dispatcher/writer. Prefer
   the smaller blast radius. Say which you chose and why in the log.
2. Replace businessLookupShim with the real exports in src/lib/vapi/businessLookup.ts
   (findBusinessByElevenLabsAgentId / findBusinessByElevenLabsPhoneNumber); delete the shim; update the test mocks.
3. Fix the 2 failing tests properly (understand the intended behavior, don't just edit the assertion):
   - initiationConfig "omits empty prompt/greeting overrides": when the tenant's greeting is empty we must NOT return a
     first_message consisting only of the recording notice (same rule as src/lib/vapi/syncPersonas.ts) — omit the
     override so the agent keeps its own greeting.
   - post-call "writes the same call-doc shape as Vapi": make the ElevenLabs post-call doc match the Vapi end-of-call
     document field for field where the data exists (compare with the writer used by the Vapi path).
4. Fix the ~10 TypeScript errors in the WIP test files (initiation-route.test.ts, initiationConfig.test.ts,
   webhookAuth.test.ts) with correct mock typing (no blanket `any`/`as never` unless justified).
5. Review the security of the new routes: secret compare is timing-safe and fail-closed (401, no detail); HMAC verify uses the
   RAW body with a timestamp tolerance and a replay guard; tools resolve businessId/callerPhone ONLY from the stored
   conversation record (never model-supplied params — add a test that a spoofed businessId in the tool body is ignored);
   unknown tenant responses leak nothing; rate limiting matches the Vapi webhook; the conversation-record collection has a
   TTL `expiresAt` field. Fix anything weak.
6. docs/ELEVENLABS-SETUP.md + scripts/setup-elevenlabs-agent.mjs: the owner has an ElevenLabs Creator-tier account and has
   NOT yet created any agent, tool, secret or phone number. Make the doc a click-by-click that starts from zero (create the
   agent, pick a voice, add the workspace secrets, run the script with --apply OR add the 7 tools by hand, then the agent
   Security-tab toggles + the initiation and post-call webhook URLs and secrets) — verify every field name and screen label
   against the live ElevenLabs docs and say plainly where you could not verify. The script must be dry-run by default,
   refuse to write without --apply, need ELEVENLABS_API_KEY, be idempotent by name, and never print secrets. post_call_audio
   stays a documented follow-up.
7. Gates: type-check, lint, `vitest run` (all green), `next build` once. Append evidence to docs/IMPLEMENTATION_LOG.md and set
   T-111b to `review` in TODO.md. Nothing here may call a live service. Final message: what you verified, what you changed
   vs the WIP, "Noticed, not done", and any QUESTION FOR INTEGRATOR.
Do NOT touch: T-111a files (provider.ts, elevenlabs/client.ts, businessLookup.ts) except a clearly-noted bug fix,
company/settings, admin/*, calls/outbound, cron/**, documents/invoice/quote/report, nav/feedback.
Never push/merge/touch main. If stuck >20 min: commit WIP, add HELP-NEEDED to TODO.md, end with
"Paste this to Claude: Codex A on task/elevenlabs-hooks is stuck on T-111b: <question>."
```

---

## A2 — Codex A: T-113 request review + decision workflow

**Suggested model: Terra, medium.** Well-specified UI + workflow + one email template; existing patterns to copy. Sol is overkill; low is risky for the multi-file wiring.

```
You are Codex session A on the AI Receptionist platform. Read docs/WORKER_QUEUE.md's "Worker etiquette" first.

Work ONLY inside: D:\Apps\air-wt-request-review   (branch task/request-review)
This worktree ALREADY EXISTS with node_modules junctioned. Do not run npm install or git worktree add. FIRST run
`git merge main` inside it (main has moved since it was cut; resolve any doc conflicts).
BEFORE YOUR FIRST EDIT run `git rev-parse --show-toplevel` and `git branch --show-current`; they must be
D:/Apps/air-wt-request-review and task/request-review. Re-check before your commit. Never edit
"D:\Apps\6 - AI Receptionist" (main repo).

Read AGENTS.md fully, CLAUDE.md's Industry-Applicability + Customer Entity + Cache-Control rules, TODO.md Phase 20 ->
T-113, then the code you will change: src/app/company/pipeline/page.tsx (lead detail, appointment cards, T-083 "Create
<jobNoun>", "Confirm & notify customer"), src/app/company/calls/page.tsx ("This call produced" links, T-084),
src/app/api/appointments/send-confirmation/route.ts, src/app/api/appointments/[appointmentId]/route.ts,
src/app/api/businesses/[businessId]/leads/[leadId]/route.ts, src/lib/pipeline/*, src/types/index.ts (Lead status
"new|contacted|booked|closed|lost"; Appointment status "requested|confirmed|cancelled|completed").

OWNER'S INTENDED WORKFLOW (2026-09-24): the phone AI takes a call, records the details, and puts a REQUEST in the
Pipeline. The admin/user opens it (from the Pipeline OR by clicking the call), sees the collected information in a clean
card, and DECIDES. NEVER auto-create a job. Accept => confirm to the customer (email and/or an AI callback) and create the
job (which then unlocks scheduling on the Calendar). Reject => send a polite decline. Much of this exists; you are
completing and unifying it.

Task T-113 — one shared "Request review" card + a real decline flow. Commits prefixed `T-113:`.
1. A shared component `src/components/requests/RequestReviewCard.tsx` used by BOTH the Pipeline detail pane and the
   Calls page (a "Review request" button on the call's "This call produced" banner opens it — reuse the T-084 lookup,
   src/lib/pipeline/callLinks.ts). It shows, well laid out and mobile-friendly: caller name + phone + email; what they
   want (service, address, urgency chip, preferred/requested time for appointments); the T-100 intake fields as labeled
   rows (template labels via VERTICAL_TEMPLATES — existing helper in Pipeline); the AI call summary (`call.summary`
   when present) with an expandable transcript excerpt and the recording player when `recordingUrl` exists; flags
   (after-hours, emergency/escalated); and a "Missing information" strip listing important fields the AI did not
   capture (phone, address, service — computed by a pure, tested function) with a one-tap "AI call back to collect it".
2. Decision actions on the card, gated by tenant modules via useBusinessModules (vocab, never hardcode "Job"):
   a) **Accept**: (jobs-module tenants) "Confirm & create <jobNoun>" — marks the appointment confirmed / lead booked,
      sends the customer confirmation email when an email is on file (reuse send-confirmation; branded), lets the user
      also tick "Have the AI phone them to confirm" (use the EXISTING POST /api/calls/outbound exactly as it is — it now
      routes through the voice-provider seam; do NOT modify that route), then opens the T-083 prefilled job form
      (buildJobPrefillUrl) — the job is created by the USER submitting that form. Appointments-mode tenants (no jobs
      module): "Confirm appointment" + the same notify options; no job button.
   b) **Decline**: "Decline & notify" — choose a reason (Outside our service area / Not a service we offer / Fully booked /
      Unable to reach you / Other + optional custom sentence <= 300 chars, plain text), preview the message, then send a
      polite, non-blaming, branded decline email when an email is on file (NEW pure, unit-tested template in a NEW file
      src/lib/comms/requestDeclineEmail.ts using the tenant's logo/colors the way send-confirmation does — do NOT edit
      src/lib/notify.ts, the documents work changes it in parallel). Sets appointment.status "cancelled" / lead.status "lost" and
      records `declinedAt`, `declineReason`, `decidedBy` (ADDITIVE optional fields on Lead/Appointment — own hunk in
      src/types/index.ts). No email on file => still declines internally and shows "No email on file — nothing was sent"
      (never claim a message was sent). Idempotent; a second decline never re-sends.
   c) **AI call back** (existing): keep the Call Back button on the card.
   Each decision shows a clear success/failure result and updates the Pipeline row live. Nothing here creates a job
   automatically.
3. Pipeline list: rows show a "New request" badge for `requested`/`new` items so the decision queue is obvious; decided
   items move to their existing tabs. The card must open from the Pipeline row AND from the Calls page.
Do NOT touch: src/app/api/calls/outbound/**, src/lib/notify.ts, src/lib/voice/**, src/app/api/webhooks/**, agentTools.ts,
documents/invoice/quote/report code, work-catalog code, nav/feedback components (T-114, another worker).
HARD RULES: one-teal design system (.button variants, no #2563eb, no per-page inline button styles); escape all free text in
the email; Cache-Control rule; RBAC: only owner/staff/superadmin can decide (verifyAuthAndRole); mobile-check at 375px.
Tests: missing-info detector; decline handler auth + idempotency + no-email path; decline email template (escaping, reason
wording, no blame); status transitions; card model builder (fields per vertical incl. T-100 intake); Pipeline/Calls opening
the same card.
Gates green: type-check, lint, `vitest run`, `next build` once. Append evidence to docs/IMPLEMENTATION_LOG.md, set T-113 to
`review` in TODO.md. Never push/merge/touch main. If stuck >20 min: commit WIP, add HELP-NEEDED to TODO.md, end with
"Paste this to Claude: Codex A on task/request-review is stuck on T-113: <question>."
```

---

## B1 — Deepseek: T-114 feedback fix + app-shell UX pass

**Suggested model: DeepSeek V4 Flash, Think High** (V4.1-Flash: medium effort). Bounded, mostly CSS tokens/a11y/wording — Pro is unnecessary. If it flounders on the modal/focus-trap work, go to Flash Think Max before Pro. Codex alternative: Terra low (medium if it struggles).

```
You are Worker D (Deepseek) on the AI Receptionist platform. Read docs/WORKER_QUEUE.md's "Worker etiquette" first — especially: COMMIT WIP OFTEN (your credits may run out mid-task; uncommitted work is lost), and STOP AND ASK instead of guessing. If you notice you are running low on budget, commit what you have, write a short status of what is done/not done at the top of your final message, and stop.

Work ONLY inside: D:\Apps\air-wt-ux-pass   (branch task/ux-pass)
This worktree ALREADY EXISTS with node_modules junctioned. Do not run npm install or git worktree add. FIRST run
`git merge main` inside it (main has moved since it was cut; resolve any doc conflicts).
BEFORE YOUR FIRST EDIT run `git rev-parse --show-toplevel` and `git branch --show-current`; they must be
D:/Apps/air-wt-ux-pass and task/ux-pass. Re-check before your commit. Never edit
"D:\Apps\6 - AI Receptionist" (main repo).

Read AGENTS.md fully, CLAUDE.md's design-system rule (one teal var(--accent), .button variants, no #2563eb), TODO.md
Phase 20 -> T-114, then: src/components/ui/FeedbackForm.tsx, src/app/api/feedback/route.ts, src/app/admin/admin-nav.tsx,
src/app/hub/hub-nav.tsx, src/app/company/company-nav.tsx, the nav/sidebar/modal/`.button` CSS in src/app/globals.css,
src/app/admin/businesses/SyncPersonasPanel.tsx, src/contexts/AuthContext.tsx (profile / superadmin flag).

Task T-114 — feedback fix + a bounded UX pass on the app shell. Commits prefixed `T-114:`.
1. FEEDBACK is for CLIENT users to send to the Luxor team; SUPERADMIN never needs it. Hide the Feedback button AND do not
   mount FeedbackForm for superadmins in ALL three navs (admin, hub, company — including when a superadmin is previewing a
   client via ?preview=). Client users still see it. (Use the existing superadmin flag from the auth profile; never flash
   the button before the profile resolves.)
2. FEEDBACK FORM wording is client-facing: title "Send feedback to Luxor" (or "Talk to the Luxor team"); replace the
   misleading "From <email>" row with a read-only "We'll reply to: <their email>" (muted) + one line saying it goes to the
   Luxor team, not their own company; keep category + message + counter; add a clear success state ("Thanks — we read every
   message") and a sensible error state; the disabled "Send" must have readable contrast (currently a pale teal that is hard
   to read). Do not change the API contract in a way that breaks existing submissions.
3. VISIBILITY: the Feedback control in the DARK admin/hub sidebar renders as a low-contrast pale box and is hard to see.
   Give the three navs ONE consistent treatment: a normal nav item with icon and label (in the company nav under "Help":
   Guide + Feedback), legible in both dark and light sidebars, with hover/focus/active states.
4. BOUNDED APP-SHELL UX PASS (do not redesign pages): (a) contrast audit of nav items, badges (SUPERADMIN), chips, disabled
   buttons and muted text against WCAG AA in light and dark surfaces — fix with tokens in globals.css, not per-page
   overrides; (b) visible keyboard focus rings on nav links, buttons, modal controls; (c) touch targets >= 40px and the
   mobile hamburger/nav behaving (open/close, focus trap, Esc) in all three shells; (d) modal/Sheet consistency (spacing,
   close button, backdrop, focus return) for FeedbackForm and one other existing modal; (e) tidy the "Sync live phone
   assistants" panel on Admin -> Clients (the Preview button floats alone on the right with a big empty gap — align it with
   the text, make the result list scannable); (f) list before/after screenshots you reviewed (375 / 768 / 1280px) in the
   log — use Playwright or your browser tooling if available, otherwise say plainly what you could not check.
Do NOT touch: pipeline/calls pages, appointments/leads routes, src/lib/notify.ts, src/lib/voice/**, webhooks,
invoice/quote/report/documents (other sessions own those).
HARD RULES: tokens over hard-coded colors; no new dependencies; a11y-first; do not remove any nav destination (Navigation
Completeness Rule in CLAUDE.md).
Tests: FeedbackForm renders for a client user and NOT for superadmin (all three navs); wording; the disabled-state
class/contrast token; existing nav tests still pass.
Gates green: type-check, lint, `vitest run`, `next build` once. Append evidence to docs/IMPLEMENTATION_LOG.md, set T-114 to
`review` in TODO.md. Never push/merge/touch main. If stuck >20 min: commit WIP, add HELP-NEEDED to TODO.md, end with
"Paste this to Claude: Worker D on task/ux-pass is stuck on T-114: <question>."
```

---

## B2 — next free Codex: T-107a document core + invoice + quote

**Suggested model: Sol, medium.** Largest task: money math must not drift, hide-toggle correctness across 3 renderings x 2 documents, a 2,250-line page to edit safely.

```
You are a Codex session on the AI Receptionist platform. Read docs/WORKER_QUEUE.md's "Worker etiquette" first.

Work ONLY inside: D:\Apps\air-wt-documents-core   (branch task/documents-core)
This worktree ALREADY EXISTS with node_modules junctioned. Do not run npm install or git worktree add. FIRST run
`git merge main` inside it (main has moved since it was cut; resolve any doc conflicts).
BEFORE YOUR FIRST EDIT run `git rev-parse --show-toplevel` and `git branch --show-current`; they must be
D:/Apps/air-wt-documents-core and task/documents-core. Re-check before your commit. Never edit
"D:\Apps\6 - AI Receptionist" (main repo).

Read AGENTS.md fully, CLAUDE.md's Cache-Control rule, src/types/documentOptions.ts (the SHARED CONTRACT — do not change it;
optional additions only, say so), TODO.md Phase 18 -> T-107, and LOOK AT the reference document "Roof Doctor's Invoice.pdf"
(docs/ and the repo root; open both pages). Then study the current documents:
src/app/company/jobs/[jobId]/page.tsx (Invoice tab document + print twin-render), QuotePanel.tsx,
src/lib/billing/jobInvoiceEmailHtml.ts, jobQuoteEmailHtml.ts, src/app/api/jobs/[jobId]/invoice/**, quote/**,
src/lib/branding/logo.ts, src/types/invoice.ts, src/types/quote.ts.

Task T-107a — a shared document layer + a modern, consistent INVOICE and QUOTE. Commits prefixed `T-107a:`.
1. Shared pure modules in NEW src/lib/documents/ (all unit-tested):
   - groups.ts: from labor/materials/other lines + DocumentOptions -> display groups. hideMaterials => ONE lump "Materials"
     subtotal row; hideLabor => ONE lump "Labor" subtotal row (NO worker names, hours or rates); both => two lump rows +
     total. TOTALS ARE ALWAYS THE TRUE TOTALS (use the shared jobInvoice.ts math).
   - letterhead.ts: resolve the letterhead once — logo via the Library logo library (pickDefaultLogo, correct variant per
     surface via logo.ts; fall back to legacy businessConfig.logoUrl), business name, address, phone, email, website, NEW
     `licenseNumber`. Escape everything used in HTML. Export `resolveEmailLogo(db, businessId)` for server routes.
   - emailBlocks.ts: reusable HTML blocks (letterhead, title + meta block, bill-to, narrative paragraph, group table, boxed
     total, footer with license # + website), inline-styled for email clients.
2. Apply to INVOICE and QUOTE in all three renderings (in-app document, print/PDF twin-render, emailed HTML):
   - Toggles "Hide materials" and NEW "Hide labor details" on both (existing Toggle component; the editor always shows every
     row — the toggles control the customer copy: preview, print, email). Persist as top-level optional booleans on
     JobInvoice/JobQuote (`hideMaterials` exists; add `hideLabor`, `showTechnicians`); PATCH routes validate them.
     Existing docs with no field = defaults, no migration.
   - Layout: a modern take on the reference — letterhead left (logo, name, address, phone, email, license #), a large title
     ("Invoice"/"Quote") in the tenant accent color top-right, a clean meta block (Date, Number, Terms / Valid until,
     Reference = job id, Service at), Bill-to, an editable "Description of work" narrative paragraph (NEW persisted
     `narrative` string <= 4000 chars, plain text, printed as a paragraph like the reference; NO auto-draft button yet),
     Labor and Materials groups each with a subtotal, a boxed Total Due / Estimated Total, footer. Simple and spacious.
   - `showTechnicians`: an optional "Technicians" line in the meta block; the user picks names from the team/crews (if the
     team list is not readable by staff, fall back to workerNames already logged on the job + free text); stored as
     `technicians: string[]` (<= 10, plain text, length caps).
3. Logo consistency: EVERY document/email that shows a logo goes through the letterhead resolver — also replace the legacy
   `biz.logoUrl` (+ invert filters) in src/app/api/appointments/send-confirmation, src/app/api/jobs/[jobId]/assign and
   src/lib/notify.ts. Do NOT touch the REPORT (in-app renderer or report/send route) — that is T-107b.
4. `licenseNumber?: string` (<= 40 chars) on BusinessConfig; owner edits it in Company Settings next to contact phone/email
   via the existing settings PUT (validate; plain text). Show it in the letterhead + footer.
Do NOT touch: the report tab/ReportRenderer, report/send, src/lib/voice/**, src/app/api/webhooks/**, agentTools.ts,
work-catalog code (except reading findings), Library pricing, nav/feedback (T-114, done by another worker, owns those), pipeline/calls/appointments (Codex A).
HARD RULES: never invent numbers — totals from the shared math; escape all free text; no placeholder text in any
customer-visible string; Cache-Control rule; mobile-check the in-app documents at 375px.
Tests: every combination of hideMaterials x hideLabor for invoice AND quote across groups.ts and BOTH email HTMLs (assert
hidden worker names/hours/rates/material names/prices are ABSENT and true totals PRESENT); letterhead precedence (library
default > legacy logoUrl > none); escaping; routes validate/persist new fields; legacy docs render.
Gates green: type-check, lint, `vitest run`, `next build` once. Append evidence to docs/IMPLEMENTATION_LOG.md, set T-107a to
`review` in TODO.md. Never push/merge/touch main. If stuck >20 min: commit WIP, add HELP-NEEDED to TODO.md, end with
"Paste this to Claude: Codex on task/documents-core is stuck on T-107a: <question>."
```

---

## Written later (when the previous item merges)

- **A3 — T-109** (Sol medium — abuse/spam + inbound-email security) email -> request intake (creates a LEAD for review, never a job; needs the inbound-email domain: NEEDS-HUMAN).
- **B3 — T-107b** (Terra medium; Sol medium if T-107a's shared layer needed rework) the REPORT: shared letterhead + options, hide materials/labor toggles, Problem / Corrective-action photo pages
  with Before/After, a deterministic `draftNarrative` + "Draft from job" buttons on invoice/quote/report, technicians on the
  report, and the emailed-report logo fix. Builds on T-107a's `src/lib/documents/`.
- **Conditional on tomorrow's voice bake-off (T-110):** T-106 bilingual line (Sol medium: live-call turn-taking risk) and the T-112 ElevenLabs follow-ups (Sol medium for anything on the live call path, Terra for admin/onboarding UI).

---

## C — prompts written 2026-09-24 (evening)

Context for every prompt below: `main` now has (once the integrator commits them) a deliverability pass — `src/lib/comms/prepare.ts`
(inline CID images, plain-text part, tenant `From` display name) and `sendEmail({ fromName, replyTo })`. **Any new customer-facing email must pass
`fromName: <business name>` and `replyTo: <business contact email>`, and must check the result (`status !== "delivered"` => do not mark "sent").**
Merge `main` before you start. Worker etiquette + no-live-services rules above apply.

### C1 — Codex, **Terra medium** — finish T-113 (request review + decline) — worktree already exists
```
Work ONLY in the git worktree D:/Apps/air-wt-request-review (branch task/request-review). Do not touch D:/Apps/6 - AI Receptionist directly.
If that worktree is missing: cd "D:/Apps/6 - AI Receptionist" && git worktree add ../air-wt-request-review task/request-review
First: git merge main. Read AGENTS.md, then `git diff main...HEAD` — the core (decline routes, requestDeclineEmail.ts, RequestReviewCard/Dialog) is built.
Do exactly this, in order, committing after each step (WIP: commits fine):
1. Route tests (vitest, reuse src/test-utils/fakeFirestore.ts and the mocking style in src/app/api/jobs/[jobId]/quote/route.test.ts):
   - PATCH appointments/[appointmentId] with declineReason: 400 on bad reason; 400 on customMessage > 300 chars; 404; idempotent (second call => alreadyDeclined, sendEmail NOT called again);
     no callerEmail => ok + noEmail, no send; with email => sendEmail called once with fromName=business name and replyTo=business contactEmail.
   - PATCH businesses/[businessId]/leads/[leadId] status "lost": same matrix (requires declineReason).
   Update both routes to pass `fromName`/`replyTo` to sendEmail, and to report notifiedCustomer:false (not throw) when delivery fails.
2. src/components/requests/RequestReviewCard.tsx is one giant unreadable line of JSX. Reformat into normal readable JSX (no behavior change), then verify every CSS class it uses
   (request-review-card, request-review-grid, request-missing, request-intake, request-review-actions, request-decline, summary-block, transcript) exists in globals.css; add missing ones using the design tokens (one teal var(--accent)); check at 375px.
3. UI interaction tests for RequestReviewCard (only if @testing-library/react is already a dependency — if not, STOP and put it in QUESTION FOR INTEGRATOR; do not add dependencies).
4. Gates once at the end: npx tsc --noEmit; npx eslint (changed files); npx vitest run (3 known slow/timeout tests: send, example-lib, company/team — note them, don't chase);
   `npx next build` ONCE with a 10-minute timeout and report the tail of its output honestly, including if it did not finish.
5. docs/IMPLEMENTATION_LOG.md contains invalid UTF-8 and your patch tool refuses it: append your entry with a shell `cat >> file <<'EOF'` instead. Set T-113 to `review` in TODO.md.
Do not push or merge. Final message: done / not done, gates output, "Noticed, not done", and "QUESTION FOR INTEGRATOR" at the top if any.
```

### C2 — Deepseek **V4 Flash, Think High** (docs/HTML only — no src/) — refresh the playbooks for the 2026-09-24 changes
```
Work ONLY in a new worktree: cd "D:/Apps/6 - AI Receptionist" && git worktree add ../air-wt-guide-2 -b task/guide-refresh-2 main   (then cd ../air-wt-guide-2 && npm ci is NOT needed — docs/HTML only).
Edit only: public/guides/onboarding-guide.html, public/guides/field-operations-guide.html, docs/ADMIN-QUICK-START.md. No src/, scripts/, or other docs.
Update for these facts (verify each against the code before writing it; grep, don't guess):
 1. Demo Studio (src/app/hub/demo/page.tsx) now takes optional Company name, Notification email, Business phone; all optional. The phone shows on the prospect's invoices/quotes/emails (contactPhone), NOT as the escalation number.
 2. Where things are: Admin sidebar now has Demo Studio + Playbooks under Tools; the runbook "Run a demo in 5 minutes" is at the top of Demo Studio. Add a short "Where is everything" box at the top of the Demo Playbook.
 3. Two demo lines: Vapi +1 754 283 7658 (any of 13 industries; Demo Studio renames it) vs the ElevenLabs test line +1 689 204 2643 (roofing only; rename via Admin -> Clients -> Edit; its calls appear under tenant carlita-elevenlabs-test, not demo-roofing).
 4. Emails: sender shows the business name, replies go to the business's contact email, photos/logos arrive inline; NH-3 domain is verified — the remaining owner step is RESEND_FROM (docs/NEEDS-HUMAN-CHECKLIST.md NH-3).
 5. Admin -> Usage: the column is now "Phone line" (Live · ElevenLabs / Live · Vapi / Demo · shared line / No phone line).
 6. Seats: owner invites teammates in Settings -> Team; default 5 seats; superadmin raises seatLimit in Admin -> Clients -> Edit.
Keep the guides' existing voice and print CSS. Tag-balance-check the HTML. Commit; do not push/merge. Final message: what changed, "Noticed, not done", QUESTION FOR INTEGRATOR.
```

### C3 — Codex, **Sol medium** — T-107a (documents core: invoice + quote) — this is B2 above, unchanged, plus the addendum below
T-107a was never built (worktree `D:/Apps/air-wt-documents-core` has no commits; `src/lib/documents/` does not exist). T-107b (report) still waits for it.
Addendum to B2 (main moved on 2026-09-25 — merge it first):
- Email plumbing is now central: `sendEmail({ to, subject, html, fromName, replyTo })` in `src/lib/comms/send.ts` converts base64 image data-URIs (logos, photos) into inline CID attachments and adds a plain-text part.
  So `resolveEmailLogo` may keep returning a data URI. Every email you build/route you touch must pass `fromName: <business name>` and `replyTo: <business contact email>` and must check the result
  (`status !== "delivered"` => 502, do NOT mark the invoice/quote "sent"). See `src/app/api/jobs/[jobId]/invoice/send/route.ts` for the pattern; keep it when you rewrite those routes.
- The report email logo/photo fix is already done in `report/send/route.ts` — do not redo it (and the report is still out of scope for T-107a).

### Held (needs an owner decision first, then Sol medium — money path)
Stripe subscriptions + monthly minutes metering + seat sync (`seatLimit` from plan) + suspend-on-nonpayment. Needs: final tiers/prices (see the pricing model in the 2026-09-24 chat), and Firebase on Blaze.

### C4 — Codex, **Terra medium** — T-107b (the REPORT on the shared document layer) — T-107a is merged (2026-09-25); run after Codex's usage limit resets
```
Work ONLY in a new worktree: cd "D:/Apps/6 - AI Receptionist" && git worktree add ../air-wt-report -b task/report-suite main
Then: cd ../air-wt-report; junction node_modules from the main repo the way the other worktrees do (see docs/NEXT_SESSION.md tooling notes); before your first edit run
`git rev-parse --show-toplevel` and `git branch --show-current` (must be D:/Apps/air-wt-report and task/report-suite). Never edit the main repo. Read docs/WORKER_QUEUE.md "Worker etiquette" and AGENTS.md first.
Read: src/lib/documents/ (groups.ts, letterhead.ts, emailBlocks.ts, validation.ts, DocumentPreview.tsx — built in T-107a), src/types/documentOptions.ts (shared contract; optional additions only),
the Report tab in src/app/company/jobs/[jobId]/page.tsx (grep "reportLogo"/"ReportRenderer"; the file is 2,250+ lines — grep, do not read it whole), src/app/api/jobs/[jobId]/report/send/route.ts,
src/lib/jobs/reportFindingsHtml.ts, src/lib/photos/store.ts, src/lib/billing/jobInvoiceEmailHtml.ts (the pattern to follow), and docs/WORKER_QUEUE.md B3 line.
Task T-107b — commits prefixed `T-107b:`:
1. The report uses the SAME letterhead as invoice/quote (resolveLetterhead + emailBlocks) in all renderings: in-app, print/PDF twin, emailed HTML.
2. Options: "Hide materials" and "Hide labor details" toggles on the report (same semantics as the invoice: hidden => lump row / no names, hours or rates; the editor always shows everything);
   optional "Technicians" line (same persisted shape as invoice). Persist as optional booleans/arrays on the job's report doc/fields; validate in the route. Old reports = defaults, no migration.
3. Photo pages: photos with phase "problem" grouped under "Problem" and "corrective" under "Corrective action" with Before/After pairing when both exist; existing includeInReport toggle still governs inclusion. Cap image count so the emailed report stays < ~15 MB (resize is already client-side; just cap and say so in the UI).
4. `draftNarrative`: a DETERMINISTIC (no LLM) pure function that drafts the scope/resolution text from the job's findings + issues + materials + labor; add a "Draft from job" button to the report notes field (and to the invoice/quote narrative fields if T-107a left a hook). It only fills an EMPTY field or asks before overwriting.
5. Email: report/send passes fromName/replyTo and returns 502 (nothing marked sent) on failed delivery — this already exists in report/send/route.ts; KEEP IT. Logos/photos may stay data URIs — sendEmail converts them to inline CID attachments.
Do NOT touch: voice/webhooks, agentTools, work-catalog code, invoice/quote logic except shared helpers, pipeline/calls (T-113, merged), nav/feedback.
Rules: never invent numbers; escape all free text; no placeholder text in customer-visible strings; Cache-Control rule; mobile-check at 375px; no new dependencies (ask instead).
Tests: hide-toggle matrix across groups + both HTMLs (hidden names/hours/rates ABSENT, true totals PRESENT), photo grouping/pairing, draftNarrative determinism + empty inputs, route validation.
Gates once at the end: tsc, eslint (changed files), vitest run (known load-flaky: send.test, company/team — re-run alone), `next build` once. Append evidence to docs/IMPLEMENTATION_LOG.md with a shell `cat >>` (file has odd bytes); mark T-107b `review` in TODO.md.
Commit at least every 45 min. Never push/merge/touch main. If stuck >20 min: commit WIP and end with "QUESTION FOR INTEGRATOR: ...".
```

### C5 — Codex, **Terra medium** — end-to-end smoke test of the whole demo path (route-level, offline)
Goal: one automated test that walks the entire customer story through the REAL route handlers, so a regression anywhere in the chain fails CI instead of surfacing in front of a prospect.
Story: phone call books -> call + request appear -> admin reviews/confirms -> job is created -> field update -> job shows it -> report + quote + invoice are generated, edited and "sent".
```
Work ONLY in a new worktree: cd "D:/Apps/6 - AI Receptionist" && git worktree add ../air-wt-smoke -b task/e2e-smoke main
Junction node_modules from the main repo like the other worktrees. Before your first edit run `git rev-parse --show-toplevel` and `git branch --show-current`
(must be D:/Apps/air-wt-smoke and task/e2e-smoke). Never edit the main repo. Read docs/WORKER_QUEUE.md "Worker etiquette" and AGENTS.md first.

Build ONE new test file src/e2e/demo-path.test.ts (vitest already includes src/**/*.test.ts) plus, if needed, helpers in src/test-utils/. It must run OFFLINE and fast (< 20 s):
- One shared in-memory db from src/test-utils/fakeFirestore.ts (makeFakeDb) used by EVERY step; extend the fake ONLY if a route needs API surface it lacks (say so in your notes).
- Mock only the boundaries: `@/lib/firebase/admin` (getAdminFirestore -> the fake; verifyIdToken), `@/lib/auth/verifyRole` (an OWNER of business "e2e-roofing"; a second test asserts a request with no session is rejected),
  the OpenAI/DeepSeek/Whisper clients (deterministic canned parse results — e.g. "used 12 bundles of shingles, Carlos worked 8 hours, found a cracked vent boot"), Resend (`resend` package or `@/lib/comms/send` — record every send: to, subject, html, fromName, replyTo, attachments),
  and any outbound Vapi/ElevenLabs HTTP. NO live network, no keys, no env secrets. Seed the business with industry "roofing", a name, brandColor, contactEmail, contactPhone, notificationEmail and one library logo (small base64 PNG).
Steps to drive IN ORDER, calling the exported route handlers (POST/PATCH/GET) with real NextRequest objects. After each step assert the STATE in the fake db, not just the status code:
 1. ElevenLabs initiation webhook, then tools/checkAvailability + tools/bookAppointment (see src/app/api/webhooks/elevenlabs/**/__tests__ for how to sign/shape requests) -> an appointment exists, status "requested", pendingConfirmation true, caller name/phone/address/service set.
 2. ElevenLabs post-call webhook -> a call doc exists with startedAt (REGRESSION: it was missing and hid the call), transcript messages, outcome, linked to the appointment via sourceCallId.
 3. GET /api/businesses/[id]/calls and /appointments (the lists the Calls and Pipeline pages use) both return the new records.
 4. PATCH /api/appointments/[id] confirm -> status "confirmed", customer confirmation email recorded with fromName = business name and replyTo = contactEmail. Then a SECOND appointment declined via declineReason -> status cancelled, decline email recorded, a repeat is idempotent (no second email).
 5. Job creation from the confirmed request (see src/lib/pipeline/jobPrefill.ts and POST /api/jobs) -> job J-xxxx exists with client name/phone/address prefilled; customers/resolve created or matched ONE customer (a second identical request must not create a duplicate).
 6. Field update: POST /api/jobs/[id]/updates (typed text) and, if practical with the mocked transcriber, /field-audio -> update ledger has entries; job.parsed (projection) shows materials, labor hours and the issue. A Spanish text update must produce English structured data + a transcriptEn.
 7. GET /api/jobs/[id] shows the projection. Report: PATCH reportNotes/reportOptions/reportTechnicians; POST report/send -> email recorded; assert the HTML has the letterhead + logo (as a cid: inline attachment, NOT a data: URI), findings, materials/labor lines, and NO "$", no "total", no "estimate" anywhere (reports carry no pricing). hideLabor / hideMaterials remove those sections.
 8. Quote: POST quote (draft from the job), PATCH edit lines + hide toggles, POST quote/send -> email recorded, quote status "sent", job status moves to "quoted". Assert hidden labor names/hours/rates and material names/prices are ABSENT and true totals PRESENT.
 9. Invoice: POST invoice, PATCH, send -> status "sent". Then make Resend FAIL and assert send returns 502 and the invoice is NOT marked sent (REGRESSION: it used to say "sent" while nothing was delivered).
10. Cross-tenant: a user of another business gets 403/404 on every route above (one loop over the handlers).
Also assert across ALL recorded emails: From display name is the business name, replyTo is the business contact email, an html AND text part exist, no `data:image` remains in any html.
Rules: do NOT change production code to make the test pass. If the chain BREAKS at a step, do not fix it: mark that step `it.fails`/skipped with a precise reason, keep going with what you can, and record it in docs/SMOKE-REPORT.md
(step, expected, actual, file:line, suspected cause, severity for a live demo). The value of this task is an HONEST map of what works. Fix nothing you were not asked to fix; small test-helper changes are fine.
Also write docs/SMOKE-REPORT.md: a table of the 10 steps (pass / fail / not coverable offline + why), and a short "what still needs a human on a real phone/inbox" list (voice audio quality, real email inbox placement, real Twilio/ElevenLabs call, browser rendering at 375px).
No new dependencies (ask instead). Gates once at the end: tsc, eslint on your files, the new test alone + full `vitest run` (known load-flaky: send.test, company/team — re-run alone), `next build` once. Commit every ~45 min. Append a short entry to docs/IMPLEMENTATION_LOG.md with a shell `cat >>`.
Never push/merge/touch main. Final message: pass/fail table, "Noticed, not done", "QUESTION FOR INTEGRATOR: ...".
```

---

## D — roofing demo on ElevenLabs (written 2026-09-25) — THREE tasks, run in parallel

Spec for all three: **`docs/DEMO-READINESS-PLAN.md` §3** (read it fully before coding; the prompts below only point to it).
No Vapi work in any of them — Vapi is retired from demos (plan §0). Merge order: D3 first (small), then D1 Part 1 (the demo line), then D2 by stage, D1 Part 2.
Worktree setup (PowerShell) for a new worktree `<wt>` on branch `<branch>`:
`cd "D:/Apps/6 - AI Receptionist"; git worktree add ../<wt> -b <branch> main; New-Item -ItemType Junction -Path "D:/Apps/<wt>/node_modules" -Target "D:/Apps/6 - AI Receptionist/node_modules"`
then verify `git -C D:/Apps/<wt> rev-parse --show-toplevel` and `git -C D:/Apps/<wt> branch --show-current` before the first edit.

### D1 — Codex A, **Sol medium** — phone line + Demo Studio (T-120, T-129, T-118, T-125, T-130 server side, T-131)
```
Work ONLY in a new worktree D:/Apps/air-wt-demo-line on branch task/demo-line (create it + junction node_modules exactly as in docs/WORKER_QUEUE.md section D; verify toplevel + branch before the first edit). Never edit D:/Apps/6 - AI Receptionist.
Read first: AGENTS.md, docs/WORKER_QUEUE.md "Worker etiquette", CLAUDE.md (Industry-Applicability + Cache-Control rules), then docs/DEMO-READINESS-PLAN.md §0, §1, §2 and §3 "D1" in full. §3 D1 is your spec: follow steps 1-9 in order.
Stay inside the D1 "Owns" list; the "Must not touch" list is owned by another worker running in parallel — if you need one of those files, STOP and ask.
Part 1 (steps 1-5) is what makes the demo work: finish it first. Commit after EVERY step (prefix "D1:"); after step 5 make a commit titled "D1 Part 1 complete" and append a checkpoint to docs/IMPLEMENTATION_LOG.md (shell `cat >> file <<'EOF'`; the file has odd bytes) — the integrator may merge that commit while you continue with Part 2 (steps 6-9).
Step 4 needs D3's src/lib/verticals/demoSeedRoofing.ts: run `git merge main` first; if the file is not there yet, skip step 4 and say so.
Hard rules: no live services or keys (mock fetch); never print secrets; the migration script defaults to --dry-run and you do NOT run --apply; keep BOTH demo-reset guards (code allowlist + isDemo) and the lock/backup; a Demo Studio launch must make NO ElevenLabs/Vapi network call; remove every Vapi mention from Demo Studio; 375px, one-teal .button variants, no inline hex; jsonWithCache/private caching only.
Gates at the end of each Part: npx tsc --noEmit; eslint on changed files; your tests; full npx vitest run (send.test and company/team are load-flaky — re-run alone). No next build.
Never push, merge or touch main. If stuck >20 min: commit WIP and end with "QUESTION FOR INTEGRATOR: ...".
Final message: a step-by-step done/not-done table with commit hashes (mark the Part 1 commit), gates output, "Noticed, not done", and the exact commands the integrator must run (migration dry-run/apply, setup-elevenlabs-agent flags).
```

### D2 — Codex B, **Terra medium** — the job loop: request → job → field → findings → quote → report → invoice (T-133..T-138 + workflow cleanup)
```
Work ONLY in a new worktree D:/Apps/air-wt-job-loop on branch task/job-loop (create it + junction node_modules exactly as in docs/WORKER_QUEUE.md section D; verify toplevel + branch before the first edit). Never edit D:/Apps/6 - AI Receptionist.
Read first: AGENTS.md, docs/WORKER_QUEUE.md "Worker etiquette", CLAUDE.md (Industry-Applicability, Customer Entity & Search, Cache-Control, Navigation Completeness, design-system rules), then docs/DEMO-READINESS-PLAN.md §0, §1, §2, §3 "D2" and §4 in full. §3 D2 is your spec: Stages 1-4, steps 1-11, in order.
Stay inside the D2 "Owns" list; the "Must not touch" list is owned by another worker running in parallel — if you need one of those files, STOP and ask.
src/app/company/jobs/[jobId]/page.tsx is ~2,360 lines: grep, don't read it whole; when you touch a tab, extract it to its own component file (like QuotePanel.tsx / FindingsPanel.tsx) with no behavior change beyond the task.
Commit after EVERY step (prefix "D2:"). At the end of each Stage make a commit titled "D2 Stage N complete" and append a checkpoint to docs/IMPLEMENTATION_LOG.md (shell `cat >> file <<'EOF'`; odd bytes) — the integrator merges stage by stage while you continue. Run `git merge main` at the start of each Stage.
Owner rules: jobs are never auto-created (Confirm & create job is a human tap, idempotent); reports carry no prices; no new money math (totals stay on quoteTotal/quoteGroups); one-teal .button variants, no inline hex, 375px, tap targets >= 44px; jsonWithCache/private caching only; field-grant endpoints must be narrow (one job, one action).
Gates at the end of each Stage: npx tsc --noEmit; eslint on changed files; your tests; full npx vitest run (send.test and company/team are load-flaky — re-run alone). No next build. No new dependencies (ask instead).
Never push, merge or touch main. If stuck >20 min: commit WIP and end with "QUESTION FOR INTEGRATOR: ...".
Final message: a stage/step done/not-done table with commit hashes (mark each "Stage N complete" commit), gates output, "Noticed, not done".
```

### D3 — Deepseek **V4 Flash, Think High** — South Florida roofing content (T-132) — content only, no logic
```
Work ONLY in a new worktree D:/Apps/air-wt-roofing on branch task/roofing-content (create it + junction node_modules exactly as in docs/WORKER_QUEUE.md section D; verify toplevel + branch before the first edit). Never edit D:/Apps/6 - AI Receptionist.
Read first: AGENTS.md, docs/WORKER_QUEUE.md "Worker etiquette", then docs/DEMO-READINESS-PLAN.md §0 and §3 "D3" in full. §3 D3 is your spec: steps 1-4.
You may edit ONLY: the roofing block of src/lib/verticals/templates.ts (NOT DEMO_LINE_PHONE, NOT other verticals), the roofing array of src/lib/verticals/workCatalogStarter.ts, and the new files src/lib/verticals/demoSeedRoofing.ts + its test. Nothing else.
demoSeedRoofing.ts must match the WorkedJobSeed contract in the plan EXACTLY (another worker imports it). Keep existing starter itemIds unchanged; new ones are starter-roofing-<slug>.
Content rules: FAQ answers are spoken aloud by the phone AI — max 2 sentences, no lists/URLs/unexplained abbreviations; never claim a license number, insurance coverage, a building-code section or a price; catalog prices are EXAMPLES (keep the starter flag).
Commit after each step (prefix "D3:"). Gates: npx tsc --noEmit; eslint on changed files; npx vitest run src/lib/verticals; then the full npx vitest run (send.test and company/team are load-flaky — re-run alone). No next build.
Never push, merge or touch main. Final message: what changed (list the new services, FAQs, emergency rules, catalog items), gates output, "Noticed, not done", "QUESTION FOR INTEGRATOR: ..." if any.
```

### D2 resume — Codex B, **Terra medium** — same task, picks up where the first session stopped (2026-09-25)
State when it stopped: branch task/job-loop has live refresh (7f226ab) + request→job route (97c8907); commit 9a025ab "D2 Stage 1 complete" was premature (corrected by 35ed082/7ba8cbf). Integrator review found a double-tap race in /api/jobs/from-request.
```
Continue D2 in the EXISTING worktree D:/Apps/air-wt-job-loop on branch task/job-loop. Verify `git rev-parse --show-toplevel` = D:/Apps/air-wt-job-loop and branch = task/job-loop before editing. Never edit D:/Apps/6 - AI Receptionist.
First: `git merge main` (main now has D3 roofing content + docs). If docs/IMPLEMENTATION_LOG.md conflicts, keep BOTH sides' entries. Re-read docs/DEMO-READINESS-PLAN.md §3 "D2".
This session: finish Stage 1, then do Stage 2, then STOP and report (Stages 3-4 come in a later resume, so the integrator can review the quote first).
Stage 1 remaining:
 a. /api/jobs/from-request is not idempotent under a double tap: the "existing job?" query and the create are separate, so two concurrent POSTs make two jobs. Make it atomic: in ONE Firestore transaction, tx.get a marker doc businesses/{bid}/requestJobs/{appointment_<id>|lead_<id>}; if it exists return its jobId (created:false); otherwise allocate the counter (tx.get/tx.update on the business doc, same logic as nextJobId — refactor nextJobId so a transaction variant is shared, don't duplicate), tx.create the job and tx.create the marker. Keep resolveCustomer + the call-summary read OUTSIDE (before) the transaction. Also return 400 (not 500) on invalid JSON.
 b. Route tests for from-request (reuse src/test-utils/fakeFirestore.ts; see src/e2e/demo-path.test.ts for the style): appointment and lead paths; carries clientEmail, notes, sourceCallId, callSummary, customerId; two concurrent POSTs => exactly one job (Promise.all); missing request => 404; wrong tenant => 403; POST /api/jobs keeps clientEmail.
 c. Calls page: "Live" badge for status "in_progress" with startedAt < 30 min, otherwise "Ended"; brief highlight for rows new since the last refresh (Calls, Pipeline, Dashboard lists) — CSS class + tokens, no inline hex.
 d. Job header "From call · <time> · View transcript" when sourceCallId is set (if not already done).
 Then commit "D2 Stage 1 complete (verified)" + a plain-text checkpoint in docs/IMPLEMENTATION_LOG.md.
Stage 2: steps 3 and 4 of the plan exactly (Findings <-> Library, then the quote rework). Commit after each step; end with "D2 Stage 2 complete" + checkpoint.
IMPLEMENTATION_LOG.md has legacy odd bytes: append from Git Bash with a QUOTED heredoc (cat >> docs/IMPLEMENTATION_LOG.md <<'LOG' ... LOG) so backticks survive, or write plain text.
Gates at the end of each Stage: npx tsc --noEmit; eslint on changed files; your tests; full npx vitest run (send.test and company/team are load-flaky — re-run alone). No next build. No new dependencies.
Same ownership lists and owner rules as the first D2 prompt. Never push, merge or touch main. If stuck >20 min: commit WIP and end with "QUESTION FOR INTEGRATOR: ...".
Final message: done/not-done table with commit hashes, gates output, "Noticed, not done".
```

### D1 resume — Codex A, **Sol medium** — same task, after the integrator merged Part 1 (2026-09-25)
State: Part 1 (725696c) is MERGED to main and DEPLOYED; the migration was APPLIED (the ElevenLabs number now belongs to demo-roofing).
Integrator changes on main you must not redo: the reset backup is now size-safe (`slimBackup`, route.ts + a regression test) and the migration script was fixed and run — leave both alone.
```
Continue D1 in the EXISTING worktree D:/Apps/air-wt-demo-line on branch task/demo-line. Verify toplevel = D:/Apps/air-wt-demo-line and branch = task/demo-line before editing. Never edit D:/Apps/6 - AI Receptionist.
First: `git merge main` (brings D3's src/lib/verticals/demoSeedRoofing.ts and the integrator's fixes). If docs/IMPLEMENTATION_LOG.md conflicts, keep BOTH sides.
Answer to your question: YES, you may edit src/lib/tools/toolDispatcher.ts — ONLY to add the `sayToCaller` sentence to the appointment tool results and remove the duplicate timezone read. No change to scheduling/booking/cancel logic, and the Vapi webhook (which shares the dispatcher) must keep working; add/adjust its tests.
Then, in order, committing after each (prefix "D1:"):
 1. Step 4 (worked job J-1001) exactly as the plan says, now that ROOFING_WORKED_JOB exists. It is an INSPECTION visit awaiting a quote: seed the job with status "inspection" (if writeJobProjection moves it to in_progress, accept that and say so).
 2. Finish step 3: a test that books the same slot again after a reset and succeeds (stale schedulingLocks are gone).
 3. Steps 6-9 of the plan (6: finish with the dispatcher change above; 7 live call row; 8 call audio route; 9 test-call button + route).
Do NOT run scripts/setup-elevenlabs-agent.mjs --apply (the integrator does). Do not touch the migration script or the reset backup code.
Gates at the end: npx tsc --noEmit; eslint on changed files; your tests; full npx vitest run (send.test and company/team are load-flaky — re-run alone). No next build.
Never push, merge or touch main. If stuck >20 min: commit WIP and end with "QUESTION FOR INTEGRATOR: ...".
Final message: done/not-done table with commit hashes, gates output, "Noticed, not done", and the exact setup-elevenlabs-agent command + flags the integrator must run.
```

### D2 Stage 2 — Codex B, **Terra medium** (Stage 1 is MERGED + deployed 2026-09-25; integrator fixed 3 refresh bugs on main — merge main first)
Refresh rules learned from Stage 1 (apply to ALL polled pages, incl. Stage 3's job page): (1) the load function must RETURN its promise so useLiveRefresh's no-overlap guard works; (2) a background refresh must keep the user's selection/scroll/open panel — match by id, apply "select first / deep-link" only on the first load; (3) only a failed FIRST load may show the full-page error — a failed background refresh keeps what is on screen; (4) never overwrite an unsaved local edit.
```
Continue D2 in the EXISTING worktree D:/Apps/air-wt-job-loop on branch task/job-loop (verify toplevel + branch first). FIRST run `git merge main` (main now has your Stage 1 plus integrator fixes in pipeline/calls/dashboard pages and D1's Demo Studio work). On a docs/IMPLEMENTATION_LOG.md conflict keep ALL sides (delete only the marker lines with sed -i; also delete a stray lone "=======" line if present) and verify `grep -c -a -E "^(<<<<<<<|=======|>>>>>>>)" docs/IMPLEMENTATION_LOG.md` = 0.
This session = Stage 2 ONLY (plan §3 D2 steps 3 and 4), then STOP. Commit after each numbered item (prefix "D2:"). Do not stop early with a partial report: if context runs low, commit and list exactly what remains.
 3. Findings <-> Library (FindingsPanel.tsx + work-catalog routes + a shared field component):
    a. One-off findings get an optional Price (stored as a single `other` line, qty 1) and a "Save to Library" checkbox. Saving appends a work-catalog item (add a narrow append op to the work-catalog API if none exists; respect the 300-item cap and the tenant scope) and writes the new itemId back onto the finding.
    b. Pure `src/lib/jobs/suggestFindings.ts`: rank catalog items against `job.parsed.issues` (description + resolution) by token overlap, reusing normalizeName folding (diacritics/case). Unit tests: overlap ranking, no match => none, Spanish-folded input, already-selected items excluded, max 5.
    c. In FindingsPanel show the top suggestions above the checklist: "From field notes: <issue> -> <catalog item> [Add]", and a count on the Findings tab label.
    d. `src/components/field/FindingPickerSheet.tsx` (search catalog -> tap -> added; reuse Sheet.tsx) wired into BOTH field screens (src/app/field/page.tsx and src/app/company/field/page.tsx). If the job PATCH route refuses field grants, add a narrow append-only `POST /api/jobs/[jobId]/findings` that accepts field grants (snapshot copy via copyCatalogFinding, 60 max, one job only) with route tests incl. "grant for another job => 403".
 4. Quote rework (QuotePanel.tsx — this is customer-facing money: NO new math, totals stay on quoteTotal/quoteGroups, and add tests for every path):
    a. Opening the Quote tab with no quote creates the draft automatically (the existing idempotent POST); no "Create draft quote" click.
    b. Header: status chip · live "Estimated total" · Valid until.
    c. Items as cards: Issue (problem) -> Work (solution) -> its priced lines grouped by the existing QuoteLine.findingId, qty/unit/price editable, per-item subtotal. Lines with no finding go under "Other work".
    d. Main button "+ Add item" opens the same catalog picker (FindingPickerSheet) and adds the finding to the JOB (includeInQuote and includeInReport both true) AND its lines to the quote at the Library default prices. Secondary button "+ Custom item" (problem, work, price, Save to Library checkbox).
    e. Replace the blank "Description of work" with a collapsed "Intro text (optional)" prefilled by a pure, tested `draftQuoteIntro(job, findings)` (reason for the call from job.notes + findings; deterministic, no LLM; empty inputs => empty string).
    f. The three toggles move into a collapsed "What the customer sees" group with one-line explanations from a new `src/lib/documents/optionsCopy.ts` (Hide materials: materials show as one total line. Hide labor details: labor shows as one total line. Show technicians: prints crew names) — reuse the same copy on the invoice and report toggles in jobs/[jobId]/page.tsx.
    g. Extract any tab you touch from jobs/[jobId]/page.tsx into its own file, no other behavior change.
 Tests to include: suggestFindings, draftQuoteIntro, save-to-library append (cap + tenant scope), findings field-grant route (if added), quote auto-create idempotency, add-item adds finding + Library-price lines and the total is exactly the sum of lines, hidden materials/labor still absent from the customer preview/email, one-off price line.
Gates: npx tsc --noEmit; eslint on changed files; your tests; FULL npx vitest run (send.test and company/team are load-flaky — re-run alone). No next build, no new dependencies. Append a plain-text checkpoint to docs/IMPLEMENTATION_LOG.md with a QUOTED heredoc, then verify the grep counts for "D3 / T-132" and "D1 Part 2 (Codex A" and "D2 Stage 1 verified" are each 1. Commit "D2 Stage 2 complete".
Same ownership lists/owner rules as before (jobs are never auto-created; reports carry no prices; one-teal tokens, no inline hex, 375px, tap targets >= 44px). Never push, merge or touch main.
Final message: done/not-done table with commit hashes, gates output with full-suite counts, "Noticed, not done".
```

---

## E — demo feedback round 2 (written 2026-09-26) — six tasks in three waves

**Spec and paste-ready prompts: `docs/DEMO-FEEDBACK-PLAN.md`** (sections "E1".."E6" are the specs; "Paste-ready prompts" holds the prompts). This section only tracks the queue. D1/D2/D3 prompts above are obsolete (done).

Model names as they appear in the owner's pickers (2026-09-26): Codex **GPT-6 Sol** (auth, live calls, legal wording, money) or **GPT-5.5 Terra** (spec'd UI), each with an effort level; Deepseek **V4.1 Flash, Thinking: Hard** (owner's default).

| Wave | Task | Worker, model | Worktree / branch | State |
|---|---|---|---|---|
| 1 | E1 Field access (QR time clock, no field "Work complete", required name, viewer read-only) + Team page (lock/unlock, revoke QR links) | Codex A, GPT-6 Sol, medium | `D:/Apps/air-wt-access` / `task/access-team` | steps 1-3 done (in-scope), scope widened for 3-5, continuing 2026-09-26 |
| 1 | E3 Job page restructure (numbered tabs, newest-first Activity, Issues -> Findings, picker sheet fix) | **Integrator (Claude)** — Codex B stopped partway; its commits are kept | `D:/Apps/air-wt-job-page` / `task/job-page` | **DONE, merged to local main 2026-09-26** (worktree can be removed) |
| 1 | E4 AI-PROVIDERS.md, Florida notices DRAFT memo + legalNotices.ts, seeded call transcripts | Deepseek V4.1 Flash, Thinking: Hard | `D:/Apps/air-wt-docs-legal` / `task/docs-legal` | **DONE, merged to local main 2026-09-26** |
| 2 | E2 Scheduling truth, list order, jobs paging + CSV, classify fallback | **Codex B**, GPT-6 Sol, medium (moved from A: disjoint files) | `D:/Apps/air-wt-schedule-lists` / `task/schedule-lists` | ready — start now |
| 2 | E5 Documents: invoice wording, report fixes, Include quote, Terms & notices | Codex B, GPT-6 Sol, medium | `D:/Apps/air-wt-documents-2` / `task/documents-2` | **DONE 2026-09-26 — merged** (Codex steps 1–3, integrator finished notices UI/settings) |
| 3a | E6a Photo pairs + drag-and-drop Photos tab + photoPages() (disjoint from E5) | Codex (free one), GPT-5.5 Terra, medium | `D:/Apps/air-wt-photos` / `task/photo-dnd` | ready — @dnd-kit/sortable installed on main |
| 3b | E6b Photos on quote/invoice/report + server-side loading for email | Codex, GPT-5.5 Terra, medium | `D:/Apps/air-wt-doc-photos` / `task/doc-photos` | after E5 + E6a merge |

File ownership is disjoint per wave (see the plan's "Hot files" list): page.tsx is E3 -> E5 -> E6 in sequence; verifyRole.ts is E1 only; agentTools.ts is E2 only.

**State 2026-09-26 (evening):** E1/E2/E3/E4/E5/E6a all DONE and merged to local `main`. G3 (guide refresh, see below) DONE. **The smoke harness now exists** (`docs/SMOKE-HARNESS.md`, `npm run e2e:up:bg` / `e2e:test` / `e2e:call`) — every prompt below uses it; "I couldn't check it in a browser" is no longer an acceptable excuse from a worker. E6b is IN PROGRESS (partial, see below). New: **T-129** UX declutter pass, spec `docs/ROOFING-DEMO-UX-REVIEW.md`.

### G3 — Deepseek: guide + runbook refresh — DONE 2026-09-26

`public/guides/onboarding-guide.html` v3.0 and `docs/DEMO-DAY-RUNBOOK.md` updated to match Phase 25's shipped changes (numbered tabs, Issues->Findings, office-only completion, Team page, Complete->Invoiced->Paid, price-free report, Terms & notices DRAFT, photo pairs). Merged to local `main`. No further action.

---

### E6b continuation — Codex: finish photos on quote/invoice/report

**Suggested model: GPT-6 Sol, medium** (touches the invoice/quote/report send routes and money-adjacent document content — matches this task's original tier; do not drop to Terra for the finish).

```
You are Codex, continuing task E6b on the AI Receptionist platform. Read docs/WORKER_QUEUE.md's "Worker etiquette" first.

Work ONLY inside: D:\Apps\air-wt-doc-photos   (branch task/doc-photos)
This worktree ALREADY EXISTS with your own prior commits (d0edf72, 9769069). Do not run npm install or git worktree add.
FIRST run `git merge main` inside it — main has moved (it now includes E6a merged, T-127 not yet, and a new local smoke-test
harness you will use below). Resolve any doc conflicts in favor of main's docs. BEFORE YOUR FIRST EDIT run
`git rev-parse --show-toplevel` and `git branch --show-current`; they must be D:/Apps/air-wt-doc-photos and task/doc-photos.
Re-check before every commit. Never edit "D:\Apps\6 - AI Receptionist" (main repo).

CONTEXT: you (or a prior session on this branch) already built the shared layout (DocumentPreview's `photos` prop +
photoPages(), photosBlock() email helper, optional photoIds on quote/invoice types, and server-side blob loading in all
three send routes). tsc/lint/vitest src/lib/documents were green at that checkpoint. Read your own prior commits first
(`git log --oneline main..HEAD`, `git diff main..HEAD`), then docs/DEMO-FEEDBACK-PLAN.md section "E6b" (your original
spec) end to end, then TODO.md's Phase 25 E6b entry (records exactly what is done vs not).

REMAINING WORK, in order, committing after each (prefix "E6b:"):
1. UI toggles: add "Include photos" to the Quote and Invoice panels (QuotePanel.tsx and the Invoice tab region of
   src/app/company/jobs/[jobId]/page.tsx — grep for the Invoice tab anchor, do not read the whole file), defaulting to the
   report-selected photos, wired to the photoIds field you already added to the types.
2. Server-side validation of photoIds on save/send: every id must belong to THIS job (tenant-scoped), cap at 16, reject if
   a blob is missing. Write the negative tests FIRST: another job's photo id, another tenant's photo id, >16 ids, duplicate
   ids, a deleted photo's id — all must be rejected with a clear 400, not a 500 or a silently-dropped id.
3. Convert the report send route to use photosBlock() the same way quote/invoice now do, for one consistent layout across
   all three documents. The report's price-free rule must still hold with photos on (add a test: a report with photos
   selected still contains no price, even a caption that happens to include a number).
4. USE THE SMOKE HARNESS to actually look at your work — this was not possible on your first pass; it is now.
   Read docs/SMOKE-HARNESS.md. From your worktree: `npm run e2e:up:bg` (first run ~3 min while pages compile), then extend
   e2e/photos.spec.ts or add e2e/doc-photos.spec.ts: seed a job with Before/After photos via the api() helper
   (scripts/e2e/lib.cjs), select them on the Quote and Invoice tabs, send, and assert (a) the UI shows the toggle and the
   selected photos, (b) outbox() shows the sent email's HTML actually contains the photos in Before|After pairs, (c) a
   report send with photos on still has no price in its text. Run `npm run e2e:test` and put real screenshot paths (from
   test-results/screens/) in your final message — not a description of what you assume renders.
5. Gates: npx tsc --noEmit; eslint on changed files; the full npx vitest run (send.test and company/team are load-flaky —
   re-run alone before believing a failure); npx next build once. Append evidence to docs/IMPLEMENTATION_LOG.md via a
   shell append (the file has odd bytes; never a patch tool). Set E6b to `review` in TODO.md Phase 25.
Do NOT touch: src/lib/auth/**, agentTools.ts, webhooks, voice, Team page, notices.ts approval logic, src/lib/photos/**,
src/components/photos/** (T-129 owns that file), src/app/company/jobs/page.tsx (the LIST page — you own only the
[jobId] detail page's Photos/Report/Invoice regions). No new dependencies.
Never push/merge/touch main. Commit at least every 45 minutes. If stuck >20 min: commit WIP and end with
"QUESTION FOR INTEGRATOR: ...". Final message: step table with commit hashes, full gate output, real screenshot paths,
"Noticed, not done".
```

---

### T-129 — Codex or Deepseek: demo-ready UX declutter pass

**Suggested model: GPT-5.5 Terra, medium** (bounded CSS/responsive layout across several files, no auth/money logic — Sol is unnecessary; Deepseek V4.1 Flash Thinking Hard is a fine alternative if Codex is busy on E6b).

```
You are Codex on the AI Receptionist platform. Task T-129: fix the phone-layout and small clarity issues the new local
smoke harness found. Read docs/WORKER_QUEUE.md's "Worker etiquette" first.

Create your worktree first (PowerShell):
cd "D:/Apps/6 - AI Receptionist"; git worktree add ../air-wt-ux-declutter -b task/ux-declutter main; New-Item -ItemType Junction -Path "D:/Apps/air-wt-ux-declutter/node_modules" -Target "D:/Apps/6 - AI Receptionist/node_modules"
Work ONLY in D:/Apps/air-wt-ux-declutter. Verify `git rev-parse --show-toplevel` = D:/Apps/air-wt-ux-declutter and
`git branch --show-current` = task/ux-declutter before your first edit and before each commit. Never edit
"D:/Apps/6 - AI Receptionist".

Read first: AGENTS.md, docs/WORKER_QUEUE.md "Worker etiquette", CLAUDE.md's design-system rule (one teal var(--accent),
.button variants, never hardcode a color or reintroduce #2563eb), docs/SMOKE-HARNESS.md (how to run the harness), then
docs/ROOFING-DEMO-UX-REVIEW.md in full — it is your spec, especially "What decluttered and modern means as a pass/fail".

Setup: `npm run e2e:up:bg` (first run ~3 min), then `npx playwright test e2e/smoke.spec.ts --project=phone` once BEFORE
you change anything, and look at the screenshots in test-results/screens/phone/ for every page in KNOWN_PHONE_OVERFLOW
(e2e/smoke.spec.ts) — that is your reproduction of each bug, not a description.

Fix each of these (CSS/layout only — no new components unless a screen genuinely needs one, no logic changes, tokens in
globals.css over per-page inline styles):
1. Dashboard (src/app/company/dashboard/page.tsx) — the Needs Attention feed rows overflow a 375px screen.
2. Jobs LIST page (src/app/company/jobs/page.tsx — NOT the [jobId] detail page, which E6b owns) — the table overflows;
   give it a card layout on narrow screens (same data, stacked instead of columned) rather than horizontal scroll.
3. Settings (src/app/company/settings/page.tsx) — a panel overflows.
4. Field screens (src/app/field/page.tsx, src/app/company/field/page.tsx) — content overflows; everything must be
   reachable without horizontal scroll on a phone.
5. Hub (src/app/hub/page.tsx, src/app/hub/demo/page.tsx) and Playbooks (src/app/hub/guide/page.tsx) — overflow.
6. Admin Luxor Invoices (src/app/admin/invoices/page.tsx) — overflow.
7. Photo card icon buttons (src/components/photos/SortablePhotoGrid.tsx) — the reorder/edit/delete icon buttons are
   ~20px; make them >=40px tap targets (WCAG/mobile guidance) without breaking the desktop density; on the "Other"
   section a delete icon gets squeezed out on some widths — fix that overlap too.
8. Company sidebar Feedback link — on a short desktop window it sits partly behind the "Add" button; fix the stacking/
   spacing so both are always fully visible and clickable.
For EACH fix, delete that page's line from KNOWN_PHONE_OVERFLOW in e2e/smoke.spec.ts (the test then fails if the
overflow ever comes back) and, for the photo-button fix, update or remove the "known-issue" annotation in
e2e/photos.spec.ts. Do not delete a line unless `npx playwright test e2e/smoke.spec.ts --project=phone` actually passes
clean for that page afterward.
Do NOT touch: src/app/company/jobs/[jobId]/page.tsx (E6b owns it this wave), src/lib/documents/**, src/lib/photos/**
(logic, not the grid component's CSS), agentTools.ts, webhooks, auth. No new dependencies.
Gates: npx tsc --noEmit; eslint on changed files; npm run e2e:test (full desktop + phone) — must be fully green with the
known-issue list shrunk exactly as described; full npx vitest run; npx next build once. Append evidence to
docs/IMPLEMENTATION_LOG.md via a shell append. Update your row in TODO.md's T-129.
Never push/merge/touch main. Commit at least every 45 minutes, one commit per numbered item (prefix "T-129:"). If stuck
>20 min: commit WIP and end with "QUESTION FOR INTEGRATOR: ...". Final message: a table of the 8 items with before/after
screenshot paths and which KNOWN_PHONE_OVERFLOW lines you removed.
```

**E-wave state 2026-09-27:** T-127, E6b and T-129 all MERGED to local `main` (`c090310`). Section E is complete.

---

## F — "No training needed" (written 2026-09-27) — spec: `docs/NO-TRAINING-UX-PLAN.md`

Order: **F1 (T-144) → merge → F2 (T-145)** — they touch the same pages. **F3 (T-130 code)** is file-disjoint and can run in parallel with either.
Lessons carried forward from the last wave: run `npm run e2e:down` BEFORE `npx next build` (the harness dev server shares `.next`; T-129's build failed on
this); append to `docs/IMPLEMENTATION_LOG.md` with a shell heredoc only; edit only your own row in `TODO.md` (both files conflict on every merge otherwise).

### F1 — Codex, **GPT-5.5 Terra, medium** — T-144 empty states + first-run setup
```
You are Codex on the AI Receptionist platform. Task T-144. Read docs/WORKER_QUEUE.md "Worker etiquette" first.

Create your worktree (PowerShell):
cd "D:/Apps/6 - AI Receptionist"; git worktree add ../air-wt-empty-states -b task/empty-states main; New-Item -ItemType Junction -Path "D:/Apps/air-wt-empty-states/node_modules" -Target "D:/Apps/6 - AI Receptionist/node_modules"
Work ONLY in D:/Apps/air-wt-empty-states. Before your first edit and before every commit, `git rev-parse --show-toplevel` must be
D:/Apps/air-wt-empty-states and `git branch --show-current` must be task/empty-states. Never edit "D:/Apps/6 - AI Receptionist".

Read first, in full: AGENTS.md; docs/NO-TRAINING-UX-PLAN.md sections 1, 2 and 3 (section 3 is your spec — the rules in section 2 are pass/fail);
CLAUDE.md's Industry-Applicability, Cache-Control and design-system rules; docs/SMOKE-HARNESS.md. Then the code you will change:
src/components/ui/BlockedAction.tsx, src/components/ui/Tooltip.tsx (read its doc comment — it is why prerequisites never use tooltips),
src/app/company/layout.tsx + first-login-guide-nudge.tsx + guide-nudge-storage.ts, src/app/company/dashboard/page.tsx, the useBusinessModules hook
(vocab / isEnabled / calendarMode), src/contexts/QuickAddContext.tsx, and each screen in the plan's section 3.3 table.
src/app/company/jobs/[jobId]/page.tsx is ~2,200 lines: grep for each empty-state string, never read it whole.

Do, in order, one commit per step (prefix "T-144:"):
1. EmptyState component + .empty-state tokens in globals.css + tests (plan 3.1).
2. BlockedAction optional href (backwards compatible — CalendarBoard still works) + tests.
3. src/lib/onboarding/setupChecklist.ts (pure, industry/vocab-aware) + unit tests.
4. GET /api/company/setup-status (verifyAuthAndRole owner/staff/superadmin; Firestore count() aggregations and single doc reads only;
   jsonWithCache(..., "noStore")) + route tests (auth, wrong tenant, empty tenant, counts -> booleans).
5. Dashboard: remove FirstLoginGuideNudge (component, storage helper, its test references); add the SetupChecklist card (owner + superadmin preview only,
   "Hide for now" collapse via try/catch localStorage, disappears when complete); replace the unconditional "All caught up" with the three cases in plan 3.2.
6. Every row of the plan 3.3 inventory, using EmptyState, vocab-driven, role-gated (viewer: "Ask the owner to…", no button). Remove the inline hex colors
   (#888, #94a3b8) the old empty states used. Commit per screen group (Pipeline+Calls, Calendar, Jobs list, Job tabs, Customers+Library, Team, Field).
7. Test rig (plan 3.4): add the e2e-empty tenant + owner@empty.e2e.test to scripts/e2e/config.cjs and the seed WITHOUT changing the other tenants' data;
   write e2e/empty-states.spec.ts (desktop + phone): every screen shows its EmptyState title + button, each primary action lands on the right place,
   viewer sees no create/send buttons, one dental vocab spot-check, the checklist count rises after loading the starter kit.
Rules: copy lines <= 12 words, buttons are verbs; one teal var(--accent), .button variants, no inline hex; 375px with no horizontal scroll
(KNOWN_PHONE_OVERFLOW in e2e/smoke.spec.ts must stay empty); tap targets >= 44px; never set public/s-maxage. OUT of scope (T-145 owns them): button
hierarchy on populated screens, Pipeline card clutter, the Guide page, the Agent Setup panel. Do NOT touch money math, auth logic, webhooks, voice,
agentTools.ts, document content rules. No new dependencies (ask instead).
Gates at the end: npx tsc --noEmit; eslint on changed files; full npx vitest run (send.test, example-lib and company/team are load-flaky — re-run alone
before believing a failure); npm run e2e:up:bg then npm run e2e:test (full, desktop + phone) green; npm run e2e:down; THEN npx next build once.
Append evidence to docs/IMPLEMENTATION_LOG.md with a shell heredoc (never a patch tool — the file has odd bytes); set only the T-144 row in TODO.md to review.
Never push, merge or touch main. Commit at least every 45 minutes. If stuck >20 min: commit WIP and end with "QUESTION FOR INTEGRATOR: ...".
Final message: step table with commit hashes, gate output, screenshot paths for every empty state (test-results/screens/{desktop,phone}/empty-*.png),
"Noticed, not done", QUESTION FOR INTEGRATOR if any.
```

### F2 — Codex, **GPT-6 Sol, medium** — T-145 page-by-page roofing UX pass (start ONLY after T-144 is merged to main)
```
You are Codex on the AI Receptionist platform. Task T-145: make the roofing workflow explain itself — no training, no tooltips, no dead ends.
Read docs/WORKER_QUEUE.md "Worker etiquette" first.

Create your worktree from CURRENT main (it must already contain T-144 — check that src/components/ui/EmptyState.tsx exists; if not, STOP and say so):
cd "D:/Apps/6 - AI Receptionist"; git worktree add ../air-wt-ux-workflow -b task/ux-workflow main; New-Item -ItemType Junction -Path "D:/Apps/air-wt-ux-workflow/node_modules" -Target "D:/Apps/6 - AI Receptionist/node_modules"
Work ONLY in D:/Apps/air-wt-ux-workflow. Before your first edit and before every commit, `git rev-parse --show-toplevel` must be
D:/Apps/air-wt-ux-workflow and `git branch --show-current` must be task/ux-workflow. Never edit "D:/Apps/6 - AI Receptionist".

Read first, in full: AGENTS.md; docs/NO-TRAINING-UX-PLAN.md (all of it — section 4 is your spec, section 2 is pass/fail, 4.2 lists decisions already
made: apply them, do not re-open them); docs/ROOFING-DEMO-UX-REVIEW.md (per-screen jobs-to-be-done + its reject list);
"D:/Apps/0 - Coding Standards & Specs/App Design Specification for Clear, Minimal, High-Trust Products.md"; CLAUDE.md's Industry-Applicability,
Navigation Completeness and design-system rules; docs/SMOKE-HARNESS.md. jobs/[jobId]/page.tsx (~2,200 lines) and pipeline/page.tsx are large: grep,
never read them whole; when you change a tab, extracting it to its own component file with no behavior change is welcome.

Design for the user in plan section 1: reads nothing, taps the biggest button, is on a phone outside or juggling calls, and decides "it's broken" at the
first blank screen, dead button or unfamiliar word.

Do, in order (prefix "T-145:"):
1. npm run e2e:up:bg, then npm run e2e:call (gives the roofing tenant a busy job). Walk the golden path in plan 4.1 as owner, staff, crew (phone) and
   viewer at 375px and 1280px. Take real before-screenshots with the harness (shot() in a spec under e2e/, or a Playwright script) — not descriptions.
2. Write docs/UX-PASS-FINDINGS.md (screen, persona, finding, severity blocks-path/confusing/clutter/polish, fix, before/after screenshot paths). Commit it.
3. Apply every decision in plan 4.2, then fix every blocks-path, confusing and clutter finding; polish only if one line. ONE commit per screen.
   Prerequisites are inline BlockedAction cards (fix in place, or a link to the exact place) — NEVER a disabled button explained by a hover Tooltip,
   which phones never show. Hide any button the current role would get a 403 from.
4. Add the one-primary-button guard to e2e/smoke.spec.ts (plan 4.3) with a KNOWN_MULTI_PRIMARY allow-list; shrink it to empty or justify each remaining
   line in UX-PASS-FINDINGS.md.
5. Rewrite /company/guide to "How it works — 5 steps" + "Talk to us" exactly as plan 4.2 says (vocab/module-gated; no invented phone number).
6. Walk the golden path again; add after-screenshots to UX-PASS-FINDINGS.md; confirm every step's next action is a visible button on the screen before it.
Guardrails (plan 4.4): no new pages; never remove a nav destination; no changes to money math, auth/role logic (hiding a button is UI, changing who may
do something is not), webhooks, voice, agentTools.ts, the price-free report rule, notices approval; no global restyle — KNOWN_PHONE_OVERFLOW stays empty;
no new dependencies; smallest change that satisfies the rules. A finding that needs a product decision: do the safe part, list it under
"QUESTION FOR INTEGRATOR", keep going — do not stop the whole task for it.
Gates at the end: npx tsc --noEmit; eslint on changed files; full npx vitest run (send.test, example-lib and company/team are load-flaky — re-run alone);
full npm run e2e:test green (desktop + phone); npm run e2e:down; THEN npx next build once. Append evidence to docs/IMPLEMENTATION_LOG.md with a shell
heredoc; set only the T-145 row in TODO.md to review. Never push, merge or touch main. Commit at least every 45 minutes. If stuck >20 min: commit WIP and
end with "QUESTION FOR INTEGRATOR: ...". Final message: findings summary (counts by severity, fixed vs deferred), commit hashes per screen, gate output,
before/after screenshot paths, "Noticed, not done", QUESTION FOR INTEGRATOR.
```

### F3 — Codex, **GPT-6 Sol, medium** — T-130 code: a second (Canadian) number on the same tenant (Option A, owner decision 2026-09-27)
Small diff, but it is the live call path and tenant resolution (a cross-tenant leak risk) — hence Sol.
```
You are Codex on the AI Receptionist platform. Task T-130 (code part). Read docs/WORKER_QUEUE.md "Worker etiquette" first.

Create your worktree (PowerShell):
cd "D:/Apps/6 - AI Receptionist"; git worktree add ../air-wt-ca-number -b task/ca-number main; New-Item -ItemType Junction -Path "D:/Apps/air-wt-ca-number/node_modules" -Target "D:/Apps/6 - AI Receptionist/node_modules"
Work ONLY in D:/Apps/air-wt-ca-number; verify toplevel and branch (task/ca-number) before the first edit and every commit. Never edit the main repo.

Read: AGENTS.md; docs/CANADIAN-DEMO-NUMBER.md (Option A is chosen: the new Vancouver 604 number answers as demo-roofing on the same agent); TODO.md T-130;
src/lib/vapi/businessLookup.ts; src/app/api/webhooks/elevenlabs/initiation/route.ts (it resolves by the CALLED number first and deliberately never falls
back to agent id for an unknown called number — keep that rule); the tools and post-call routes (they resolve from the stored conversation record);
src/types/index.ts (BusinessConfig.elevenlabs); the admin config page + PUT route (src/app/admin/businesses/[businessId]/config/**,
src/app/api/admin/businesses/[businessId]/config/route.ts); src/app/api/admin/demo-customize/route.ts (Demo Studio launch/reset).

Do (prefix "T-130:"), one commit each:
1. BusinessConfig.elevenlabs gains optional `extraPhoneNumbers?: string[]` (E.164, max 5). findBusinessByElevenLabsPhoneNumber: the existing
   `elevenlabs.phoneNumber ==` query first; if empty, `elevenlabs.extraPhoneNumbers array-contains`; same cache behavior. Unknown number -> null, still
   no agent-id fallback. Unit tests: primary, extra, unknown, cache.
2. The admin config PUT validates extraPhoneNumbers (E.164, <= 5, no duplicates) and rejects with 409 a number already used by ANOTHER business as its
   primary or extra number. The config page gets an "Additional phone numbers" field in the ElevenLabs section (one per line). Route tests 400/409/200.
3. A Demo Studio launch/reset of demo-roofing must PRESERVE elevenlabs.extraPhoneNumbers (test it).
4. Initiation route test: called_number = an extra number -> the tenant-specific response for demo-roofing and a conversation record carrying its
   businessId; a tools call on that conversation uses demo-roofing.
No live calls, no ElevenLabs/Twilio API calls, no secrets; do not touch the migration script, the reset backup code or the voice-provider seam.
Gates: npx tsc --noEmit; eslint on changed files; full npx vitest run (load-flaky: send.test, example-lib, company/team — re-run alone); npx next build once.
Append to docs/IMPLEMENTATION_LOG.md with a shell heredoc; set only the T-130 row in TODO.md to review. Never push/merge/touch main.
Final message: commit table, gate output, and the owner's exact steps after merge (buy a 604 voice number in Twilio -> import into ElevenLabs -> assign to
the demo agent -> Admin -> Clients -> demo-roofing -> Edit -> Additional phone numbers -> test call).
```

**F3 state 2026-09-27:** T-130 MERGED to local `main` (`a13b2ea`). Owner bought +1 (778) 907-9769 and assigned it to the agent; still needed: add it
under Additional phone numbers + one test call. **F2 (T-145) now waits for section G's G2** — booking comes first.

---

## G — Booking must be flawless (written 2026-09-27) — spec: `docs/BOOKING-RELIABILITY-PLAN.md`

A real caller's booking failed on 2026-09-27 (transcript evidence in the spec, §1). Order: **G1 now** (files disjoint from T-144, run in parallel) →
merge → **G3 + G4** in parallel → **G2** after both G1 and T-144 are merged → then F2 (T-145).
Every G task is under the new **booking-change gate** in AGENTS.md: your offline scenario tests must cover the spec's §4 rows you touch.

### G1 — Codex, **GPT-6 Sol, medium** — booking engine (live call path, money-adjacent trust: do not go lower than Sol)
```
You are Codex on the AI Receptionist platform. Task G1 (Phase 28): make booking correct. A real caller asked for 8:00 AM on three days and was told
"just taken" or offered midnight. Read docs/WORKER_QUEUE.md "Worker etiquette" first.

Create your worktree (PowerShell):
cd "D:/Apps/6 - AI Receptionist"; git worktree add ../air-wt-booking -b task/booking-engine main; New-Item -ItemType Junction -Path "D:/Apps/air-wt-booking/node_modules" -Target "D:/Apps/6 - AI Receptionist/node_modules"
Work ONLY in D:/Apps/air-wt-booking. Before your first edit and before every commit, `git rev-parse --show-toplevel` must be D:/Apps/air-wt-booking
and `git branch --show-current` must be task/booking-engine. Never edit "D:/Apps/6 - AI Receptionist".

Read first, in full: AGENTS.md (including the new "Booking-change gate"); docs/BOOKING-RELIABILITY-PLAN.md (ALL of it — §1 is the real transcript,
§3 are decisions you apply without re-opening, §4 is the truth table your tests must prove); CLAUDE.md's Industry-Applicability and Cache-Control
rules. Then read the code: src/lib/tools/agentTools.ts (parseBusinessHours, parseDayHours, buildAvailableSlots, checkAvailability, bookAppointment,
isSlotBusy, scheduleResourceKey, zonedDateTimeToUtc, zonedParts), src/lib/tools/toolDispatcher.ts (bookAppointment/checkAvailability cases,
toTimestamp), src/lib/voice/elevenlabs/initiationConfig.ts (isAfterHoursNow, afterHoursNote), src/lib/voice/elevenlabs/toolSchemas.json,
scripts/setup-elevenlabs-agent.mjs, src/app/api/admin/demo-customize/route.ts, src/lib/verticals/demoSeed.ts + demoSeedRoofing.ts, the agent prompt
builder (grep buildAgentPrompt and its "Using your tools" section), src/app/api/appointments/[appointmentId]/route.ts (lock release on cancel/decline),
src/lib/tools/__tests__/scheduling.test.ts, src/app/api/admin/demo-customize/__tests__/route.test.ts. Do NOT touch src/app/company/calendar/** or any
page UI (T-144 owns those right now; G2 does the UI later).

Do, in order, one commit per step (prefix "G1:"):
0. scripts/check-booking-data.mjs — read-only, dry-run only, never writes, never prints credentials (copy the credential-loading pattern from
   scripts/move-demo-line-to-elevenlabs.mjs). For one --business id (default demo-roofing): print whether its hours parse, its timezone, crew count,
   and every appointment/job/scheduling lock in the next 7 days with local start time, status, source (seed/call). You do NOT run it against
   production; the integrator will. Unit-test its pure formatting helpers.
1. src/lib/scheduling/hours.ts — the ONE business-hours module: parse (tolerant: "08:00 - 17:00", "8:00-17:00", "8am-5pm", "8:00 AM - 5:00 PM",
   "Closed"; object form per weekday), validate (returns field-level errors), canonicalize to "HH:MM - HH:MM" / "Closed", dayWindow(date, tz),
   isOpenAt(ts, tz). A string-form whole-week value (e.g. "Mon-Fri 8-5") is parsed if unambiguous, otherwise invalid. Replace parseBusinessHours/
   parseDayHours in agentTools.ts and the parser inside isAfterHoursNow with it (no behavior change for valid canonical input). Exhaustive unit tests.
2. Capacity (plan §3): capacity = number of crew/resource docs for the business (exclude ones with active === false), minimum 1. One shared
   function decides "is this window free" for BOTH checkAvailability and bookAppointment: free when overlapping non-cancelled appointments + scheduled
   jobs < capacity. Replace the single "unassigned" lock per 30-min bucket with capacity-aware locks (lock id carries a unit index 0..capacity-1; the
   booking transaction claims the first free unit for every bucket it spans; the existing cancel/decline release in appointments/[appointmentId]
   must release the right unit — update it and its tests). Keep the stale-lock reclaim for cancelled appointments; ALSO reclaim a lock whose
   appointment no longer exists. Tests: S11, S12, S13.
3. Preferred time: checkAvailability accepts optional preferredTime ("8am", "08:00", "2:30 PM", "morning" = 08:00, "afternoon" = 13:00). The result
   first states whether that exact time is open, then lists up to 3 openings ordered by closeness to the requested time on the requested day, then
   the next business days. With no preferred time, list from the day's opening (today: from now, rounded up). Never offer 21:00–07:00 local unless
   that was the requested time. Never offer the past. Tests: S2, S5, S6, S7, S8.
4. Conflicts never make the caller guess: when bookAppointment hits slot_conflict or outside_business_hours, the dispatcher result includes the
   closest openings (reuse step 3) in plain words, e.g. "8:00 AM Monday is booked. The closest openings are 9:00 AM, 9:30 AM or 10:00 AM." Test S3.
5. DST-correct local times: toTimestamp must convert a bare local date-time with zonedDateTimeToUtc for THAT date's offset, not today's. Test S10.
6. Hours not set up: when a tenant's hours are missing or invalid, checkAvailability returns an explicit result telling the agent to take the
   caller's details (the dispatcher creates a lead) — never "No openings". Test S9.
7. Demo: DEMO hours = Monday–Friday 08:00–17:00, Saturday and Sunday Closed (owner decision; current main has Saturday 09:00–13:00 — change it).
   Keep the booking-forward after-hours greeting already on main (no "closed" wording). Seeded demo appointments and jobs are placed at
   business-hour times on business days (e.g. 09:00, 11:00, 13:30, 15:00), never at launch-time offsets, never outside hours, leaving most of each
   morning free. Test S14: launch at every hour 0–23 → next 3 business days each have >= 6 free slots 08:00–12:00 and no seeded item outside hours.
8. Tool schema + prompt: add optional preferredTime (string) to checkAvailability in src/lib/voice/elevenlabs/toolSchemas.json (and wherever the Vapi
   tool params are declared in code, if any — never touch the Vapi dashboard); update both tools' descriptions. In the agent prompt's tool section,
   add "How to book": when the caller names a day/time, call checkAvailability with preferredDate + preferredTime; if that exact time is open,
   confirm it and call bookAppointment for exactly that time; if not, offer the two closest openings; if bookAppointment reports a conflict, offer the
   openings it returns — never ask the caller to pick blindly. Keep the existing "tools are mandatory / never claim booked before bookAppointment
   returns" rules. Extend scripts/setup-elevenlabs-agent.mjs with --update-tools: dry-run by default prints a diff of each existing tool's schema vs
   toolSchemas.json; with --apply updates only tools whose schema changed; never prints secrets; keeps pre_tool_speech "auto". You do NOT run it.
9. The booking scenario suite: src/lib/scheduling/__tests__/booking-scenarios.test.ts runs EVERY row S1–S14 of plan §4 through the real
   toolDispatcher + agentTools against src/test-utils/fakeFirestore.ts seeded with the real roofing demo seed and demo hours, clock fixed at
   2026-09-27T20:59:21Z. S1 replays Carla's exact tool calls from plan §1 and must now end booked for Monday 8:00 AM, with no response containing a
   time between 9 PM and 7 AM. Extend the fake only if needed (say so).
Rules: plain words in every string the agent will speak; no new dependencies; jsonWithCache/private only; mobile/UI untouched. Do NOT change: the
Vapi dashboard, ElevenLabs settings, pre_tool_speech, the migration script, the reset backup logic, auth.
Gates at the end: npx tsc --noEmit; eslint on changed files; full npx vitest run (send.test, example-lib, company/team are load-flaky — re-run alone
before believing a failure); npm run e2e:up:bg then npm run e2e:call (must still pass) then npm run e2e:down; THEN npx next build once.
Append evidence to docs/IMPLEMENTATION_LOG.md with a shell heredoc (never a patch tool — odd bytes); set only the G1 row in TODO.md to review.
Never push, merge or touch main. Commit at least every 45 minutes. If stuck >20 min: commit WIP and end with "QUESTION FOR INTEGRATOR: ...".
Final message: step table with commit hashes, the S1–S14 results table (pass/fail each), gate output, the exact commands the integrator must run
(check-booking-data, setup-elevenlabs-agent --update-tools), "Noticed, not done", QUESTION FOR INTEGRATOR.
```

### G2 — Codex, **GPT-5.5 Terra, medium** — operating hours chosen at setup (start ONLY after G1 and T-144 are both merged)
```
You are Codex on the AI Receptionist platform. Task G2 (Phase 28): every client chooses its operating hours at setup, in a form that cannot produce
bad data. Read docs/WORKER_QUEUE.md "Worker etiquette" first.

Create your worktree from CURRENT main — it must contain G1 (src/lib/scheduling/hours.ts exists) and T-144 (src/components/ui/EmptyState.tsx
exists); if either is missing, STOP and say so:
cd "D:/Apps/6 - AI Receptionist"; git worktree add ../air-wt-hours-setup -b task/hours-setup main; New-Item -ItemType Junction -Path "D:/Apps/air-wt-hours-setup/node_modules" -Target "D:/Apps/6 - AI Receptionist/node_modules"
Work ONLY in D:/Apps/air-wt-hours-setup; verify toplevel and branch (task/hours-setup) before the first edit and every commit. Never edit the main repo.

Read first: AGENTS.md (incl. the Booking-change gate); docs/BOOKING-RELIABILITY-PLAN.md §3 and §4 (S9); docs/NO-TRAINING-UX-PLAN.md §2 (the UI rules:
plain words, one primary button, 375px, tokens); src/lib/scheduling/hours.ts (G1's module — use it, never write another parser);
src/app/company/settings/page.tsx (the current free-text per-day hours inputs) + its API route; src/app/hub/onboarding/page.tsx + its API;
src/app/admin/businesses/[businessId]/config/page.tsx + route.ts; src/app/api/admin/businesses/route.ts (client create); src/app/company/calendar/
CalendarBoard.tsx (its own hours parsing near dayAtBusinessOpen); src/lib/onboarding/setupChecklist.ts (T-144).

Do, one commit each (prefix "G2:"):
1. src/components/scheduling/HoursEditor.tsx: one row per weekday — a Closed toggle, then Open and Close selects in 15-minute steps (12-hour labels,
   stores canonical "HH:MM - HH:MM"), inline error if close <= open. Presets above the rows: "Mon–Fri 8–5", "Mon–Sat 7–6", "Every day 8–8",
   "Open 24 hours (emergency service)". Accessible labels, keyboard usable, 44px targets, works at 375px. Component tests.
2. Company Settings: replace the free-text hours inputs with HoursEditor; the settings PUT validates with hours.ts and returns field errors (never
   saves invalid hours).
3. Onboarding wizard: a required "Hours" step using HoursEditor, defaulting to "Mon–Fri 8–5" pre-selected but visibly confirmable; the wizard cannot
   finish without valid hours; its API validates too. Admin client create + admin client config: same editor and validation.
4. CalendarBoard uses hours.ts instead of its own parsing (no visual change).
5. setupChecklist gains "Set your hours" (done when hours are valid) — first item after the phone line.
6. Tests: every route that writes hours rejects invalid input with a 400 and field errors; the editor round-trips canonical values; a tenant with old
   free-text hours ("8am-5pm") loads into the editor correctly (hours.ts is tolerant) and saves back canonical.
Rules: plain words; one teal var(--accent), .button variants, no inline hex; 375px; no new dependencies; do not touch scheduling logic (G1 owns it),
webhooks, agentTools.ts, auth. Gates: npx tsc --noEmit; eslint on changed files; full npx vitest run (load-flaky: send.test, example-lib, company/team —
re-run alone); npm run e2e:up:bg then npm run e2e:test (desktop + phone) green, screenshots of the editor at 375 and 1280; npm run e2e:down; THEN npx next
build once. Append evidence to docs/IMPLEMENTATION_LOG.md with a shell heredoc; set only the G2 row in TODO.md to review. Never push/merge/touch main.
Commit at least every 45 minutes. If stuck >20 min: commit WIP and end with "QUESTION FOR INTEGRATOR: ...". Final message: commit table, gate output,
screenshot paths, "Noticed, not done".
```

### G3 — Deepseek, **V4.1 Flash, Thinking: Hard** — booking regression tests in the smoke harness + the live test-call script (after G1 merges)
Tests and docs only — no production code.
```
You are Worker D (Deepseek) on the AI Receptionist platform. Task G3 (Phase 28). Read docs/WORKER_QUEUE.md "Worker etiquette" first — commit WIP often,
stop and ask instead of guessing. You write TESTS and ONE DOC only. You must not change anything under src/ except test files you create.

Create your worktree from CURRENT main — it must contain G1 (src/lib/scheduling/hours.ts exists); if not, STOP and say so:
cd "D:/Apps/6 - AI Receptionist"; git worktree add ../air-wt-booking-tests -b task/booking-tests main; New-Item -ItemType Junction -Path "D:/Apps/air-wt-booking-tests/node_modules" -Target "D:/Apps/6 - AI Receptionist/node_modules"
Work ONLY in D:/Apps/air-wt-booking-tests; verify toplevel and branch (task/booking-tests) before the first edit and every commit. Never edit the main repo.

Read first: AGENTS.md (incl. the Booking-change gate); docs/BOOKING-RELIABILITY-PLAN.md (all — §1 real transcript, §4 truth table); docs/SMOKE-HARNESS.md;
scripts/e2e/lib.cjs (api(), outbox()), scripts/e2e/scenarios/call-to-cash.cjs, e2e/call-to-cash.spec.ts, and G1's
src/lib/scheduling/__tests__/booking-scenarios.test.ts (so you don't duplicate it — yours runs through the REAL HTTP webhooks on the emulators).

Do, one commit each (prefix "G3:"):
1. scripts/e2e/scenarios/booking.cjs + npm script "e2e:booking": against the running harness, drive the ElevenLabs tool webhook exactly the way
   call-to-cash.cjs does, for these rows of plan §4: S1 (Carla replay: the same tool calls in the same order), S2, S3, S4, S5, S6, S8. Use the
   existing e2e-roofing tenant; set its hours and crews through the app's own API (api() helper), NOT by editing scripts/e2e/config.cjs or the seed
   (T-144 owns those files). Assert on the tool responses the agent would speak: exact times in plain words, never a time between 9 PM and 7 AM,
   never "No openings" when hours are set, conflicts always list alternatives.
2. e2e/booking.spec.ts (desktop + phone): after the scenario, the booked appointments appear in Pipeline and on the Calendar at the right local
   times; screenshot each.
3. docs/BOOKING-TEST-SCRIPT.md — the owner's live test calls, one per row S1–S8 (S7/S9–S14 are offline-only, say so): what to say on the phone word
   for word, what the agent must answer, what to check in the app afterwards, and a pass/fail box. Written for a non-technical owner.
Gates: npx tsc --noEmit; eslint on files you changed; npm run e2e:up:bg, then npm run e2e:booking and npm run e2e:test green, then npm run e2e:down.
If a scenario FAILS, do NOT change production code: record it in your final message (row, expected, actual, file:line) — that is a bug for G1.
Append evidence to docs/IMPLEMENTATION_LOG.md with a shell heredoc; set only the G3 row in TODO.md to review. Never push/merge/touch main.
If you are running low on budget: commit, list done/not done at the top of your final message, stop.
Final message: per-row pass/fail table, screenshot paths, "Noticed, not done", QUESTION FOR INTEGRATOR.
```

### G4 — Codex, **GPT-5.5 Terra, medium** — daily booking canary (after G1 merges)
```
You are Codex on the AI Receptionist platform. Task G4 (Phase 28): a daily check that booking still works, so a broken calendar is caught by us,
not by a caller. Read docs/WORKER_QUEUE.md "Worker etiquette" first.

Create your worktree from CURRENT main — it must contain G1 (src/lib/scheduling/hours.ts exists); if not, STOP and say so:
cd "D:/Apps/6 - AI Receptionist"; git worktree add ../air-wt-booking-canary -b task/booking-canary main; New-Item -ItemType Junction -Path "D:/Apps/air-wt-booking-canary/node_modules" -Target "D:/Apps/6 - AI Receptionist/node_modules"
Work ONLY in D:/Apps/air-wt-booking-canary; verify toplevel and branch (task/booking-canary) before the first edit and every commit. Never edit the main repo.

Read first: AGENTS.md (incl. the Booking-change gate); docs/BOOKING-RELIABILITY-PLAN.md §5; src/lib/auth/cronGuard.ts and an existing cron
(src/app/api/cron/close-punches/route.ts) for the pattern; vercel.json; src/lib/comms/send.ts (sendEmail); src/lib/scheduling/hours.ts and
checkAvailability (G1); src/app/admin/usage/page.tsx + src/app/api/admin/usage/route.ts.

Do, one commit each (prefix "G4:"):
1. GET /api/cron/booking-canary (cronGuard; never public caching): for demo-roofing and every business with a phone line (elevenlabs.agentId or
   vapiAssistantId), call checkAvailability for the next business day with no preferred time and with preferredTime "10:00". A business FAILS if:
   hours missing/invalid, zero openings on a business day that has hours, any slot in the past, outside hours, or between 21:00 and 07:00. Write the
   result to businesses/{id}.bookingCheck = { ok, checkedAt, problems: string[] } (additive field). Read-only otherwise — never books.
2. When any business fails, email the platform owner (superadmin/notification address already used for platform alerts — find it, don't invent
   one) with one plain line per problem; fromName "Luxor CRM"; check the send result.
3. vercel.json: run it daily at 11:00 UTC (7 AM Eastern). Hobby allows daily crons; keep the existing ones.
4. Admin → Usage: a "Booking" column — green "OK" / red "Check failed" with the problems on hover-free inline text (no tooltip-only info).
5. Tests: guard (401 without the secret), each failure rule, a healthy tenant passes, email sent once per run only on failure, usage column renders.
Rules: no new dependencies; jsonWithCache/private only; plain words; do not change scheduling logic (G1), webhooks, auth. Gates: npx tsc --noEmit; eslint
on changed files; full npx vitest run (load-flaky: send.test, example-lib, company/team — re-run alone); npx next build once. Append evidence to
docs/IMPLEMENTATION_LOG.md with a shell heredoc; set only the G4 row in TODO.md to review. Never push/merge/touch main. Commit at least every 45 minutes.
If stuck >20 min: commit WIP and end with "QUESTION FOR INTEGRATOR: ...". Final message: commit table, gate output, "Noticed, not done".
```

---

## H — THE REMAINING QUEUE (2026-09-27 night) — 4 prompts, this section supersedes F2, G2, G3, G4

The owner asked for as few prompts as possible, each complete enough that the worker just executes. The detailed specs
are unchanged (F1/F2/G1–G4 above, `docs/NO-TRAINING-UX-PLAN.md`, `docs/BOOKING-RELIABILITY-PLAN.md`). The prompts below
combine them and point to them. Two AGENTS.md rules added tonight apply to everyone: **run to the end** (no check-ins
between steps) and **CRLF/non-ASCII patch mismatches: edit by hand, no permission needed**.

| # | Worker / model | Task | Starts when | Worktree |
|---|---|---|---|---|
| H0 | Codex A · GPT-5.5 Terra, medium | Finish T-144 (empty states) | **DONE — finished by the integrator; merged + deployed 2026-09-27** | removed |
| H1 | Codex B · GPT-6 Sol, medium | G1 booking engine (section G, unchanged) | **DONE — reviewed, fixed, merged + deployed 2026-09-27; live tools updated** | removed |
| H2 | Deepseek · V4.1 Flash, Thinking: Hard | G3 + G4: booking tests, live test script, daily canary | **DONE — reviewed + merged 2026-09-28 (`67388ef`)** | remove after push |
| H3 | Codex (first free) · GPT-6 Sol, medium | G2 + T-145: hours at setup, then the roofing UX pass | **can start now** (T-144 + G1 are on main) | `air-wt-setup-ux` |

Note for H2 (2026-09-27): the bookAppointment conflict reply is now `NOT BOOKED: <time> was just taken. … Offer them the closest openings: …`
(model) and `Sorry, <time> was just taken. The closest openings are … Which works best for you?` (sayToCaller) — assert those, never "is booked".
The six saved ElevenLabs agent tests are listed in TODO.md Phase 28; `docs/BOOKING-TEST-SCRIPT.md` should reference them.

**Integrator notes for merging H3 (2026-09-28):** main now has Phase 30 (TODO.md) — CalendarBoard.tsx lost `dayAtBusinessOpen`, its
Settings fetch and `businessHours` state (the drop opens a time picker fed by `GET /api/company/crews/open-times`), so on H3's three
CalendarBoard hunks take main's side and drop H3's now-unused `parseBusinessHours, WEEKDAYS` import. The Team page, Library crews
(`CrewsSection.tsx`), company layout/nav (the new field-only **Crew** role) also changed. Gates are tiered now (AGENTS.md item 2, T-151).

After H3 there is one more prompt, and only when the owner approves pricing: billing + the superadmin cost panel
(T-126 + T-146). Everything else is integrator work (reviews, merges, live agent tests, deploy) or owner items.

### H0 — Codex A, **GPT-5.5 Terra, medium** — finish T-144 (fresh session is fine; everything it needs is here)
Step 5 was finished and committed by the integrator (`838d614`) after the worker's patch tool failed twice on CRLF.
```
Continue T-144 in the EXISTING worktree D:/Apps/air-wt-empty-states (branch task/empty-states). Verify `git rev-parse --show-toplevel` and
`git branch --show-current` before your first edit. Never edit "D:/Apps/6 - AI Receptionist".
Done: F1 steps 1–5 (step 5 = Dashboard checklist, "Hide for now", first-run feed states — committed by the integrator as 838d614; don't redo it).
Why your edits kept failing: the working tree is CRLF but git stores LF (core.autocrlf=true). Fix it ONCE, before any edit, from the worktree root
in PowerShell:
git ls-files src e2e scripts/e2e | ForEach-Object { $p = (Resolve-Path $_).Path; $t = [IO.File]::ReadAllText($p); if ($t.Contains("`r`n")) { [IO.File]::WriteAllText($p, $t.Replace("`r`n", "`n")) } }; git add -u
Afterwards `git status` is clean and nothing is committed by it (the integrator verified this), and your patch tool matches normally.
Then, in ONE run with no check-ins: F1 step 6 (every row of docs/NO-TRAINING-UX-PLAN.md §3.3 except the Dashboard — one commit per screen group:
Pipeline+Calls, Calendar, Jobs list, Job tabs, Customers+Library, Team, Field) and step 7 (the e2e-empty tenant + e2e/empty-states.spec.ts, which
also covers the Dashboard checklist, "Hide for now" and the first-run feed), then F1's gates (npm run e2e:down BEFORE npx next build).
Another Codex session edits src/lib/tools/**, src/lib/scheduling/**, demo-customize and demoSeed.ts — don't touch those.
Final message: F1's final-message format. Never push or merge.
```

### H1 — Codex B, **GPT-6 Sol, medium** — G1 booking engine
```
Read D:/Apps/6 - AI Receptionist/docs/WORKER_QUEUE.md section "G1" and follow it exactly — it has you create your own worktree first. Run every step
to the end in this one session (AGENTS.md "Run to the end"). Another Codex session is editing company UI pages and scripts/e2e/** at the same time —
don't touch those. The main repo is read-only for you; never push or merge.
```

### H2 — Deepseek, **V4.1 Flash, Thinking: Hard** — booking verification (G3 + G4), after H1 merges
```
You are Worker D (Deepseek) on the AI Receptionist platform. Task H2 = sections G3 and G4 of docs/WORKER_QUEUE.md, done by you in ONE worktree.
Read docs/WORKER_QUEUE.md "Worker etiquette" and AGENTS.md (the Booking-change gate, and "Run to the end") first. Commit WIP often; if your budget runs low,
commit, list done/not-done at the top of your final message and stop.

Create your worktree from CURRENT main — it must contain G1 (src/lib/scheduling/hours.ts exists); if not, STOP and say so:
cd "D:/Apps/6 - AI Receptionist"; git worktree add ../air-wt-booking-verify -b task/booking-verify main; New-Item -ItemType Junction -Path "D:/Apps/air-wt-booking-verify/node_modules" -Target "D:/Apps/6 - AI Receptionist/node_modules"
Work ONLY in D:/Apps/air-wt-booking-verify; verify toplevel and branch (task/booking-verify) before the first edit and every commit. Never edit the main repo.
Ignore the worktree lines inside G3/G4; use this one.

Part A = G3 steps 1–3 exactly (smoke-harness booking scenarios, e2e/booking.spec.ts, docs/BOOKING-TEST-SCRIPT.md). In Part A, change only test files,
scripts/e2e/scenarios/booking.cjs, package.json (the one npm script), and that doc. Commit "H2 Part A complete".
Part B = G4 steps 1–5 exactly (the daily booking canary: cron route, owner email, vercel.json, Admin Usage "Booking" column, tests). In Part B you may
change only the files G4 names. Reuse src/lib/auth/cronGuard.ts; never invent an email address — find the one existing platform alerts use.
If a Part A scenario FAILS, do NOT change production code — record row / expected / actual / file:line in your final message (it is a G1 bug).
Gates at the end: npx tsc --noEmit; eslint on changed files; full npx vitest run (send.test, example-lib, company/team are load-flaky — re-run alone);
npm run e2e:up:bg, then npm run e2e:booking and npm run e2e:test green, then npm run e2e:down; THEN npx next build once.
Append evidence to docs/IMPLEMENTATION_LOG.md with a shell heredoc; set only the H2 row in TODO.md to review. Never push/merge/touch main.
Final message: per-row pass/fail table (S1–S8), canary test results, gate output, screenshot paths, "Noticed, not done", QUESTION FOR INTEGRATOR.
```

### H3 — Codex (first free), **GPT-6 Sol, medium** — hours at setup, then the roofing UX pass (G2 + T-145), after H0 AND H1 merge
```
You are Codex on the AI Receptionist platform. Task H3 = section G2, then section F2, of docs/WORKER_QUEUE.md, in ONE worktree and ONE run
(AGENTS.md "Run to the end"; CRLF/non-ASCII "Known hiccups" — edit by hand, no permission needed).

Create your worktree from CURRENT main — it must contain G1 (src/lib/scheduling/hours.ts) AND T-144 (src/components/ui/EmptyState.tsx);
if either is missing, STOP and say so:
cd "D:/Apps/6 - AI Receptionist"; git worktree add ../air-wt-setup-ux -b task/setup-ux main; New-Item -ItemType Junction -Path "D:/Apps/air-wt-setup-ux/node_modules" -Target "D:/Apps/6 - AI Receptionist/node_modules"
Work ONLY in D:/Apps/air-wt-setup-ux; verify toplevel and branch (task/setup-ux) before the first edit and every commit. Never edit the main repo.
Ignore the worktree lines inside G2/F2; use this one.

Part 1 = G2 steps 1–6 exactly (HoursEditor, Settings, the required onboarding "Hours" step + admin client create/config, CalendarBoard on the shared
parser, "Set your hours" checklist item, validation tests). Commit "H3 Part 1 complete" and append a checkpoint to docs/IMPLEMENTATION_LOG.md —
the integrator may merge Part 1 while you continue.
Part 2 = F2 steps 1–6 exactly (golden-path walk as owner/staff/crew/viewer at 375 + 1280 px with real screenshots, docs/UX-PASS-FINDINGS.md, the
decisions in docs/NO-TRAINING-UX-PLAN.md §4.2, the one-primary-button guard, the Guide rewrite, the re-walk). Part 1's hours editor is part of the
walk. Booking behavior is G1's — if the walk finds a booking bug, record it; don't change src/lib/tools/** or src/lib/scheduling/**.
Gates at the end of EACH part: npx tsc --noEmit; eslint on changed files; full npx vitest run (load-flaky: send.test, example-lib, company/team —
re-run alone). At the very end also: npm run e2e:up:bg, npm run e2e:test green (desktop + phone), npm run e2e:down, THEN npx next build once.
Append evidence to docs/IMPLEMENTATION_LOG.md with a shell heredoc; set only the H3 row in TODO.md to review. Never push/merge/touch main.
Final message: Part 1 and Part 2 commit tables (mark "H3 Part 1 complete"), findings summary (counts by severity, fixed vs deferred), gate output,
screenshot paths, "Noticed, not done", QUESTION FOR INTEGRATOR.
```

## I — Call-flow fixes from the owner's 2026-09-28 test call (Phase 31) — spec: `docs/CALL-FLOW-FIX-PLAN.md`

The workflow and who builds each link: plan §0. Gates: plan §5 (workers run only what proves their change; the integrator runs
the full set once before the push). Split rule: live call + booking engine = integrator; screens = Codex; plumbing = Deepseek.

| # | Worker / model | Task | Starts when | Worktree |
|---|---|---|---|---|
| I1 | Deepseek · **V4.1 Flash, Thinking: Hard** | T-152 plumbing (no live-call code) | now | `air-wt-call-flow` |
| I2 | Codex · **GPT-6 Sol, medium** | T-153 every screen | H3 merged + I1 Step 0 merged | `air-wt-call-ux` |
| I0 | Integrator · Claude Opus 5.5 | T-154 live call + booking engine, ElevenLabs config, Twilio check, merges, push | now | `air-wt-call-live` + main |

### I1 — Deepseek, **V4.1 Flash, Thinking: Hard** — T-152 plumbing
```
You are Worker D (Deepseek) on the AI Receptionist platform. Task T-152: the backend plumbing for the new call workflow. You are a
careful junior engineer: do the steps in order, commit after each (prefix "T-152:"), add no scope, run to the end in this session.
Nothing you write runs during a live phone call — the integrator owns the agent prompt, the tool dispatcher and the booking engine.

Setup (PowerShell):
cd "D:/Apps/6 - AI Receptionist"; git worktree add ../air-wt-call-flow -b task/call-flow main; New-Item -ItemType Junction -Path "D:/Apps/air-wt-call-flow/node_modules" -Target "D:/Apps/6 - AI Receptionist/node_modules"
Work ONLY in D:/Apps/air-wt-call-flow. Before your first edit and every commit check `git rev-parse --show-toplevel` = D:/Apps/air-wt-call-flow
and `git branch --show-current` = task/call-flow. Never edit "D:/Apps/6 - AI Receptionist". Never push or merge.

Read first: docs/CALL-FLOW-FIX-PLAN.md (all of it — §0 is the workflow, §3 is your contract: build EXACTLY those names and
signatures, others code against them in parallel), docs/WORKER_QUEUE.md "Worker etiquette", AGENTS.md "Definition of done" item 2
and "Known hiccups" (CRLF: if a patch won't match, edit by hand). Style: read the neighbouring file first and match it (auth with
verifyAuthAndRole, responses with jsonWithCache/NextResponse like its neighbours, Firestore via getAdminFirestore, tests with
src/test-utils/fakeFirestore.ts — it supports batch.delete and FieldValue.delete()).

YOUR FILES: src/types/** (Step 0 fields only), src/lib/format/name.ts, src/lib/scheduling/hours.ts (one pure helper — do not change
anything else there), src/app/api/company/time-blocks/** (new), src/app/api/company/crews/open-times/route.ts (add blocks to busy),
src/lib/comms/sms.ts + smsTemplates.ts (new), src/lib/crews/recipients.ts + inspectorNotify.ts (new), src/lib/notify.ts (one new
email builder), src/app/api/jobs/[jobId]/assign/route.ts (only to use the extracted recipients helper), src/app/api/appointments/
[appointmentId]/route.ts, src/app/api/webhooks/elevenlabs/post-call/route.ts (callSummary only), src/types/bootstrap.ts +
src/app/api/company/bootstrap/route.ts, .env.example, docs/IMPLEMENTATION_LOG.md, your TODO row.
DO NOT touch: src/lib/ai/**, src/lib/tools/**, src/lib/voice/**, src/lib/scheduling/** other than the one helper,
src/app/company/**, src/components/** (the integrator and Codex own those).

Step 0 — contracts, types only. Commit "T-152 Step 0: contracts" BY ITSELF, FIRST: every field/type in plan §3 (optional fields,
one-line comment each; TimeBlock in the new src/types/schedule.ts with a timeBlocksPath(businessId) helper). No behaviour. tsc passes.

Step 1 — pure helpers with tests.
- cleanCallerName(raw) in src/lib/format/name.ts: strip ONE leading filler — it's / it is / its / es / soy / this is / my name is /
  me llamo / i'm / i am (case-insensitive, then any punctuation) — only when at least one word remains; trim. Tests:
  "Es Carla Esnaida" → "Carla Esnaida", "It's Kareem Awad" → "Kareem Awad", "Esther Lee" and "Soyla Diaz" unchanged, "Es" → "Es".
- nextOpeningLabel(now, timeZone, hours) in src/lib/scheduling/hours.ts, built on dayWindow: the next opening strictly after now →
  "today at 1 PM" / "tomorrow at 8 AM" / "Monday at 8 AM" (minutes only when not :00); null if nothing opens in 14 days. Tests
  around DST and a closed weekend.

Step 2 — time blocks API (plan §2.5).
- GET /api/company/time-blocks?businessId&from&to[&crewId] (owner/staff/viewer/superadmin) → { blocks }; POST { businessId, crewId,
  startTime, endTime, label } (owner/staff/superadmin): the crew must exist, end > start, at most 14 days long, label 1–80 chars
  trimmed → { block }; DELETE ?businessId&blockId (owner/staff/superadmin). Query by startTime range (Firestore allows one range
  field: read from - 14 days .. to, then filter overlaps in code). Tests: validation, 403, overlap filter.
- crews/open-times/route.ts: add the crew's blocks to `busy` (one more query). Test.

Step 3 — texting module, OFF by default (plan §2.8, §3).
- src/lib/comms/sms.ts: isSmsEnabled(business) = process.env.SMS_ENABLED === "true" && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN &&
  business.smsEnabled !== false. sendSms(...): E.164 via sanitizePhone (grep for it), POST
  https://api.twilio.com/2010-04-01/Accounts/<SID>/Messages.json with Basic auth + form fields To/From/Body (From =
  business.smsFromNumber ?? TWILIO_PHONE_NUMBER), 10 s AbortController, no new dependency. Dedupe + record exactly like
  sendWithLedger in src/lib/comms/send.ts does for email (read it; mirror it). In the harness (isE2EHarness()) write to the same
  E2E outbox with channel "sms" and never call Twilio. Never log or return a credential; log only a number's last 4 digits.
  Return "unconfigured" when texting is off. Tests mock fetch (success, Twilio error, timeout, off).
- src/lib/comms/smsTemplates.ts (pure, tested, each ≤ 320 chars): bookingReceived({ firstName, businessName, when, street }) →
  "Hi <first>, <Business> here. You're down for <when> at <street>. We'll text to confirm. Reply STOP to opt out." ·
  bookingConfirmed({ service, when, street, businessName, businessPhone }) → "Confirmed: <service> <when> at <street>. Questions?
  Call <phone>. – <Business>" · inspectorAssigned({ when, street, customerName }) → "New inspection: <when>, <street>
  (<customer>). Details in your email."

Step 4 — inspector notifications.
- Move the crew-email recipients logic out of src/app/api/jobs/[jobId]/assign/route.ts into src/lib/crews/recipients.ts
  (crew address + active members with an email, deduped, one ledger key each) and use it there; that route's tests must pass unchanged.
- notify.ts: buildInspectionEmail({ brand, change, when, customerName, customerPhone, address, accessLines, urgentLines, callSummary })
  — subject by change ("New inspection" / "Inspection moved" / "Inspection reassigned" / "Inspection cancelled"); body lists the
  facts; escape everything like the other builders. Test.
- src/lib/crews/inspectorNotify.ts: notifyInspector(...) per plan §3 — email via the recipients helper (ledger key
  `${appointmentId}:${change}:${startTime}:<recipient>` so a repeat never double-sends), plus a text to the crew row's phone when
  isSmsEnabled. accessLines/urgentLines = the notes lines starting "Access:" / "URGENT:". Never throws — log and return counts. Tests.

Step 5 — the confirm/assign route: src/app/api/appointments/[appointmentId]/route.ts (read it all first; keep every current
behaviour and test).
- notifyChannel: when notifyCustomer is true and no channel is given, pick sms (isSmsEnabled + callerPhone + textOk !== false) →
  email (callerEmail) → none. SMS uses bookingConfirmed. Response adds notifiedVia.
- Inspector check: when assignedCrewId is set/changed or the time changes and the target row is an inspector row, return 409
  { code: "inspector_busy", message: "<Row> is busy then (<block label or 'another inspection'>)." } if a block or another active
  booking of that row overlaps — unless body.force === true.
- After a successful change, call notifyInspector: "assigned" for the new row, "reassigned_away" for the old one, "moved" when only
  the time changed, "cancelled" on cancel/decline. Set assignedBy: "office" when the office assigns. Response adds staffNotified.
  Tests for each branch.

Step 6 — small ones.
- post-call/route.ts (~line 188 — the appointments query already exists): write callSummary (the non-empty transcript summary)
  onto each of this call's appointments in one batch. Test.
- bootstrap: business.smsEnabled = isSmsEnabled(business). .env.example: SMS_ENABLED=false with "true only after carrier
  registration (NH-29)".

Step 7 — wrap up: a plain-text entry in docs/IMPLEMENTATION_LOG.md via a shell heredoc (steps, commits, test output); set only the
T-152 row in TODO.md to review; commit "T-152 complete".

Tests — only these (no full vitest, no e2e, no next build): npx tsc --noEmit; eslint on changed files; npx vitest run
src/lib/format src/lib/scheduling src/lib/comms src/lib/crews src/app/api/company/time-blocks src/app/api/company/crews
src/app/api/appointments src/app/api/webhooks/elevenlabs "src/app/api/jobs/[jobId]/assign" src/app/api/company/bootstrap.
If a file times out once, re-run it alone (load flake) before touching it.

Final message: commit table (Step 0 hash first), test summary, "Noticed, not done", QUESTION FOR INTEGRATOR.
```

### I2 — Codex, **GPT-6 Sol, medium** — T-153 every screen (after H3 and I1 Step 0 are merged)
```
You are Codex on the AI Receptionist platform. Task T-153: make the screens follow the real workflow — call → booked (that is the
lead) → inspector notified → inspector manages their time → customer told by text. Read docs/CALL-FLOW-FIX-PLAN.md §0 first: it is
the story your screens must tell, step by step.

Setup (PowerShell) — main must contain "T-152 Step 0: contracts" (git log --oneline main | Select-String "Step 0"); if not, STOP and say so:
cd "D:/Apps/6 - AI Receptionist"; git worktree add ../air-wt-call-ux -b task/call-ux main; New-Item -ItemType Junction -Path "D:/Apps/air-wt-call-ux/node_modules" -Target "D:/Apps/6 - AI Receptionist/node_modules"
Work ONLY in D:/Apps/air-wt-call-ux; verify toplevel and branch (task/call-ux) before the first edit and every commit. Never push or merge.

Read first: docs/CALL-FLOW-FIX-PLAN.md (§0 workflow, §2 decisions, §3 contract — the types are on main; the server side lands in
parallel, so every new field or endpoint may be missing: render nothing and never crash), docs/WORKER_QUEUE.md "Worker etiquette",
CLAUDE.md "Industry-Applicability Rule", "Cache-Control Rule", "Phase 30 Key Files" and the one-teal rule, docs/NO-TRAINING-UX-PLAN.md
§2 (one primary button per screen, no hover-only help, plain words). Big files (pipeline/page.tsx, calendar/CalendarBoard.tsx,
jobs/[jobId]/page.tsx): grep, don't read whole; moving a piece into its own component file with no behaviour change is welcome.

YOUR FILES: src/app/company/**, src/components/**, src/types/team.ts, src/lib/team/landing.ts, src/app/api/company/crews/route.ts
(`kind` in POST + the PATCH whitelist only), src/app/api/calendar/feed/** + src/app/api/company/team/me/calendar-feed/** (new),
e2e/call-flow.spec.ts (new), docs/IMPLEMENTATION_LOG.md, your TODO row.
DO NOT touch src/lib/ai/**, src/lib/tools/**, src/lib/voice/**, src/lib/scheduling/**, src/lib/comms/**, src/app/api/appointments/**,
src/app/api/webhooks/**, src/app/api/company/time-blocks/** (the integrator's and Deepseek's).

Part A — calls feed the Pipeline; the Pipeline is the booked customers (one commit per item, prefix "T-153:")
A1. Nav: Dashboard → Calls → Pipeline → Calendar → Jobs → Field → Customers → Library (company-nav.tsx LINKS); the phone top-bar
    shortcuts in company/layout.tsx in the same order.
A2. Pipeline: first/default tab "Booked (n)" = appointments; second "Callbacks (n)" = createLead messages ("Callers who didn't book —
    call them back"). Old deep links keep working (?tab=appointments → Booked, ?tab=leads → Callbacks). One-action empty states.
A3. Calls: a call that booked shows "Booked · open in Pipeline →" (src/lib/pipeline/callLinks.ts already matches them); one that
    didn't shows "Not booked" + a tap-to-call link.
A4. "After hours" only when appointment.bookedAfterHours === true, else "New booking · confirm": Pipeline (~466/474), Dashboard
    (~413-421 → section "New bookings to confirm"), Guide (~188, ~214).
A5. Wherever a booking shows (Pipeline card, RequestReviewCard, a tap/hover popover on the Calendar's Phone-bookings chip): time, name,
    tel: link, address (maps link), email, "OK to text" when textOk, the assigned inspector ("Dominic · assigned by AI" when
    assignedBy === "ai"), notes with "Access:" and "URGENT:" lines highlighted, and callSummary under "From the call".

Part B — inspectors and their time
B1. src/types/team.ts: TradeTitle "inspector" ("Inspector"); Team page title help: "Inspector — opens on the Field screen with their
    schedule"; landing.ts: inspector → /company/field.
B2. Library → Crews (src/app/company/library/CrewsSection.tsx): "Type" (Crew / Inspector) on add and Edit; an "Inspectors" group
    above "Crews"; capacity line "one per active inspector" when any exist. Crews API accepts kind; test.
B3. Calendar, jobs mode: inspector rows first under "Inspectors", crews under "Crews". Phone-booking chips drag onto INSPECTOR rows
    only (reuse the appointments-mode code: placeAppt, ApptTile/ScheduledApptTile, confirmAppt); jobs onto CREW rows only; a wrong
    drop says "Drag bookings onto an inspector, jobs onto a crew." Bookings the AI already assigned sit on their inspector's row, not
    in the Phone-bookings strip. Moving a booking to another day asks first ("This moves Carla's booking from Mon 1 PM to Tue 1 PM —
    she's told when you confirm"). On a 409 inspector_busy, show its message with "Assign anyway" (resend with force: true). Time
    blocks (GET /api/company/time-blocks) render on their row as grey hatched tiles with the label; each row label gets "＋ Block time"
    (label + start + end) and a block tile has × (DELETE). Confirm → PATCH confirm with notifyCustomer: true → toast from notifiedVia +
    staffNotified ("Confirmed · customer texted · Dominic notified").
B4. Field screen (/company/field) — "My schedule" for a member whose crew row is an inspector row, at the top: today + next 7 days of
    their bookings and blocks in time order (GET /api/businesses/[businessId]/appointments?from&to filtered by assignedCrewId, plus
    time-blocks): time, name, tap-to-call, address → maps, Access/URGENT, From the call. "＋ Block time" (quick labels: Site visit,
    Materials pickup, Office, Off) and × on their own blocks. Owner/Staff also get "Start inspection" → POST /api/jobs/from-request
    { businessId, appointmentId }, then select that job in the field log. Refresh when the screen regains focus.
B5. Phone-calendar feed (security-sensitive — follow exactly): POST /api/company/team/me/calendar-feed (the signed-in member only;
    verifyAuthAndRole with their own business) creates or rotates a token: 32 random bytes base64url, store ONLY its sha256 hex on
    their businessUsers doc as calendarFeedTokenHash, return the URL once. GET /api/calendar/feed/[token]: hash it, find the member
    by calendarFeedTokenHash (active only), else 404 with no detail; return text/calendar (RFC 5545: CRLF lines, escaped text, UTC
    times, stable UIDs `<appointmentId>@luxor`) with that member's row's bookings (not cancelled) + blocks from 7 days back to 60 ahead:
    SUMMARY "Inspection — <customer>", LOCATION the address, DESCRIPTION phone + Access/URGENT lines. Cache-Control private, no-store
    (never public). On My schedule: "Add to my phone calendar" → shows the webcal:// link + a copy button + "Reset link". Tests:
    unknown token 404, inactive member 404, a booking appears, escaping.

Part C — follow-up by text, not an AI voicemail
C1. RequestReviewCard: replace "Have the AI phone them to confirm" with "Tell them by": Text (only if bootstrap business.smsEnabled &&
    phone && textOk !== false) / Email (if an email) / "I'll call them" (shows a tel: link); default the first available; send
    notifyChannel ("sms" | "email" | "none").
C2. Every "Confirm & call customer" becomes "Confirm & text" / "Confirm & email" / "Confirm" by what's available. The AI outbound call
    stays only where someone explicitly asks for it (Calls → "Have the AI call back"), never a default.
C3. Settings: one read-only line "Text messages: On" / "Off — waiting for carrier registration (ask Luxor)".

Tests — only these (no full vitest, no full Playwright, no next build): npx tsc --noEmit; eslint on changed files; vitest for the
folders you touched; ONE new spec e2e/call-flow.spec.ts (desktop + phone). Make the booking with simulateCall from scripts/e2e/lib.cjs
(see how scripts/e2e/scenarios/booking.cjs books through the real tool webhook; give it notes "Access: gate 1010" and a summary).
Assert: nav order; the Pipeline opens on Booked and shows the Access line + From the call; the booking drags onto an inspector row
(desktop); a block shows on the row; an inspector member sees the booking and the block under My schedule (phone). For API setup
inside the spec copy the in-page api() helper from e2e/crews-calendar.spec.ts (page.request calls come back unauthenticated).
npm run e2e:up:bg once from your worktree; open the phone screenshots and fix anything unreadable or off-screen; npm run e2e:down.

Wrap up: IMPLEMENTATION_LOG entry (shell heredoc), set only the T-153 row in TODO.md to review, commit "T-153 complete".
Final message: commit table, spec result + screenshot paths, "Noticed, not done", QUESTION FOR INTEGRATOR.
```

### I0 — Integrator, **Claude Opus 5.5** — T-154 the live call + booking engine, then merges (paste to the integrator)
```
Run T-154 (docs/WORKER_QUEUE.md section I, plan docs/CALL-FLOW-FIX-PLAN.md). Order:
1. ElevenLabs agent agent_0101m3a5z9qxenybnpjsragg7dvt (shared, live): agents_get → save the config to the scratchpad for rollback →
   turn on end_call, voicemail detection (one short message, then hang up) and a silence end-call timeout (~15 s) → an agent test with
   a voicemail greeting as the user turn (expect end_call, no "are you still there") → re-run the saved agent tests.
2. Twilio (read-only, never print a secret): confirm no text was ever sent from +1 689 204 2643, read its messaging/registration
   status, then write the owner's NH-29 click-steps (toll-free verification vs A2P 10DLC) in docs/NEEDS-HUMAN-CHECKLIST.md.
3. Merge H3 when it reports (CalendarBoard: take main's side), and "T-152 Step 0" as soon as Deepseek commits it; tell the owner Codex
   can start.
4. Live path in worktree air-wt-call-live (branch fix/call-flow-live): agent prompt (plan §1 A/D/E/F — the escalation switch, the
   booking checklist, after-booking rules, roofing FAQs, drop the 24-hour rule), dispatcher (NOT ESCALATED guard, BOOKED wording with
   the channel and nextOpeningLabel, addBookingNote + schema, booking-time text via sendSms), booking engine (bookedAfterHours, textOk,
   capacity = active inspectors, time blocks count as busy, auto-assign to the first free inspector + notifyInspector after commit),
   outbound voicemail/name wording. Booking-change gate: S1–S14 + new rows (urgent → soonest, a block is never booked, auto-assign).
5. Merge I1 → wire → merge fix/call-flow-live → merge I2. One full gate run (vitest, next build, e2e:call, e2e:booking, e2e:test),
   push, verify the deploy, setup-elevenlabs-agent.mjs --update-tools (NEXT_PUBLIC_APP_URL=https://ai-roof.vercel.app; read the
   dry-run), agent tests (urgent leak books, email/OK-to-text/access asked before booking, no early "anything else", "Es Carla" →
   "Carla", addBookingNote after booking), then the owner's real call and the transcript read.
```
