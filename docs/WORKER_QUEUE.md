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
| 1 | E3 Job page restructure (numbered tabs, newest-first Activity, Issues -> Findings, picker sheet fix) | **Integrator (Claude)** — Codex B stopped partway; its commits are kept | `D:/Apps/air-wt-job-page` / `task/job-page` | in progress (integrator) |
| 1 | E4 AI-PROVIDERS.md, Florida notices DRAFT memo + legalNotices.ts, seeded call transcripts | Deepseek V4.1 Flash, Thinking: Hard | `D:/Apps/air-wt-docs-legal` / `task/docs-legal` | **DONE, merged to local main 2026-09-26** |
| 2 | E2 Scheduling truth, list order, jobs paging + CSV, classify fallback | **Codex B**, GPT-6 Sol, medium (moved from A: disjoint files) | `D:/Apps/air-wt-schedule-lists` / `task/schedule-lists` | ready — start now |
| 2 | E5 Documents: invoice wording, report fixes, Include quote, Terms & notices | Codex B, GPT-6 Sol, medium | `D:/Apps/air-wt-documents-2` / `task/documents-2` | after E3 + E4 merge |
| 3 | E6 Photos on documents (Before/After pairs, 4 per page) + drag-and-drop | Codex B, GPT-5.5 Terra, medium | `D:/Apps/air-wt-photos` / `task/doc-photos` | after E5; integrator installs @dnd-kit/sortable on main first |

File ownership is disjoint per wave (see the plan's "Hot files" list): page.tsx is E3 -> E5 -> E6 in sequence; verifyRole.ts is E1 only; agentTools.ts is E2 only.
