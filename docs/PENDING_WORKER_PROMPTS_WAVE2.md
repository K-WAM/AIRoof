# Pending worker prompts — WAVE 2 (queued behind wave 1)

Saved 2026-09-24. Wave 1 (T-111a Codex, T-111b Deepseek) is in `docs/PENDING_WORKER_PROMPTS.md`.
Each agent takes ONE prompt at a time. Suggested order:

- **Codex:** T-111a -> **T-107a** -> T-107b
- **Deepseek:** T-111b -> **T-108** -> T-109

T-107a is independent of T-111: its worktree already exists (cut from `c997cf4`).
**T-108 must be cut AFTER T-111b is merged** (both touch the webhook/tool layer). The integrator then runs:
`git worktree add "D:/Apps/air-wt-job-from-call" -b task/job-from-call main` and junctions `node_modules`
(PowerShell: `New-Item -ItemType Junction -Path "D:\Apps\air-wt-job-from-call\node_modules" -Target "D:\Apps\6 - AI Receptionist\node_modules"`).

---

## Codex (Worker C) — T-107a: document core + invoice + quote

```
You are Worker C for the AI Receptionist platform.

Work ONLY inside: D:\Apps\air-wt-documents-core   (branch task/documents-core, cut from main c997cf4)
This worktree ALREADY EXISTS with node_modules junctioned. Do not run npm install or git worktree add.
BEFORE YOUR FIRST EDIT run `git rev-parse --show-toplevel` and `git branch --show-current`; they must be
D:/Apps/air-wt-documents-core and task/documents-core. Re-check before your commit. Never edit
"D:\Apps\6 - AI Receptionist" (main repo). If the path does not exist, STOP and report.

Read AGENTS.md fully, CLAUDE.md's Cache-Control rule, src/types/documentOptions.ts (the SHARED CONTRACT — do not
change it; optional additions only, say so), TODO.md Phase 18 -> T-107, and LOOK AT the reference document:
"Roof Doctor's Invoice.pdf" in the repo root (open both pages). Then study the current documents:
src/app/company/jobs/[jobId]/page.tsx (Invoice tab document + print twin-render), QuotePanel.tsx,
src/lib/billing/jobInvoiceEmailHtml.ts, jobQuoteEmailHtml.ts, src/app/api/jobs/[jobId]/invoice/**, quote/**,
src/lib/branding/logo.ts, src/types/invoice.ts, src/types/quote.ts.

Task T-107a — a shared document layer + a modern, consistent INVOICE and QUOTE. Commits prefixed `T-107a:`.
1. Shared pure modules in NEW src/lib/documents/ (all unit-tested):
   - groups.ts: from labor/materials/other lines + DocumentOptions -> display groups. hideMaterials => ONE lump
     "Materials" subtotal row; hideLabor => ONE lump "Labor" subtotal row (NO worker names, hours or rates);
     both => two lump rows + total. TOTALS ARE ALWAYS THE TRUE TOTALS (never recomputed from hidden rows
     differently than the shared jobInvoice.ts math).
   - letterhead.ts: resolve the letterhead once — logo via the Library logo library (pickDefaultLogo, correct
     variant per surface via logo.ts; fall back to legacy businessConfig.logoUrl), business name, address, phone,
     email, website, NEW `licenseNumber`. Escape everything used in HTML. Export `resolveEmailLogo(db, businessId)`
     for server routes.
   - emailBlocks.ts: reusable HTML blocks (letterhead, title + meta block, bill-to, narrative paragraph, group table,
     boxed total, footer with license # + website), inline-styled for email clients.
2. Apply to INVOICE and QUOTE in all three renderings (in-app document, print/PDF twin-render, emailed HTML):
   - Toggles "Hide materials" and NEW "Hide labor details" on both (use the existing Toggle component; the editor
     always shows every row — the toggles control the customer copy: preview, print, email). Persist as top-level
     optional booleans on JobInvoice/JobQuote (`hideMaterials` already exists; add `hideLabor`, `showTechnicians`);
     PATCH routes validate them. Existing invoices with no field = defaults, no migration.
   - Layout: a modern take on the reference — letterhead left (logo, name, address, phone, email, license #), a large
     title ("Invoice"/"Quote") in the tenant accent color top-right, a clean meta block (Date, Number, Terms /
     Valid until, Reference = job id, Service at), Bill-to, an editable "Description of work" narrative paragraph
     (NEW persisted `narrative` string <= 4000 chars, plain text, printed as a paragraph like the reference; NO
     auto-draft button yet), Labor and Materials groups each with a subtotal, a boxed Total Due / Estimated Total,
     footer. Simple, spacious, one-teal design tokens for the app UI; the customer copy uses the tenant accent.
   - `showTechnicians`: an optional "Technicians" line in the meta block; the user picks names from the team/crews
     (if the team list is not readable by staff, fall back to workerNames already logged on the job + free text);
     stored as `technicians: string[]` (<= 10, plain text, length caps).
3. Logo consistency: EVERY document/email that shows a logo goes through the letterhead resolver — also replace the
   legacy `biz.logoUrl` (+ invert filters) in src/app/api/appointments/send-confirmation, src/app/api/jobs/[jobId]/assign
   and src/lib/notify.ts. Do NOT touch the REPORT (in-app renderer or report/send route) — that is T-107b.
4. `licenseNumber?: string` (<= 40 chars) on BusinessConfig; owner edits it in Company Settings next to contact
   phone/email via the existing settings PUT (validate; plain text). Show it in the letterhead + footer.
Do NOT touch: the report tab/ReportRenderer, report/send, src/lib/voice/**, src/app/api/webhooks/**, agentTools.ts,
work-catalog code (except reading findings), Library pricing.
HARD RULES: never invent numbers — totals from the shared math; escape all free text; no placeholder text in any
customer-visible string; Cache-Control rule; mobile-check the in-app documents (the app view must not overflow at 375px).
Tests: every combination of hideMaterials x hideLabor for invoice AND quote across groups.ts and BOTH email HTMLs
(assert hidden worker names/hours/rates/material names/prices are ABSENT and true totals PRESENT); letterhead
precedence (library default > legacy logoUrl > none); escaping; routes validate/persist new fields; legacy docs render.
Gates green: type-check, lint, `vitest run`, `next build` once. Append evidence to docs/IMPLEMENTATION_LOG.md, set T-107a
to `review` in TODO.md. Never push/merge/touch main. If stuck >20 min: commit WIP, add HELP-NEEDED to TODO.md, end with
"Paste this to Claude: Worker on task/documents-core is stuck on T-107a: <question>."
```

---

## Deepseek (Worker D) — T-108: auto-create a job from a booked call

```
You are Worker D for the AI Receptionist platform.

Work ONLY inside: D:\Apps\air-wt-job-from-call   (branch task/job-from-call, cut from main <integrator fills in the sha>)
This worktree ALREADY EXISTS with node_modules junctioned (the integrator creates it before handing over this
prompt). Do not run npm install or git worktree add.
BEFORE YOUR FIRST EDIT run `git rev-parse --show-toplevel` and `git branch --show-current`; they must be
D:/Apps/air-wt-job-from-call and task/job-from-call. Re-check before your commit. Never edit
"D:\Apps\6 - AI Receptionist" (main repo). If the path does not exist, STOP and report.

Read AGENTS.md fully, CLAUDE.md's Industry-Applicability + Customer Entity rules, TODO.md Phase 18 -> T-108, then
src/lib/tools/agentTools.ts (bookAppointment), src/app/api/jobs/route.ts (job creation: atomic J-XXXX id),
src/lib/customers/resolve.ts, src/app/company/pipeline/page.tsx (appointment card "Create Job", T-083),
src/app/company/jobs/page.tsx, src/app/company/settings/**.

Task T-108 — auto-create a job from a booked call (jobs-module tenants only). Commits prefixed `T-108:`.
1. `autoCreateJobFromCall?: boolean` on BusinessConfig (default OFF; missing = off). Owner-editable toggle in
   Company Settings ("Create a job automatically when a call books an appointment"), shown only when the
   `jobs` module is enabled (useBusinessModules); owner/superadmin only via the settings PUT.
2. Extract the job-creation core from src/app/api/jobs/route.ts into a shared pure-ish `createJobRecord(db, {...})`
   (a behavior-preserving refactor with tests; the route uses it too).
3. In bookAppointment (agentTools.ts), after the appointment is written: if the tenant's setting is on and the jobs
   module is enabled, create a linked DRAFT job via createJobRecord — customer resolved through resolveCustomer
   (matchKey; the flat clientName/phone/address fields are a point-in-time snapshot), title/service/address/intake
   notes carried in, status "open", NO crew assignment and NO scheduledStart (the calendar must not change), `source:
   "call"`, `appointmentId` on the job and `jobId` back on the appointment. IDEMPOTENT per appointment (never two jobs
   for one appointment, even on webhook retries). A failure to create the job must NEVER fail or roll back the booking
   — log and continue. This path serves both the Vapi and (T-111b) ElevenLabs webhooks because both call agentTools.
4. UI: the Pipeline appointment card shows "Job J-XXXX" (link) when linked, and the manual "Create Job" button opens
   the existing job instead of creating a duplicate; the Jobs list shows a small "From call" chip. Vocab via
   useBusinessModules (never hardcode "Job").
Do NOT touch: src/lib/voice/**, src/app/api/webhooks/** (only agentTools.ts is the integration point), documents /
invoice / quote / report code, work-catalog code.
Tests: setting off => no job; on => exactly one job even on repeated bookAppointment calls; job failure does not fail the
booking; jobs-disabled tenant never creates one; customer resolve reuse; the refactored jobs route unchanged; Pipeline
link/dedupe logic.
Gates green: type-check, lint, `vitest run`, `next build` once. Append evidence to docs/IMPLEMENTATION_LOG.md, set T-108
to `review` in TODO.md. Never push/merge/touch main. If stuck >20 min: commit WIP, add HELP-NEEDED to TODO.md, end with
"Paste this to Claude: Worker on task/job-from-call is stuck on T-108: <question>."
```

---

# WAVE 3 (prompts written when wave 2 merges)

- **T-107b (Codex)** — the REPORT: shared letterhead + options, hide materials/labor toggles, Problem / Corrective-action
  photo pages with Before/After, a deterministic `draftNarrative` (from findings + field log) with a "Draft from job"
  button on invoice/quote/report, technicians on the report, and the emailed-report logo fix. Builds on T-107a's
  `src/lib/documents/`.
- **T-109 (Deepseek)** — email -> job intake (needs the inbound-email domain set up first: NEEDS-HUMAN).

# CONDITIONAL (after tomorrow's T-110 bake-off)

- **T-106** bilingual phone line, and the **T-112** ElevenLabs follow-ups (tools on a test agent, number import,
  existing-number forwarding onboarding) — their shape depends on which provider wins.
