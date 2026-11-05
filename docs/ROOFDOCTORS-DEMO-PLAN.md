# Roof Doctors tailored review: build plan

**Review:** Friday November 13, 10 a.m., with Michael (owner), Carlita (office coordinator) and Dominic (supervisor).
**Written:** 2026-11-04 by Claude (integrator). **Status:** plan, waiting for owner approval. Nothing below is built yet.
**Paste-ready worker prompts:** `docs/WORKER_QUEUE.md` section K. **Task rows:** `TODO.md` → "Roof Doctors tailored review".
**Menu simplification proposals (approve/reject):** `docs/mockups/simpler-menus.html` (open in a browser).
**Private source files:** `client-resources/` (git-ignored, real client data, never committed). Index: `docs/clients/ROOFDOCTORS-RESOURCES.md`.
**Rules for every agent:** `AGENTS.md` plus §10 below.

---

## 1. What the review must show

Roof Doctors liked the first demo. On November 13 they want to see **their own business** running in the app. The owner's rules:
keep it simple, don't add menus where a page can hold it, don't remove anything yet, label anything unfinished as a
preview, and use pre-filled data where real data isn't needed.

**The storyline (one representative job, about 25 minutes):**

1. Their workspace: their logo, their 191 customers with properties inside each customer, their materials and labor rates.
2. A property manager calls the AI line about a leak. The AI answers as Roof Doctors, books an inspection or captures a T&M
   request, and the request lands in their Pipeline. The office reviews it; jobs are never created automatically.
3. The job: an inspection at one of their real properties. Findings go into their **proposal letter** (scope of work, price in
   words, terms, Dominic's signature block), or for leak calls into their **T&M work authorization** with their rates. The
   customer accepts or authorizes online.
4. A **deposit invoice** (50% progress billing), the document Jobba never delivered in 4 months.
5. Field: the foreman's phone gets a Spanish voice note, photos and clock in/out. The office sees it straight away.
6. The finish: a **Repair Completion Notice** or **Inspection Completion Notice** with photos, then the final invoice in their
   layout, less the deposit, then the payment recorded.
7. The owner's view: **Finances** from their own invoice history, with simple filters; **Payroll** hours from the time clock
   (preview); **online payments** shown as a preview, with Stripe as the intended processor.
8. Seven role views: what the owner, management, supervisor, office admin, front desk, foreman and technician each see.
9. Support: feedback becomes a ticket with a status and an expected fix date. This answers their main complaint about Jobba.
10. Close: a small pilot proposal, training by role and language (from their staff survey), and price below Jobba's.

## 2. What we learned (audit of everything on file, 2026-11-04)

**From the conversations (`01-conversations/chat-nov-2026.md`):**
- 90% commercial work, mostly for **property managers** and associations. It's a boutique, premium company with loyal repeat
  customers. Talk about property managers, not homeowners.
- Price: Jobba costs **$1,289/month including 10 users** and charged about $20k to set up. Carlita: "He won't pay more than
  what he is paying now… keep it cheaper. Don't add more features." Michael values honesty and people who don't overpromise.
  → **No new AI-cost features** for this review (no AI chat assistant, no new AI summaries).
- Pain points with Jobba: the deposit invoice request was ignored for 4 months; a week without being able to send invoices;
  no answer on support; inaccurate reports with duplicate invoices; too many unused pages; confusing Powerboard colors; Jobba's
  sales material promised field tools that don't exist.
- What they do use: the Powerboard, monthly sales, technician hours for payroll (punch in at the office, punch out on return),
  and marking invoices paid.
- T&M flow: send a T&M work authorization → the owner or property manager signs → it becomes a job.
- Payments: about $100–150k in sales a month; about half by ACH, the rest mostly checks, cards rarely. Michael closed a card
  processor over inactivity fees.
- Volume: at least 10 jobs a week, 20+ photos each. **Pilot blocker:** photos on the free Firebase plan fill up in a few months
  (NH-32 + T-248 needed before a pilot, not before the review).
- Dominic (the owner's nephew) knows Jobba best; Carlita is next.

**From the Jobba screens (`jobba-benchmark/app-screens/`):**
- 19 menu items plus 22 Setup pages. Every list is a 10+ column grid with "drag a column header to group by", page numbers and
  "…" menus.
- The Aged Receivables report packs a filter column, 3 number boxes, 4 charts, a gauge and a table onto one screen (they don't
  use it).
- The Powerboard is crews as rows × weekdays. Work-order cards show time, property, WO/WR numbers, a job-type code (T&M,
  FP-PJ, Maintenance Inspection) and a status shown only by color (purple/teal/grey). On the left is a list of 59 unscheduled
  items.
- Their words: **Work Order (WO#)**, **Customer ID codes** (ABC01), **Properties** under each customer (one association has
  261), job types (T&M, Maintenance Inspection, Service Fixed Price, Proposal Request, Standard Inspection), crews named after
  the foreman ("Antonio's Crew"), labor types (Inspection per job; Production / Service / Transportation per hour).

**From their documents (`03-documents/`). These are the seven document types:**

| Their document | Notes from the sample |
|---|---|
| Repair proposal (PDF + editable Word) | Letter: scope-of-work bullets, Note, Unforeseen Conditions, optional Ponding Water clause, Quality Assurance, price in words and figures (valid 10 days), payment schedule, terms (1.5%/month late), "Accepted by / Date / Printed name", signed by Dominic Jacobazzi, Service Supervisor-Estimator |
| Time & Material work authorization (Word) | Rates: Foreman $95/h, Roof Mechanic $95/h, after-hours $575 first hour then $395/h, $395 minimum portal to portal, materials at cost + 22%, 2-technician minimum, 3% card fee; "Authorized by" signature |
| Invoice: final billing | Header: Date, Invoice No., Terms, Description, Customer WO, Reference (Work Order), PO Number, Service at (a property, not the bill-to); Customer ID; opening paragraph ("Pursuant to…"); grouped lines with subtotals; Total Due; license number; attached photo pages ("Section 1 – Clubhouse", Problem, Corrective Action, Before/After) |
| Invoice: T&M | Labor lines by role (Service Foreman / Roof Mechanic × hours × $95) plus one Materials line (= our "bundle materials") |
| Deposit invoice | "Progress Billing: 50.00% Complete", one line, its own invoice number |
| Inspection Completion Notice (ICN) | Price-free letter for the maintenance program; their mark-up shows exactly which text is fixed and which is filled in |
| Repair Completion Notice (RCN) | Price-free letter listing several locations, "There is no charge" when it applies; note: **the logo must be selectable between their two companies (Roof Doctors and RCU)** |

The RFI asks them to name the seven; the list above is our working version from the 8 files they sent. Confirm it from their
RFI reply before calling a document by name in front of Michael (handoff rule: don't invent names).

**From their data export (`02-data-export-jobba/`):** 191 customers (no phones or emails in the export), 1,042 properties,
248 inspections, 326 invoices (March–November 2026, about $50–300k a month, no duplicate IDs), 194 materials in 10 categories,
and 11 vendors (manufacturers). Missing for caller recognition: Jobba's **Contacts** export.

**Our app today (screens in `test-results/screens/`):** 13 menu items for an owner; a job has 8 tabs (Activity, Photos,
Materials, Labor, ① Findings ② Quote ③ Report ④ Invoice). Invoices already have opening/closing text, terms and a PO number,
and businesses have a license number field. The sidebar always shows the Luxor logo. Built but not merged: the T-289 preview
pages (Finances, Payroll, Permit Leads) and the T-290 daylight-saving fix.

## 3. Decisions (owner can overturn any of these)

- **D1. A private workspace.** Roof Doctors gets its own business (`roofdoctors`, purpose `client`, roofing template). Never
  `demo-roofing` (Demo Studio rewrites it) and never a `/try` sandbox. Tenant isolation keeps it out of every demo. The
  workspace is built so the review setup becomes the pilot setup with no rework.
- **D2. Imported history is read-only and can't send anything.** Jobba invoices go in a separate collection, `invoiceHistory`:
  no cron, reminder or email path reads it. Billing reminders are off for this workspace. No customer emails are imported. An
  **evaluation guard** (T-306) lets this workspace's customer emails reach only addresses on its allowlist.
- **D3. Their own phone agent on the existing number (owner, 2026-11-04: "we will use the existing phone number").** For the review week the demo line +1 (689) 204-2643 is pointed at a Roof Doctors ElevenLabs agent and the `roofdoctors` workspace through the phone-line registry (its `previousRouting` restores demo-roofing afterwards). While it points there, other demos on that line hear Roof Doctors, so the switch happens Tue Nov 10 and is reversed after the review. No new number is bought. Original text: One ElevenLabs agent per client (standing decision), duplicated from the base
  agent, with a tailored prompt (commercial and property managers, 24-hour emergency service, inspection vs. T&M, Spanish) and
  a South Florida number. Follows `docs/ELEVENLABS-AGENT-PLAYBOOK.md`. Fallback: the demo line with a "Roof Doctors" persona.
- **D4. Branding.** Their logo (plus the RCU logo) in the logo library, on every document and email, and in the app's sidebar.
  The app's buttons keep the one teal accent (design-system rule); their colors show on documents and emails. Logo source:
  `client-resources/roofdoctors/04-brand/Roof_Doctors_Transparent.svg` (a vector redraw supplied with the ChatGPT handoff; no scripts) until their original arrives
  through the RFI. Check it against their letterhead before the review, and convert it to PNG before it goes into the logo
  library: never upload SVG files, which can carry scripts. The RCU logo comes from their Word files (`word/media/`).
- **D5. Documents fit inside the existing job steps; no new tabs.** Quote step: Itemized quote / Proposal letter / T&M
  authorization. Report step: Report / Inspection completion notice / Repair completion notice. Invoice step: Invoice /
  Deposit invoice. One letter-template engine with a fixed list of fill-in fields drives all of them.
- **D6. Previews are honest.** Payments and Payroll carry a "Preview" badge and can't write, send or charge anything.
  Finances runs on their real imported numbers, and the screen explains each number. Permit Leads stays hidden for Roof
  Doctors: they are a boutique company with loyal customers, and a lead tool adds a menu item they didn't ask for.
- **D7. Add, don't remove.** New pages (Finances, Payroll) appear only for this workspace (showcase switch). Menu merges are
  proposals only (`docs/mockups/simpler-menus.html`, M1–M6) and are built after the review, one approval at a time.
- **D8. Surveys and onboarding portal: keep the ChatGPT-built portal for Roof Doctors.** It's live, separate from our app (zero
  risk), and the RFI went out today. Don't rebuild it before the review. Options and the long-term plan are in §13.
- **D9. No live card processing, no texting, no history-migration promise.** Stripe is shown as the intended processor;
  payment setup and any Luxor management service are priced separately (handoff rule).

## 4. What gets built (scope for November 13)

| # | Item | Task | Stream | Live or preview |
|---|---|---|---|---|
| 1 | Fix: invoice $0 while the report shows ~$1,700 | T-258 | K1 Codex A | live (bug) |
| 2 | Letter templates + their 7 documents (proposal, T&M authorization, invoice layout, T&M invoice, deposit invoice, ICN, RCN) + letterhead pick (Roof Doctors / RCU) | T-304 | K1 Codex A | live |
| 3 | Fix: calendar chips over dialogs | T-286 | K2 Codex B | live |
| 4 | Field screen: say why it's greyed out; obvious "hold to talk" | T-299, T-300 | K2 Codex B | live |
| 5 | Pipeline: visible Decline; edit caller details before confirming | T-288, T-287 | K2 Codex B | live |
| 6 | Their logo in the sidebar | T-302 | K2 Codex B | live |
| 7 | Showcase switch: Finances + Payroll in the menu for this workspace only | T-292 | K2 Codex B | live switch |
| 8 | Finances on real numbers, decluttered, with filters | T-294, T-301 | K2 (screen) + K3 (math) | live (their data) |
| 9 | Payroll overview from time-clock punches | T-285 | K2 (screen) + K3 (math) | preview |
| 10 | Online payments: the customer's pay page and the office view | T-293 | K2 Codex B | preview |
| 11 | Properties inside each customer | T-311 | K0 (contract) + K2 (screen) + K3 (import) | live |
| 12 | Seven role views (titles, user types, landing pages) | T-303 | K3 DeepSeek | live |
| 13 | Jobba import (customers, properties, materials, labor rates, invoice history, past inspections) | T-291 | K3 writes, K0 runs | live |
| 14 | Evaluation guard (email allowlist per workspace) | T-306 | K0 Claude | live |
| 15 | Roof Doctors phone agent on the existing demo line | T-307 | K0 Claude | live |
| 16 | The representative job, pre-filled + live parts | T-305 | K0 Claude | live |
| 17 | Demo run sheet + fallback screenshots | T-298 | K0 Claude | — |
| 18 | Merge T-289 previews + T-290 DST fix | T-289, T-290 | K0 Claude | live |
| — | Stretch if K1 finishes early: "+ From Library" materials picker | T-252 | K1 | live |

## 5. The seven documents: where each one lives

| Their document | In our app | Fill-in fields used | Notes |
|---|---|---|---|
| Repair proposal | Job → ② Quote → layout **Proposal letter** | date, customer, attention, service at, work order, scope bullets (from findings/quote lines), price + price in words, valid-for days, signer | Online "Accept" stays (existing quote link). Optional clauses (e.g. Ponding Water) are tick-boxes per proposal |
| T&M work authorization | Job → ② Quote → layout **T&M authorization** | date, customer, attention, service at, work description, rates table (from Library labor rates), materials markup %, minimum charge | "Authorize" = the existing accept link. Signed → office notified; the job is never created automatically |
| Invoice (final billing) | Job → ④ Invoice (today's invoice, their layout) | customer ID, bill to, service at, reference WO, PO, terms, description, opening paragraph (exists), grouped lines + subtotals, license | Photo pages reuse report photos (Before/After pairs) |
| Invoice (T&M) | Same, with labor lines by role and one Materials line | hours × rate per role from the job's labor | "Bundle materials" already exists |
| Deposit invoice | Job → ④ Invoice → **Request a deposit (%)** | percent, amount, agreement date | Own invoice number from the same counter. Final invoice shows "Less deposit (invoice #)" as a negative line, so totals never double count |
| Inspection Completion Notice | Job → ③ Report → layout **Inspection completion notice** | date, customer, service at, description, work order, program, renewal month | Price-free; photos attached |
| Repair Completion Notice | Job → ③ Report → layout **Repair completion notice** | date, customer, service at, approval date, locations list, work done, "no charge" option | Price-free; photos attached |

Their exact wording goes into their workspace only (loaded from `client-resources/`, never committed). The defaults shipped
in code are short, generic, industry-neutral templates.

## 6. Seven role views

Permissions come from the **role**; the **title** is descriptive only and never grants access (existing rule, `src/types/team.ts`).

| View | Example person | Role (permission) | Title | Opens on | Sees |
|---|---|---|---|---|---|
| Owner | Michael | Admin (owner) | Owner | Dashboard | everything, incl. Finances, Payroll, Team |
| Management | from the RFI | Admin (owner) | Manager (new title) | Dashboard | same as owner |
| Supervisor | Dominic | Office staff (staff) | Supervisor (new title) | Jobs | jobs, calendar, documents and prices; signs proposals |
| Office admin | Carlita | Office staff (staff) | Office admin (new title) | Dashboard | requests, calendar, billing, customers |
| Front desk | from the RFI | Office staff (staff) | Front desk (new title) | Pipeline | requests, calendar, customers |
| Foreman | from the RFI | Crew | Foreman | Field | field notes, photos, clock in/out, own crew's schedule |
| Technician | from the RFI | Crew | Technician | Field | same as foreman |

The RFI asks who can approve documents, view pricing, send invoices, issue refunds and manage users. Their answers become role
choices, not new code. A new permission (e.g. "front desk can't see prices") isn't built before the review. Demo logins use
owner-controlled addresses (aliases of the owner's own mailbox); Roof Doctors staff get real logins only when the owner says so.

## 7. Shared contracts (Claude commits these to `main` first, Wave 0)

These let three agents build at the same time. Every field is optional or new, so existing data and clients are unaffected.

```ts
// src/types/index.ts → BusinessConfig (additive)
/** Pages shown before they are generally released, for this business only (owner/admin). Missing = off. */
showcase?: { finances?: boolean; payroll?: boolean; payments?: boolean };
/** Evaluation guard: when present, customer-facing email from this business goes only to these addresses (lower-case);
 *  everything else is skipped and logged. Missing = normal sending. */
outboundEmailAllowlist?: string[];

// src/types/customer.ts → Customer (additive)
export interface CustomerProperty { name?: string; address: string; city?: string; state?: string; zip?: string; sourceRef?: string }
properties?: CustomerProperty[];   // at most 500 per customer
customerCode?: string;             // their short Customer ID, e.g. "ABC01"; shown on documents

// src/types/invoiceHistory.ts (new) — businesses/{bid}/invoiceHistory/{id}; read-only, never sent or reminded
export interface InvoiceHistoryRecord {
  id: string;                // `${source}-${sourceInvoiceId}`
  source: "jobba";
  sourceInvoiceId: string;   // "0086729"
  issuedAt: number;          // ms at local noon of the Date column, business timezone
  workName: string;          // CSV "Name" (e.g. "Maintenance")
  billTo: string;            // CSV "Bill To" (customer name)
  customerId?: string;       // our customer, when matched by matchKey
  amount: number;            // dollars, 2 decimals
  tax: number;
  credits: number;
  amountDue: number;
  paidAt?: number;           // ms, from the "Paid" date column
  voided: boolean;
  status: string;            // Jobba's status text, kept as-is
  importedAt: number;
}
/** Same file: a past inspection/work order from Jobba — businesses/{bid}/jobHistory/{id}; read-only, shown on the customer. */
export interface JobHistoryRecord {
  id: string; source: "jobba"; sourceId: string; customerId?: string; customerName: string; property?: string;
  address?: string; city?: string; state?: string; zip?: string; status: string; jobType?: string; createdBy?: string;
  dueAt?: number; importedAt: number;
}

// src/types/invoice.ts → JobInvoice (additive; K1 implements the behaviour, K2/K3 only read `kind`)
kind?: "standard" | "deposit";     // missing = standard
depositPercent?: number;           // deposit invoices: 1–100
depositBasis?: number;             // the contract amount the percent was taken from (dollars)
depositAgreementDate?: number;     // ms
depositsApplied?: Array<{ invoiceId: string; amount: number }>; // standard invoice: deposits shown as negative lines

// src/types/finance.ts (new) — K3 implements, K2 consumes
export type FinanceStatus = "paid" | "unpaid" | "partly_paid";
export interface FinanceRow { invoiceNo: string; jobId?: string; customer: string; jobType?: string; issuedAt: number;
  total: number; balance: number; status: FinanceStatus; source: "app" | "jobba" }
export interface FinanceFilters { from?: number; to?: number; customer?: string; jobType?: string; status?: FinanceStatus }
export interface FinanceSummary {
  asOf: number; filters: FinanceFilters;
  totals: { invoiced: number; collected: number; outstanding: number; pastDue: number; pastDuePct: number };
  aging: { current: number; d1_30: number; d31_60: number; d61_90: number; d90plus: number }; // by days past due
  byMonth: Array<{ month: string; invoiced: number; collected: number }>;                        // "2026-10"
  topOwing: Array<{ customer: string; amount: number; invoices: number }>;                       // top 5
  rows: FinanceRow[];                                                                             // filtered, newest first
}
// src/lib/finance/summary.ts: summarizeFinances(rows, filters, now, termsDays = 30): FinanceSummary
//                              rowsFromHistory(records): FinanceRow[]; rowsFromInvoices(invoices: JobInvoice[]): FinanceRow[]

// src/types/payroll.ts (new) — K3 implements, K2 consumes
export interface PayrollPerson { workerKey: string; name: string; crew?: string; regularHours: number; overtimeHours: number;
  days: number; jobs: number; flags: string[]; hourlyRate?: number; estimatedGross?: number }
export interface PayrollSummary { periodStart: string; periodEnd: string; people: PayrollPerson[];
  totals: { regularHours: number; overtimeHours: number; estimatedGross?: number } }
// src/lib/payroll/summary.ts: summarizePayroll(days: WorkerDay[], opts: { periodStart: string; periodEnd: string;
//                              rates?: Record<string, number>; overtimeAfterWeeklyHours?: number }): PayrollSummary

// src/types/team.ts (additive): TradeTitle += "supervisor" | "manager" | "office_admin" | "front_desk"
```

Money in the finance/payroll math is summed in integer cents internally and returned as dollars with 2 decimals (the
coding standards' "Domain Logic & Money-Math" rule). The document engine's types belong to K1 alone
(`src/types/documentTemplate.ts`). With the contracts, Claude also commits **working stubs** of `src/lib/finance/summary.ts` and
`src/lib/payroll/summary.ts` (final signatures, empty results), so K2 can call them before K3's real versions merge.

## 8. Streams, agents and file ownership

Each stream works in its own git worktree and owns only its files. The one shared file, `globals.css`, gets a marked block per
stream. Nobody but Claude edits `src/types/index.ts`, `firestore.rules`, `src/middleware.ts`, `src/lib/auth/**`, webhooks,
`src/lib/tools/**` (booking engine), `package.json`, `vercel.json` or ElevenLabs configuration.

| Stream | Agent + model (as the pickers show them) | Why | Owns | Tasks |
|---|---|---|---|---|
| **K0** | Claude Opus 5.5 (integrator) | security, live phone path, production data, merges | contracts; `src/lib/comms/**` + tenant send helpers (guard); production script runs; ElevenLabs; `scripts/roofdoctors-demo-seed.mjs`; run sheet | T-306, T-307, T-305, T-298, T-289/T-290 merges, all reviews |
| **K1** | Codex **GPT-6.1 Sol, high** | money math (deposit) + the 2,240-line job page; never below Sol | `src/app/company/jobs/[jobId]/**`, `src/lib/billing/jobInvoice*.ts` + `jobQuote*.ts` + `jobCustomerTotals.ts`, `src/lib/documents/**`, `src/types/documentTemplate.ts`, `src/types/invoice.ts` + `quote.ts` (additive), `src/app/api/jobs/[jobId]/{invoice,quote,report}/**`, `src/app/api/company/library/letters/**` (new), document email builders, `src/app/company/library/page.tsx` (Documents section only) + new `LettersSection.tsx`, `e2e/documents-roofing.spec.ts` | T-258, T-304, stretch T-252 |
| **K2** | Codex **GPT-6.1 Terra, medium** | well-specified screens; Terra keeps two Codex sessions inside the usage limit | `src/app/company/{layout.tsx,navModel.ts,company-nav.tsx}`, `src/types/bootstrap.ts` + the bootstrap route (expose `showcase`), `src/app/company/{finances,payroll}/**` (new), `billing/page.tsx`, `preview/**`, `customers/**`, `pipeline/**` + `RequestReviewCard.tsx`, `src/components/field/**` + both field pages (UI only), `src/components/ui/{Modal,Sheet}.tsx`, new routes `api/company/{finance,payroll}`, `api/company/customers/[customerId]/history`, `api/businesses/[businessId]/{appointments/[appointmentId],leads/[leadId]}/contact`, `src/lib/products/products.ts` (PATH_RULES only), a marked block in `scripts/e2e/seed.cjs`, `e2e/roofdoctors-screens.spec.ts` | T-286, T-299, T-300, T-288, T-287, T-302, T-292, T-293, T-294/T-301 screen, T-285 screen, T-311 screen |
| **K3** | Deepseek **V4.1 Flash, Thinking: Hard** | pure functions, a dry-run script, small typed additions; nothing on the live path | `src/lib/finance/**`, `src/lib/payroll/**`, `src/types/team.ts` (additive), `src/lib/team/{userTypes,landing}.ts` (+tests), `scripts/import-jobba.mjs`, `scripts/lib/jobba-import.mjs`, `src/lib/import/__tests__/**` | T-303, T-294 math, T-285 math, T-291 importer |

If Deepseek has no credits: K3 runs on Codex **GPT-6.1 Terra, medium** with the same prompt.

## 9. Schedule

| When | What | Who |
|---|---|---|
| Wed Nov 4 | Plan, mockups, prompts (this doc). Owner approves. | Claude, owner |
| Thu Nov 5, morning | **Wave 0:** commit plan docs; merge T-289 (fix its stale `role === "superadmin"` check) and T-290 (booking suite + `e2e:call`); commit §7 contracts; create the 4 worktrees; clean empty leftover folders. Start **K1 and K3**. | Claude |
| Thu Nov 5, afternoon | Start **K2** (staggered so two Codex sessions don't hit the ChatGPT usage limit together). | owner/Claude |
| Thu Nov 5 – Sat Nov 7 | K1/K2/K3 build. K0: evaluation guard (T-306); create the `roofdoctors` workspace; logos from their Word files; phone agent on a test branch + simulation tests (T-307); number import once bought. | all |
| Sun Nov 8 | Merge **K3** first. Import dry-run against the local harness, then a production dry-run report → owner OK → apply (only after T-306 is deployed). | Claude, owner |
| Mon Nov 9 | Merge **K1**, then **K2**, each reviewed row by row. Merged tree: full vitest + build + `e2e:call` + full `e2e:test`; read every phone screenshot. | Claude |
| Tue Nov 10 | Owner: **approve push** → deploy → production checks. Load their document wording; seed the representative job (T-305); capture fallback screenshots of every step. | owner, Claude |
| Wed Nov 11 | Owner walks each role on phone + desktop; fix list; second deploy if needed. Read survey responses → training focus + pilot proposal (T-309). | owner, Claude |
| Thu Nov 12 | Full dry run with the run sheet, including a live call. **Freeze at 6 p.m.**: no deploys after that except a critical fix the owner approves. | owner, Claude |
| Fri Nov 13, 10 a.m. | The review. | owner |

## 10. Safety and security rules (every agent, every prompt)

1. **Your worktree only.** Before the first edit and before every commit: `git rev-parse --show-toplevel` and
   `git branch --show-current` must match your assignment. Never edit `D:\Apps\6 - AI Receptionist` directly.
2. **Your files only** (table in §8). Need another file? Stop and say so in your report; don't edit it.
3. **Never weaken a guard.** Every new API route uses the central guards in `src/lib/auth/verifyRole.ts`; the business comes
   from the session, never from the request body or query; `src/app/api/__tests__/route-guards.test.ts` must stay green.
   Owner/admin-only data (Finances, Payroll) is checked on the server, not only hidden in the menu.
4. **No shared caching:** responses use `jsonWithCache` tiers (all `private`); never `public` or `s-maxage`.
5. **No injected HTML:** letter templates use a fixed list of fill-in fields. Every value is escaped; no `eval`, no template
   engine that runs code, no `dangerouslySetInnerHTML` with tenant or customer text.
6. **Previews are inert:** no writes, no emails, no Stripe calls. Each one has a visible "Preview" badge.
7. **Real client data never enters git.** Read it from `client-resources/` at script run time only; tests and fixtures use
   invented names and numbers.
8. **Production scripts:** dry-run by default; writing needs `--apply` plus typing the business id; a hard allowlist (only
   `roofdoctors`); refuse `demo-*`; idempotent (safe to run twice); batches of ≤ 400 writes; never sends email or texts;
   never prints secrets.
9. **Money:** use the existing totals (`computeTotals`, `customerTotals`, `invoiceBalance`); never compute a customer total
   in a screen; a test for every money rule (deposit + final = contract price).
10. **No new dependencies, no CSP changes, no `force-static`**, and no changes to the booking engine or the live agent from a
    worker.
11. **Commits:** one per task, `T-xxx: <summary>` + evidence; an `docs/IMPLEMENTATION_LOG.md` entry (plain ASCII); set your
    TODO row to `review`. Never push or merge; Claude merges, the owner approves every push.
12. **Stuck?** Stop, write what blocked you and what you tried; don't guess or invent.
13. **Their data: use it, never contact anyone with it** (owner, 2026-11-04). Importing, showing and filling the workspace
    with Roof Doctors' real data is fine and wanted. What must never happen is anything their customers (or staff) would
    notice: no email, no text, no phone call, no invite, no reminder. Enforced in code, not only by care: the
    `roofdoctors` business carries `outboundEmailAllowlist` (owner-controlled addresses only), which also switches on the
    phone side, so texts and outbound calls go only to `outboundPhoneAllowlist` (the owner's own test phones) and the
    nightly call-back job skips the business entirely. Imported invoices live in `invoiceHistory` (no reminder reads it).

## 11. Verification and screenshots

- **Workers:** `npx tsc --noEmit`, eslint on changed files, `npx vitest related <changed files>`. Codex streams also run their
  ONE new e2e spec and read its 375 px phone and desktop screenshots. Deepseek runs no browser tests.
- **Claude, per merge batch:** full `npx vitest run` + `npx next build`; `npm run e2e:call` (documents and pipeline are on the
  call → invoice path); full `npm run e2e:test` once on the final tree; read the phone screenshots (a green run can hide an
  unreadable screen).
- **Screens are judged with 30+ rows of data on a 375 px screenshot** (`docs/SCREEN-CLARITY-HEURISTICS.md`). Finances must
  pass T-301's declutter criteria (one look tells you who owes you and how late; ≤ 3 numbers, 1 chart, 1 list above the fold).
- **Fallback screenshots:** on Nov 10–12 Claude captures every step of the storyline from production. If something fails live,
  the owner shows the screenshot and moves on.
- **After deploy:** a real call to their line plus a read of the transcript (Booking-change gate), and each role's login checked
  on a phone.

## 12. Risks and fallbacks

| Risk | Fallback |
|---|---|
| Two Codex sessions hit the ChatGPT usage limit | K2 starts later and runs on Terra; if the limit hits, wait for the reset (the error names the time) |
| Deepseek stalls or has no credits | Claude takes over K3 (the smallest stream) or runs it on Codex Terra |
| RFI answers arrive late | Build from the 8 files on hand (wording is in them); role names as labels; staff logins later |
| Deposit invoice math isn't solid by Nov 9 | Show the deposit invoice as a document preview (no money writes) and say it's being finished |
| No phone number bought in time | Demo line with a "Roof Doctors" persona; create the request in their workspace by hand and say so |
| Import data issues (no phones, 1 unmatched invoice) | The dry-run report shows the counts; say plainly what the export didn't include |
| Free-plan limits | One-time ~2,000 writes; Finances cached; check the Usage page after import |
| A change breaks existing clients | New pages are behind this workspace's switches; the merged tree gets a full e2e run; rollback = promote the previous Vercel deployment |
| Real customer gets an email | Evaluation guard + no imported emails + reminders off + texting off |
| Outage on the day | Fallback screenshots + the run sheet's "if X fails" lines |
| Overpromising | Preview badges; the run sheet gives the exact wording for "preview" and "in the pilot" |

## 13. Surveys and the onboarding portal (owner's question)

**Today:** the ChatGPT-built portal lives on a `chatgpt.site` address (exact link in `client-resources/roofdoctors/01-conversations/AI_ROOFING_AGENT_HANDOFF.md`; its own hosting and
database, Cloudflare Workers + D1; the source is in ChatGPT's workspace, not on this machine). It has the EN/ES staff surveys,
the owner dashboard, wording editor with revision history, the RFI 011 page and the shared progress tracker.

**Recommendation:** use it as-is for Roof Doctors through the review. Don't copy it into our app now. Rebuilding would take days
that the review needs, and responses would end up split across two systems.
- **Our domain:** not today. If ChatGPT's site settings allow a custom domain, point `feedback.luxordev.com` at it (owner: one
  setting + one DNS record) so links stop showing `chatgpt.site`. If it doesn't, leave it; it's not worth a rebuild before the
  review.
- **Data:** staff names and emails live in that portal's database, not in our Firebase. Export the responses (CSV) once they're
  in, into `client-resources/roofdoctors/` (git-ignored).
- **Security:** I can't review code I can't see. If you want a review, export the portal's source into a folder here.
- **Later (T-296):** if surveys are useful for other clients, build them into `crm.luxordev.com` (public link per survey,
  superadmin results, EN/ES, revision snapshots, progress tracker), then retire the portal after exporting its data.

## 14. Not part of this review

Live card/ACH processing (Stripe Connect, T-266/T-273) · texting (NH-29) · promising a full history migration · the menu merges
(M1–M6) · the job-page tab merge (M5) · Spanish documents · a customer portal (Jobba sells one; not promised) · Permit Leads for
this client · an AI help chat (Carlita: don't offer it) · new permissions beyond the existing roles.

**Before a pilot (not before the review):** Firebase Blaze + photo storage (NH-32, T-248) for their photo volume; emergency
escalation that reaches a person (T-265); backups (T-245); bot-call guard (T-233); terms review (T-271).

## 15. After the review: PostHog → issue → fix → you approve

Owner goal: errors are found automatically, fixed by Claude, and the owner only approves the push. Built in stages; the owner's
approval stays on every merge.

1. **Cost guards first (T-276):** CI concurrency + timeouts, skip docs-only builds, GitHub Actions spending limit $0, Vercel spend
   cap. Without these an automation loop can run up a bill.
2. **Weekly review (T-277), 4–6 weeks:** Claude reads PostHog (filter `app = crm`; crashes *and* handled-error events), reports
   the top issues, fixes the approved ones on a branch with tests, and the owner approves the push.
3. **Automatic issues (T-229 A1/T-243):** a new PostHog error group → a GitHub issue (deduplicated, labelled `autofix`, linked to
   the session replay).
4. **Automatic fix PRs (T-229):** the Claude Code GitHub Action opens a fix PR on an `autofix/*` branch with tests and a Vercel
   preview; the owner approves the merge from the GitHub phone app. Guardrails: never merges itself; issues touching auth, rules,
   middleware, the booking engine, money math, legal pages or webhooks are labelled `needs-human` instead; at most a few PRs a
   day; runs only on its own branches with the default token.
5. Prerequisite: the GitHub connection in this tool currently fails to connect (bad authorization header); fix it before stage 3.

## 16. Owner approval and additions (2026-11-04, evening)

The owner approved the plan with these changes:

- **Menu proposal M2 is named "Finances", not "Money".** Still built after the review, like every merge proposal (D7).
- **The existing phone number** (D3, above). No number is bought.
- **Claude launches and directs the workers** (no pasted prompts). K1 and K2 run as Codex CLI sessions
  (`codex exec`), K3 runs on DeepSeek through the Kilo CLI (`kilo run -m deepseek/deepseek-flash --variant high`). If DeepSeek
  stops (credits), Claude finishes K3 or moves it to Codex Terra.
- **Fix the other items found in the owner's walkthroughs too**, inside each stream's own files:
  - K1 (documents): T-257 (document-suite UX: one "Add finding" flow, one customer-version card on Quote/Report/Invoice, the
    Itemized / Bundle / Project price choices explained), T-259 (1)+(2) (plain customer email subjects for quote/report/invoice/
    receipt; show "Job J-xxxx" next to the quote number), T-255 (several email addresses per document send, remembered on the job).
  - K2 (screens): T-250 (Dashboard "Needs attention" only for urgent / callback / waiting too long, with a one-line reason;
    the setup card names the remaining step).
  - K3 (small wording): T-251 (Calls page: explain "Open callback" and what "Call back" does), T-253 (1) (Library: what
    "medium" and "starter" mean), T-270 (1) (Team: "Remove access" and what it does).
- **Tailored to Roof Doctors, not just branded** (owner: "the way the invoices look, the wording, library work and findings").
  The code stays generic (works for any client); the tailoring is *their data in their workspace*, loaded by Claude (K0) from
  `client-resources/` after the merge, never committed (task T-312):

| What they will see | Where it comes from | Loaded by |
|---|---|---|
| Their logo (Roof Doctors, or RCU) on every document, email and the sidebar | `client-resources/roofdoctors/04-brand/` + the Word files' `word/media/` (converted to PNG) | K0, through the logo library |
| Invoices laid out like theirs: Customer ID, Bill to / Service at, Work order reference, opening paragraph, grouped subtotals, license number, terms | K1's invoice layout + their business settings (license, terms, website, address) | K1 builds, K0 fills in |
| Their exact wording: proposal letter, T&M authorization, completion notices, invoice and deposit opening lines, signer (name + title) | the 8 sample documents → their `documentTemplates` | K0, through the Letters editor/API |
| Their Library: materials with their prices, labor rates by role (from the T&M authorization), job types (T&M, Fixed price, Maintenance inspection, Service, Proposal request, Inspection) as services | `material-items.csv`, the T&M document, the Jobba screens | K3 importer + K0 |
| Their findings and standard solutions (the work catalog): the problems and repair wording they actually write (e.g. from the repairs quote, the RCN locations, inspection notes) with their prices | the sample documents + `inspections.csv` | K0 writes `client-resources/roofdoctors/work-catalog.json` (reviewed by the owner), loads it through the work-catalog API |
| Their customers with properties, Customer IDs and past work; their invoice history in Finances | the Jobba export | K3 importer, K0 runs it |
| Their phone greeting and agent wording | plan D3 | K0 (T-307) |
| Their crews and staff titles (Supervisor, Office admin, Front desk, Foreman, Technician) | RFI answers, else role labels | K0 |

**Data rule, clarified by the owner (2026-11-04, late):** "integrate it, use it, populate with it, but don't email them or
do anything that would be viewed as weird, like getting an email or a text." So the import and the tailoring pack go ahead;
the evaluation guard now covers texts and outbound calls as well as email (§10 rule 13). Before the workspace exists,
`outboundEmailAllowlist` and `outboundPhoneAllowlist` are set on it **first**, before any import, login or document.

**Double-check before the push (2026-11-05):**
- The import carries **no customer email or phone number** (names, property addresses, materials, past invoices and
  inspections only). `scripts/import-jobba.mjs --apply` now refuses to write unless the workspace's guard is ON.
- Create the workspace with **no Roof Doctors owner email**: the onboarding wizard's welcome email is Luxor platform mail
  (`businessId: null`), which the guard does not cover. Their staff get logins only when the owner asks, after their
  addresses are on the list.
- `notificationEmail` and `escalationPhone` = the owner's own (both on the lists), so booking and urgent alerts reach him,
  never their office. The live agent has no call-transfer tool (checked 2026-11-05: end call, language and voicemail
  detection only); the Roof Doctors copy (T-307) must keep it that way.
- Review day: calls in, bookings, jobs, findings, quotes, reports and invoices work for everyone present. Only what the
  system sends out is limited to the lists, so attendees who should see an email arrive are added beforehand. A blocked
  send currently shows staff the generic "could not be delivered" message. Texts are off platform-wide (`SMS_ENABLED` unset).

A per-client rename of "Job" to "Work order" was considered and **not** done: the word appears in too many places to change
safely before the review (a half-renamed app looks worse). Their documents still say "Work order" (the letter field
`workOrder` = the job number).

**Update 2026-11-04, late:** DeepSeek runs as stream **K4** (owner asked for it) on T-311 (properties + past work on the customer)
and T-293 (payments preview in Billing), moved off K2 before K2 started. It runs through the Kilo CLI as a locked-down agent
(`kilo.jsonc` in its git-excluded worktree `D:/Apps/air-wt-rd-k4`): everything is denied except reading/editing inside that
folder, type-check, lint, unit tests and git add/commit. No network, no pushes, no scripts, no reading outside the folder (so it
cannot open `client-resources/`). K3 (roles, money math, importer) ran on Codex Terra and is merged. No worker has live keys;
no import, email or production write happens until the owner approves the push and the evaluation guard (T-306) is live.

