# WORKER_QUEUE.md — who builds what next (single source of truth)

Updated 2026-09-24. Replaces the old `PENDING_WORKER_PROMPTS*.md` files. Rules for every worker are in `AGENTS.md`;
task specs are in `TODO.md`; this file only holds the **assignment queue and the paste-ready prompts**.

Deepseek is out of credits, so all remaining work goes to **two Codex sessions running in parallel**:

| Session | Queue (one at a time, in order) | Worktree(s) |
|---|---|---|
| **Codex A** | **A1** finish T-111b -> **A2** T-113 request review -> A3 T-109 email intake (prompt written later) | `air-wt-elevenlabs-hooks`, then `air-wt-request-review` |
| **Codex B** | **B1** T-114 feedback + UX pass -> **B2** T-107a document core (invoice + quote) -> B3 T-107b report (prompt written later) | `air-wt-ux-pass`, then `air-wt-documents-core` |

The two queues are file-disjoint by design (A: voice/webhooks/pipeline/calls/appointments/comms; B: nav/feedback/css/
documents/invoice/quote/report). Every worktree already exists, has `node_modules` junctioned, and is cut from `main`.
If one is missing, from the main repo: `git worktree add "D:/Apps/<name>" -b task/<branch> main` and junction
`node_modules` (PowerShell: `New-Item -ItemType Junction -Path "D:\Apps\<name>\node_modules" -Target "D:\Apps\6 - AI Receptionist\node_modules"`).

**State of main when this was written:** T-111a (provider seam) is merged locally (not pushed). Cancelled: T-108
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
Deepseek (when credits return): **deepseek-chat** (cheap default) vs **deepseek-reasoner** (thinking; use sparingly). If this ordering is wrong,
fix this section — every recommendation below follows from it.

Pick by RISK first, size second:

| Task looks like... | Use |
|---|---|
| Touches a live customer path (phone webhooks, outbound calls), auth/HMAC/secrets, money math, legal wording, or a data-loss risk | **Sol medium** (never below Terra medium). Have Claude review the diff before merge. |
| Multi-file feature with a clear spec and existing patterns to copy (UI + API + tests) | **Terra medium** |
| Bounded/mechanical: CSS tokens, copy/wording, renames, adding tests to existing code, doc edits | **Terra low** (or Luna low for pure text edits) |
| Ambiguous design, architecture, cross-cutting refactor, deciding between approaches | **Claude (integrator), not a worker** — write the spec first, then hand the well-defined build to Terra/Sol |
| Reviews, merges, conflict resolution, research, planning | **Claude** |
| Deepseek (when topped up) | **chat** for self-contained UI/tests/docs. **Not** for security-sensitive or live-path work (the T-111b run showed why); use **reasoner** only for a genuinely algorithmic problem. |

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
      src/lib/notify.ts, Codex B changes it in parallel). Sets appointment.status "cancelled" / lead.status "lost" and
      records `declinedAt`, `declineReason`, `decidedBy` (ADDITIVE optional fields on Lead/Appointment — own hunk in
      src/types/index.ts). No email on file => still declines internally and shows "No email on file — nothing was sent"
      (never claim a message was sent). Idempotent; a second decline never re-sends.
   c) **AI call back** (existing): keep the Call Back button on the card.
   Each decision shows a clear success/failure result and updates the Pipeline row live. Nothing here creates a job
   automatically.
3. Pipeline list: rows show a "New request" badge for `requested`/`new` items so the decision queue is obvious; decided
   items move to their existing tabs. The card must open from the Pipeline row AND from the Calls page.
Do NOT touch: src/app/api/calls/outbound/**, src/lib/notify.ts, src/lib/voice/**, src/app/api/webhooks/**, agentTools.ts,
documents/invoice/quote/report code, work-catalog code, nav/feedback components (Codex B owns T-114).
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

## B1 — Codex B: T-114 feedback fix + app-shell UX pass

**Suggested model: Terra, low -> medium.** Bounded, mostly CSS tokens/a11y/wording. Start Terra low; bump to medium only if it flounders on the modal/focus-trap work.

```
You are Codex session B on the AI Receptionist platform. Read docs/WORKER_QUEUE.md's "Worker etiquette" first.

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
"Paste this to Claude: Codex B on task/ux-pass is stuck on T-114: <question>."
```

---

## B2 — Codex B: T-107a document core + invoice + quote

**Suggested model: Sol, medium.** Largest task: money math must not drift, hide-toggle correctness across 3 renderings x 2 documents, a 2,250-line page to edit safely.

```
You are Codex session B on the AI Receptionist platform. Read docs/WORKER_QUEUE.md's "Worker etiquette" first.

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
work-catalog code (except reading findings), Library pricing, nav/feedback (Codex B's T-114 owns those — it is your own
previous item, already merged by the time you start), pipeline/calls/appointments (Codex A).
HARD RULES: never invent numbers — totals from the shared math; escape all free text; no placeholder text in any
customer-visible string; Cache-Control rule; mobile-check the in-app documents at 375px.
Tests: every combination of hideMaterials x hideLabor for invoice AND quote across groups.ts and BOTH email HTMLs (assert
hidden worker names/hours/rates/material names/prices are ABSENT and true totals PRESENT); letterhead precedence (library
default > legacy logoUrl > none); escaping; routes validate/persist new fields; legacy docs render.
Gates green: type-check, lint, `vitest run`, `next build` once. Append evidence to docs/IMPLEMENTATION_LOG.md, set T-107a to
`review` in TODO.md. Never push/merge/touch main. If stuck >20 min: commit WIP, add HELP-NEEDED to TODO.md, end with
"Paste this to Claude: Codex B on task/documents-core is stuck on T-107a: <question>."
```

---

## Written later (when the previous item merges)

- **A3 — T-109** (Sol medium — abuse/spam + inbound-email security) email -> request intake (creates a LEAD for review, never a job; needs the inbound-email domain: NEEDS-HUMAN).
- **B3 — T-107b** (Terra medium; Sol medium if T-107a's shared layer needed rework) the REPORT: shared letterhead + options, hide materials/labor toggles, Problem / Corrective-action photo pages
  with Before/After, a deterministic `draftNarrative` + "Draft from job" buttons on invoice/quote/report, technicians on the
  report, and the emailed-report logo fix. Builds on T-107a's `src/lib/documents/`.
- **Conditional on tomorrow's voice bake-off (T-110):** T-106 bilingual line (Sol medium: live-call turn-taking risk) and the T-112 ElevenLabs follow-ups (Sol medium for anything on the live call path, Terra for admin/onboarding UI).
