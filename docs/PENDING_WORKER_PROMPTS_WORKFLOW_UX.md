# Pending worker prompts — request-review workflow + UX pass

Saved 2026-09-24. **Owner decision (2026-09-24): jobs are NEVER auto-created.** The phone AI captures a request; the
admin/user reviews it and decides. This replaces the old T-108 ("auto-create a job from a call") — that prompt in
`PENDING_WORKER_PROMPTS_WAVE2.md` is CANCELLED, do not use it.

Worktrees (already created by the integrator, `node_modules` junctioned, cut from `main` at the SHA in each prompt):
- `D:\Apps\air-wt-request-review` (branch `task/request-review`) — Deepseek, T-113
- `D:\Apps\air-wt-ux-pass` (branch `task/ux-pass`) — Codex, T-114

If either is missing, recreate from the main repo, then junction `node_modules`:
```
git worktree add "D:/Apps/air-wt-request-review" -b task/request-review main
git worktree add "D:/Apps/air-wt-ux-pass"        -b task/ux-pass        main
# PowerShell: New-Item -ItemType Junction -Path "D:\Apps\air-wt-<name>\node_modules" -Target "D:\Apps\6 - AI Receptionist\node_modules"
```

Queue per agent (each agent takes ONE at a time):
- **Codex:** T-111a -> T-114 (small, quick win) -> T-107a -> T-107b
- **Deepseek:** T-111b -> T-113 -> T-109

---

## Deepseek (Worker D) — T-113: request review & decision workflow

```
You are Worker D for the AI Receptionist platform.

Work ONLY inside: D:\Apps\air-wt-request-review   (branch task/request-review, cut from main <SHA in TODO/log>)
This worktree ALREADY EXISTS with node_modules junctioned. Do not run npm install or git worktree add.
BEFORE YOUR FIRST EDIT run `git rev-parse --show-toplevel` and `git branch --show-current`; they must be
D:/Apps/air-wt-request-review and task/request-review. Re-check before your commit. Never edit
"D:\Apps\6 - AI Receptionist" (main repo). If the path does not exist, STOP and report.

Read AGENTS.md fully, CLAUDE.md's Industry-Applicability + Customer Entity + Cache-Control rules, TODO.md Phase 20 ->
T-113, then the code you will change: src/app/company/pipeline/page.tsx (lead detail, appointment cards, T-083 "Create
<jobNoun>", the "Confirm & notify customer" flow), src/app/company/calls/page.tsx ("This call produced" links, T-084),
src/app/api/appointments/send-confirmation/route.ts, src/app/api/appointments/[appointmentId]/route.ts,
src/app/api/businesses/[businessId]/leads/[leadId]/route.ts, src/lib/pipeline/*, src/types/index.ts (Lead status
"new|contacted|booked|closed|lost"; Appointment status "requested|confirmed|cancelled|completed"),
src/lib/recordingDisclosure.ts is irrelevant here — do not touch it.

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
      also tick "Have the AI phone them to confirm" (use the EXISTING POST /api/calls/outbound exactly as it is today — do
      NOT modify that route; Codex is rewiring it for a voice-provider seam in parallel), then opens the T-083 prefilled
      job form (buildJobPrefillUrl) — the job is created by the USER submitting that form, as today. Appointments-mode
      tenants (no jobs module): "Confirm appointment" + the same notify options; no job button.
   b) **Decline**: "Decline & notify" — choose a reason (Outside our service area / Not a service we offer / Fully booked /
      Unable to reach you / Other + optional custom sentence <= 300 chars, plain text), preview the message, then send
      a polite, non-blaming, branded decline email when an email is on file (NEW pure, unit-tested template in a NEW
      file src/lib/comms/requestDeclineEmail.ts using the tenant's logo/colors the same way send-confirmation does — do
      NOT edit src/lib/notify.ts, Codex changes it in parallel). Sets appointment.status "cancelled" / lead.status "lost"
      and records `declinedAt`, `declineReason`, `decidedBy` (ADDITIVE optional fields on Lead/Appointment — own hunk in
      src/types/index.ts). No email on file => still declines internally and shows "No email on file — nothing was sent"
      (never claim a message was sent). Idempotent; a second decline never re-sends.
   c) **AI call back** (existing): keep the Call Back button on the card.
   Each decision shows a clear success/failure result and updates the Pipeline row live. Nothing here ever creates a job
   automatically.
3. Pipeline list: rows show a "New request" badge for `requested`/`new` items so the decision queue is obvious; decided
   items move to their existing tabs. Reachability: the card must open from the Pipeline row AND from the Calls page.
Do NOT touch: src/app/api/calls/outbound/**, src/lib/notify.ts, src/lib/voice/**, src/app/api/webhooks/**, agentTools.ts,
documents/invoice/quote/report code, work-catalog code, nav/feedback components (Codex T-114).
HARD RULES: one-teal design system (.button variants, no #2563eb, no per-page inline button styles); escape all
free text in the email; Cache-Control rule; RBAC: only owner/staff/superadmin can decide (verifyAuthAndRole);
mobile-check at 375px.
Tests: missing-info detector; decline route/handler auth + idempotency + no-email path; decline email template
(escaping, reason wording, no blame); status transitions; card model builder (fields per vertical incl. T-100 intake);
Pipeline/Calls opening the same card.
Gates green: type-check, lint, `vitest run`, `next build` once. Append evidence to docs/IMPLEMENTATION_LOG.md, set T-113 to
`review` in TODO.md. Never push/merge/touch main. If stuck >20 min: commit WIP, add HELP-NEEDED to TODO.md, end with
"Paste this to Claude: Worker on task/request-review is stuck on T-113: <question>."
```

---

## Codex (Worker C) — T-114: UX pass — feedback + app shell

```
You are Worker C for the AI Receptionist platform.

Work ONLY inside: D:\Apps\air-wt-ux-pass   (branch task/ux-pass, cut from main <SHA in TODO/log>)
This worktree ALREADY EXISTS with node_modules junctioned. Do not run npm install or git worktree add.
BEFORE YOUR FIRST EDIT run `git rev-parse --show-toplevel` and `git branch --show-current`; they must be
D:/Apps/air-wt-ux-pass and task/ux-pass. Re-check before your commit. Never edit
"D:\Apps\6 - AI Receptionist" (main repo). If the path does not exist, STOP and report.

Read AGENTS.md fully, CLAUDE.md's design-system rule (one teal var(--accent), .button variants, no #2563eb), TODO.md
Phase 20 -> T-114, then: src/components/ui/FeedbackForm.tsx, src/app/api/feedback/route.ts, src/app/admin/admin-nav.tsx,
src/app/hub/hub-nav.tsx, src/app/company/company-nav.tsx, the nav/sidebar/modal/`.button` CSS in src/app/globals.css,
src/app/admin/businesses/SyncPersonasPanel.tsx, src/contexts/AuthContext.tsx (profile / superadmin flag).

Task T-114 — feedback fix + a bounded UX pass on the app shell. Commits prefixed `T-114:`.
1. FEEDBACK is for CLIENT users to send to the Luxor team; SUPERADMIN never needs it. Hide the Feedback button AND do not
   mount FeedbackForm for superadmins in ALL three navs (admin, hub, company — including when a superadmin is previewing a
   client via ?preview=). Client users still see it. (Use the existing superadmin flag from the auth profile; never
   flash the button before the profile resolves.)
2. FEEDBACK FORM wording is client-facing: title "Send feedback to Luxor" (or "Talk to the Luxor team"); replace the
   misleading "From <email>" row with a read-only "We'll reply to: <their email>" (muted) + one line saying it goes
   to the Luxor team, not their own company; keep category + message + counter; add a clear success state ("Thanks — we
   read every message") and a sensible error state; disabled "Send" must have readable contrast (currently a pale teal that
   is hard to read). Do not change the API contract in a way that breaks existing submissions.
3. VISIBILITY: the Feedback control in the DARK admin/hub sidebar currently renders as a low-contrast pale box and is
   hard to see. Give the three navs ONE consistent treatment: a normal nav item with icon and label (in the company nav,
   under "Help": Guide + Feedback), legible in both the dark and light sidebars, with hover/focus/active states.
4. BOUNDED APP-SHELL UX PASS (do not redesign pages): (a) contrast audit of nav items, badges (SUPERADMIN), chips, disabled
   buttons and muted text against WCAG AA in light and dark surfaces — fix with tokens in globals.css, not per-page
   overrides; (b) visible keyboard focus rings on nav links, buttons, modal controls; (c) touch targets >= 40px and the
   mobile hamburger/nav behaving (open/close, focus trap, Esc) in all three shells; (d) modal/Sheet consistency (spacing,
   close button, backdrop, focus return) for FeedbackForm and one other existing modal; (e) tidy the "Sync live phone
   assistants" panel on Admin -> Clients (the Preview button floats alone on the right with a big empty gap — align it
   with the text, make the result list scannable); (f) list before/after screenshots you reviewed (375 / 768 / 1280px) in
   the log — use Playwright or your browser tooling if available, otherwise say plainly what you could not check.
Do NOT touch: pipeline/calls pages, appointments/leads routes, src/lib/notify.ts (Deepseek/other workers own request
review, documents and comms in parallel), src/lib/voice/**, webhooks, invoice/quote/report.
HARD RULES: tokens over hard-coded colors; no new dependencies; a11y-first; do not remove any nav destination
(Navigation Completeness Rule in CLAUDE.md).
Tests: FeedbackForm renders for a client user and NOT for superadmin (all three navs); wording; the disabled-state
class/contrast token; existing nav tests still pass.
Gates green: type-check, lint, `vitest run`, `next build` once. Append evidence to docs/IMPLEMENTATION_LOG.md, set T-114 to
`review` in TODO.md. Never push/merge/touch main. If stuck >20 min: commit WIP, add HELP-NEEDED to TODO.md, end with
"Paste this to Claude: Worker on task/ux-pass is stuck on T-114: <question>."
```
