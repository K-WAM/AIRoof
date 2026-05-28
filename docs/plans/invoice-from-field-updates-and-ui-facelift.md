# Plan: AI-Assisted Invoice Generation From Field Updates + Status Cleanup + Modern UI Facelift

## Context

Three problems are being solved together because they all hit the same surface area (the job detail page, the field/voice flow, and the superadmin shell):

1. **Invoice from field updates is half-built and fragile.** The parser already extracts materials/labor, the UI already lets you edit rows, and Resend already sends a branded email — but: nothing is persisted (everything regenerates on tab open), labor rate is hardcoded `$65/hr`, there is no company pricing catalog, the AI does not flag unresolved items or confidence, and a foreman's quick voice note still leaves the manager doing too much typing before sending.

2. **Job status flow is too thin.** Only `open → in_progress → complete`. The user wants roofing-native states (Inspection → Quoted → Working → Invoiced → Complete) so the stepper actually communicates where the job sits, without ballooning into Jobba-style tab sprawl.

3. **UI feels small/dated.** Logo is 28–30px (too small per user), light theme everywhere, generic flat cards. User wants an Airbnb / dark-glow modern feel — especially in the superadmin shell — and the "Voice Update ↗" button on job detail opens a new tab, which kills the mobile flow.

The product principle: **reduce admin effort after field work.** The AI turns a messy voice note into a clean, reviewable invoice draft. The manager is the final control point. The UI should make that single loop feel inevitable: one job page, one field button, one approve & send.

---

## 1. Existing Repo Findings

**Already in place — reuse, don't rebuild:**
- Job model + ID generation: [src/types/jobs.ts](src/types/jobs.ts), atomic `J-XXXX` via `runTransaction` in [src/app/api/jobs/route.ts](src/app/api/jobs/route.ts).
- Field update store + inline parse: [src/app/api/jobs/[jobId]/updates/route.ts:24-83](src/app/api/jobs/[jobId]/updates/route.ts#L24-L83) — saves raw, parses via DeepSeek/GPT-4o, bumps job to `in_progress`.
- AI parser (GPT-4o preferred, DeepSeek fallback): [src/lib/ai/deepseekClient.ts:42-138](src/lib/ai/deepseekClient.ts#L42-L138) — already returns timeline/materials/labor/issues/invoiceSuggestions; explicitly forbids inventing data.
- Invoice generation (current, transient): [src/app/api/jobs/[jobId]/invoice/route.ts](src/app/api/jobs/[jobId]/invoice/route.ts) — aggregates parsed updates → InvoiceLineItem[]. No persistence.
- Invoice send: [src/app/api/jobs/[jobId]/invoice/send/route.ts:5-170](src/app/api/jobs/[jobId]/invoice/send/route.ts#L5-L170) — Resend + inline branded HTML. **Hardcoded "Apex Roofing" branding at lines 492–495** — must read from BusinessConfig.
- Invoice UI: [src/app/company/jobs/[jobId]/page.tsx:429-666](src/app/company/jobs/[jobId]/page.tsx#L429-L666) — editable rows, auto hours w/ 0.5h lunch deduction, print/PDF via `window.print()`. **Hardcoded `$65/hr` at lines 87, 90, 557, 564.**
- Mobile field page: [src/app/company/field/page.tsx](src/app/company/field/page.tsx) — Web Speech API, preselects `?jobId=X`.
- BusinessConfig with branding (logoUrl, brandColor, contact*, notificationEmail): [src/types/index.ts:4-52](src/types/index.ts#L4-L52). **No `laborRate`, no `priceList` yet.**
- Auth: middleware ([src/middleware.ts](src/middleware.ts)) + Firestore rules. **Server-side role check missing on invoice/* and updates POST** — relies on rules only.
- Resend infra: `RESEND_API_KEY`, `RESEND_FROM` env vars, branded HTML inline.
- Design tokens, Inter font, 12px radius cards, teal accent `#0f766e`, shadows: [src/app/globals.css:1-14](src/app/globals.css#L1-L14). **No dark theme. Logo `.admin-brand-logo` height: 30px, `.company-brand-logo`: 28px.**
- Admin sidebar already dark (`#0f172a`) — partial foundation for a dark-glow facelift.

**Gaps confirmed:**
- No persistent Invoice document.
- No company pricing catalog or labor rate config.
- No customer email on Job (collected at send time only).
- No confidence/assumption/unresolved fields in `ParsedUpdate`.
- Job status enum too thin (`open | in_progress | complete`).
- "Voice Update ↗" link uses `target="_blank"` ([src/app/company/jobs/[jobId]/page.tsx:255](src/app/company/jobs/[jobId]/page.tsx#L255)) — context-switch kills mobile flow.
- Branding in invoice email is hardcoded, not pulled from BusinessConfig.
- `/api/jobs/[jobId]/updates` POST has no auth check (relies on Firestore rules — but route uses Admin SDK so rules don't apply).

---

## 2. Recommended Product Flow

**Two surfaces, two roles, one shared truth (the Job).**

```
FOREMAN (mobile, in the field)
─────────────────────────────────
Opens mobile field page (PWA-installed, or scans QR / opens texted link from manager)
   ↓ job preselected from URL/saved state
Holds mic → speaks: "left office at 9, 3 crew, 6 bundles shingles, 2 rolls underlayment, drip edge needed, prep invoice"
Releases → transcript shown for quick fix → Submit
   ↓
POST /api/jobs/{jobId}/updates (auth-checked, parses inline)
   ↓ ParsedUpdate v2: materials, labor, timeline, confidence, unresolved, assumptions, invoiceIntent
Update saved + parsed result attached to job in real time.

Foreman can submit corrections in follow-up updates:
   "actually it was 7 bundles, not 6"
   "scratch the drip edge, we used flashing instead"
   → AI emits explicit corrections in the parse (see §5, `corrections[]`)
   → reconciler folds them into the materials/labor view

MANAGER (desktop, job detail page)
─────────────────────────────────
Watches updates appear live on Timeline / Materials / Labor / Issues tabs.

When a foreman update has `invoiceIntent: "build"` (or manager clicks "Build Invoice Draft"):
   → POST /api/jobs/{jobId}/invoice/draft → persists invoices/{invoiceId}
       • reconciles materials/labor across ALL updates (latest correction wins)
       • matches materials → pricing catalog (fuzzy + alias)
       • applies labor rate from BusinessConfig
       • flags unresolved materials, missing qty, low confidence
       • status = "needs_review" if any flags, else "draft"

Manager opens Invoice tab → reviews draft → fixes flagged items inline
   ([Add to catalog] / [One-off price] / [Skip])
→ Approve → Send → Resend email + signed public view link → status="sent"

Job status auto-advances:
  Inspection → Quoted (manual) → Working (first field update) → Invoiced (send) → Complete (manager closes)
```

Single shared loop. Manager never voice-inputs. Foreman never opens the desktop job page.

---

## 3. Data Model Changes

All additions are additive. No breaking changes to existing collections.

**`Job` — extend [src/types/jobs.ts](src/types/jobs.ts):**
```ts
status: "inspection" | "quoted" | "in_progress" | "invoiced" | "complete"
clientEmail?: string  // for invoice send, no manual re-entry
invoiceId?: string    // pointer to current/latest draft
```
Migration: existing `"open"` → `"inspection"`, existing `"in_progress"` stays, existing `"complete"` stays. One-time backfill script. UI labels are decoupled (see §6).

**`ParsedUpdate` v2 — extend in [src/types/jobs.ts](src/types/jobs.ts):**
```ts
confidence: "high" | "medium" | "low"     // overall
assumptions: string[]                      // e.g. "Assumed lunch break deducted"
unresolved: {
  materials: Array<{ rawText: string; reason: "no_match" | "ambiguous" | "missing_qty" | "missing_unit" }>;
  pricing: Array<{ item: string; reason: "no_catalog_entry" | "low_confidence_match" }>;
}
managerNotes?: string                       // AI-authored review hints
jobIdMentioned?: string                     // if foreman said "J-1001"
```
Existing fields (`timeline`, `materials`, `labor`, `issues`, `invoiceSuggestions`) untouched — backward-compatible.

**New: `businesses/{bid}/priceList/{itemId}` (material catalog):**
```ts
itemId: string
name: string                    // canonical
aliases: string[]               // ["shingle bundle", "GAF bundle", "shingles"]
unit: string                    // "bundle" | "roll" | "lf" | "sqft"
unitPrice: number               // cents to avoid float
markupPct?: number
category?: string               // "roofing-material" | "fastener" | etc.
active: boolean
notes?: string
createdAt, updatedAt
```
Indexed by `name` + `aliases` for matching.

**`BusinessConfig` — add to [src/types/index.ts](src/types/index.ts):**
```ts
laborRate: {
  defaultHourlyRate: number          // cents
  lunchDeductionHours?: number       // default 0.5 if shift > 5h
  rolesRates?: Array<{ role: string; rate: number }>  // optional, role-specific
}
```
Keep optional travel-time / minimum-billable OUT of v1 (the user said "only if it fits cleanly" — it doesn't yet).

**New: `businesses/{bid}/invoices/{invoiceId}` (persisted draft):**
```ts
invoiceId: string                   // e.g. "INV-1042-1"
jobId: string                       // "J-1042"
businessId: string
status: "draft" | "needs_review" | "approved" | "sent"
lineItems: Array<{
  id: string
  type: "labor" | "material" | "other"
  description: string
  quantity: number
  unit?: string
  unitPrice: number                 // cents
  total: number                     // cents
  source?: { updateId: string; rawText?: string }   // traceability
  resolution?: "ai" | "catalog" | "manual" | "one-off"
  flags?: Array<"unresolved_pricing" | "low_confidence" | "missing_qty">
}>
subtotal: number
taxRate: number                     // percent * 100, e.g. 825 = 8.25%
taxAmount: number
grandTotal: number
notes?: string
unresolvedItems: ParsedUpdate["unresolved"]    // snapshot for banner
generatedFrom: { updateIds: string[] }
clientEmail?: string
createdAt, updatedAt, approvedAt?, sentAt?
approvedBy?: string, sentBy?: string
```
One active draft per job; superseded drafts marked `status: "void"` only if needed (skip until pattern demands).

---

## 4. Backend/API Changes

**Parser ([src/lib/ai/deepseekClient.ts](src/lib/ai/deepseekClient.ts)):**
- Extend system prompt with strict JSON schema (§5).
- Validate output with `zod` (already in repo? — verify) — reject + retry once on schema fail.
- Pass current pricing catalog hints (top N names + aliases) into the prompt so the model uses canonical names when confident.

**New: pricing/material matcher (`src/lib/pricing/matchMaterial.ts`):**
- Input: parsed material `{item, quantity, unit}` + business priceList.
- Strategy: exact match → alias match → fuzzy (Levenshtein < 3) → null.
- Returns `{ matched: PriceListItem | null, confidence, alternatives: [] }`.

**New: labor calc (`src/lib/pricing/calcLabor.ts`):**
- Input: parsed labor entries + `BusinessConfig.laborRate`.
- Applies role-specific rate if matched, else default.
- Applies lunch deduction rule (preserve existing 0.5h-if-shift>5h logic).
- Returns line items.

**New: `POST /api/jobs/[jobId]/invoice/draft`:**
- Auth: require `owner | staff | superadmin`.
- Reads job + all updates with `parsed`.
- Runs matcher + labor calc.
- Persists `invoices/{invoiceId}` doc.
- Sets `job.invoiceId` and (optional) `job.status = "invoiced"` only after send, NOT at draft time.
- Returns full Invoice doc.

**Modify: `GET/PUT /api/jobs/[jobId]/invoice`** — read/write persisted draft instead of regenerating. Preserve current request/response shape where possible so UI changes stay small.

**New: `POST /api/jobs/[jobId]/invoice/[invoiceId]/approve`:**
- Auth: `owner | superadmin` (staff can edit; approval is owner+).
- Validates: no `unresolved_pricing` flags remain OR explicit override `{ overrideUnresolved: true }`.
- Sets `status: "approved"`, `approvedAt`, `approvedBy`.

**Modify: `POST /api/jobs/[jobId]/invoice/send`:**
- Require `status: "approved"` (or accept `?force=true` for owner+).
- Pull branding from `BusinessConfig` (logoUrl, brandColor, businessName, contactPhone, contactEmail) — **remove hardcoded "Apex Roofing"** at lines 492–495.
- On success: set `status: "sent"`, `sentAt`, set `job.status = "invoiced"`.

**New: pricing catalog CRUD (`src/app/api/businesses/[businessId]/pricing/route.ts` + `[itemId]/route.ts`):**
- GET (list, paginated), POST (create), PUT (update), DELETE (soft via `active=false`).
- Auth: `owner | staff | superadmin`.

**Auth hardening (the existing gap):**
- Add `verifyAuthAndRole(req, businessId, ["owner","staff"])` helper using Firebase Admin `verifyIdToken` on `__session` cookie.
- Apply to: `updates POST`, `invoice/draft`, `invoice/approve`, `invoice/send`, `pricing/*`.
- Field updates from a foreman: foreman should have `role: "field"` (new) or `role: "staff"` — pick `staff` for v1 to avoid expanding the role model; document in CLAUDE.md.

**PDF strategy (safest minimal):**
- v1: keep `window.print()` for browser-side PDF; the email contains a "View Invoice" link to a public, signed, read-only `/i/{invoiceId}?token=...` page that renders the same HTML and lets the client print/save. Avoids server-side PDF lib (no Puppeteer/Chromium in Vercel functions).
- Signed token: HMAC of `invoiceId + sentAt + businessId` with `INVOICE_SHARE_SECRET`. 30-day expiry.

---

## 5. AI Extraction Contract

Strict JSON schema returned by `parseFieldUpdate`. Model must respond `{"error": "..."}` if it can't comply.

```json
{
  "jobIdMentioned": "J-1001" | null,
  "workPerformed": "string (1-2 sentences)" | null,
  "timeline": [{ "time": "HH:MM" | null, "description": "string" }],
  "labor": [{
    "description": "string",
    "role": "string" | null,
    "crewCount": number | null,
    "arrivalTime": "HH:MM" | null,
    "departureTime": "HH:MM" | null,
    "hours": number | null,
    "hoursSource": "stated" | "inferred" | null,
    "rate": number | null
  }],
  "materials": [{
    "item": "string (verbatim from foreman)",
    "quantity": number | null,
    "unit": "string" | null,
    "confidence": "high" | "medium" | "low"
  }],
  "issues": [{ "description": "string", "severity": "low" | "medium" | "high" }],
  "confidence": "high" | "medium" | "low",
  "assumptions": ["string", ...],
  "unresolved": {
    "materials": [{ "rawText": "string", "reason": "no_match"|"ambiguous"|"missing_qty"|"missing_unit" }],
    "pricing": [{ "item": "string", "reason": "no_catalog_entry"|"low_confidence_match" }]
  },
  "managerNotes": "string (e.g. 'Crew count inferred from \"3 laborers\"; verify rates')" | null,
  "invoiceIntent": "build" | "update" | "none"
}
```

**Hard rules in prompt:**
- Never invent costs, quantities, or materials. Use `null`.
- If material name isn't in the provided catalog hints, leave `item` as the foreman's exact phrase and add to `unresolved.materials`.
- Costs (`rate`, `unitPrice`) only emitted when the foreman explicitly states them, otherwise `null`.
- `invoiceIntent: "build"` only when foreman says "prep invoice" / "make the invoice" / "ready to bill" etc.

**Corrections / reconciliation (new):**
The foreman speaks in chunks and corrects mistakes mid-job. The parser must distinguish *additions* from *corrections*. Add a sibling field:

```json
"corrections": [
  { "target": "material", "match": "shingle bundle", "action": "replace_qty", "newQuantity": 7, "rationale": "foreman said 'actually it was 7 bundles, not 6'" },
  { "target": "material", "match": "drip edge", "action": "remove", "rationale": "foreman said 'scratch the drip edge'" },
  { "target": "labor", "match": "crew", "action": "replace_field", "field": "departureTime", "newValue": "16:30" }
]
```

A server-side **reconciler** (`src/lib/pricing/reconcileUpdates.ts`) walks all updates for a job in submission order and produces a single canonical view of `materials[]` and `labor[]`. Latest correction wins; removals are honored; un-matched corrections are surfaced as `unresolved` so the manager isn't silently overridden.

`invoiceSuggestions` is **removed** from ParsedUpdate (deprecated) — pricing is now computed server-side from the matcher + labor calc + reconciler, not from the model. The model loses the ability to hallucinate dollar amounts.

---

## 6. UI Changes

**Principle: no new tabs on the job detail page.** Improve invoice tab + add a single pricing/settings page.

**Job detail page ([src/app/company/jobs/[jobId]/page.tsx](src/app/company/jobs/[jobId]/page.tsx)) — manager surface:**

- Status stepper: 5 steps — `Inspection → Quoted → Working → Invoiced → Complete`. Map: `inspection|quoted|in_progress|invoiced|complete`. Same `.job-progress-*` styles, add 2 wrappers + reword labels. Click a future step to advance manually (gated by role).
- **Remove the "Voice Update ↗" button.** Voice input is the foreman's flow on mobile, not the manager's. Replace with a small **"Send to foreman ↗"** affordance that:
  - On click, opens a tiny popover with (a) a **QR code** that encodes the mobile field URL with this job preselected, and (b) **"Copy link"** / **"Text link"** (SMS via existing Twilio if configured, else mailto fallback).
  - This solves the demo flow: during a sales call, hand the prospect the phone → they scan the QR → they're on the mobile recorder for this exact job. No app install, no login confusion (signed short-lived token in URL — see below).
- Invoice tab:
  - Top banner if `status === "needs_review"`: "AI flagged N items — review before approving." Click expands the list.
  - Each unresolved material row gets inline actions: `[Set price]` `[Add to catalog]` `[Skip item]`.
  - Replace ad-hoc `$65/hr` defaults with `BusinessConfig.laborRate.defaultHourlyRate` — fallback only if unset.
  - Show "Materials from N updates · M corrections applied" header so manager sees reconciliation worked.
  - Add "Save as draft" (autosave on edit), "Approve" (gated on no unresolved flags), "Send" (gated on approved). Existing print button stays.
- Live updates: subscribe to `jobs/{jobId}/updates` via Firestore `onSnapshot` so the manager sees foreman updates appear in real time while on the call.

**Mobile field page ([src/app/company/field/page.tsx](src/app/company/field/page.tsx)) — foreman surface, this is where the demo wow-factor lives:**

- Full-bleed dark theme (consistent with admin shell dark-glow). Large center mic button (~120px). Transcript card below.
- Two entry paths:
  1. **Authenticated foreman** (signed in as `staff`): job dropdown shows their open jobs; last-used job remembered in localStorage; PWA-installable.
  2. **Tokenized demo/share link** (`/field?jobId=X&token=...`): short-lived signed token (HMAC, 60-min expiry) auto-resolves job + business without login. Used by QR / SMS links. Read-only after expiry.
- Clear states: "Loading job…", "Couldn't load — try this link", "Recording", "Submitting", "Saved ✓".
- After submit: show the parsed materials/labor *the AI extracted* on the same screen ("Got it — 6 bundles shingles, 3 crew, 7 hrs") so the foreman can immediately spot a misparse and submit a correction. This is the core "AI updates job as they go, including if they correct their errors" loop the user described.
- Sticky FAB on every screen: `+ New update` so subsequent corrections are one tap.
- PWA manifest + service worker for offline-capable record-and-queue (defer to Phase 4).

**New: `/admin/businesses/[businessId]/pricing` (and `/company/settings/pricing` for owners):**
- Single table view: name, aliases (chip), unit, price, category, active.
- Search bar (server-side or client-side fuzzy).
- Add Item modal (5 fields). Edit/Deactivate inline. No bulk import in v1 (mention as Phase 5 if needed).
- Linked from admin business edit page and company nav under a new "Settings" link (just labor + pricing for now).

**Modernization (UI facelift — separate from invoice feature but planned together):**

The attached reference (dark + neon green glow) is a strong marketing aesthetic. **Recommend applying it selectively, not blanket:**
- **Apply dark-glow to:** the superadmin shell ([src/app/admin/layout.tsx](src/app/admin/layout.tsx) + sidebar + brand area). Sidebar already `#0f172a` — push to `#0a0f1c`, add neon-green accent (`#86efac`-ish or business `brandColor`), glow shadows on focused nav items, larger logo (height `54px` → switch to `next/image` with the actual logo file).
- **Keep company/job pages light** but adopt the same modern primitives: bigger logo (32–40px), softer 16–20px radii, larger spacing, hover-elevate shadows, a subtle gradient on the top status stepper.
- **Mobile field page:** full-bleed dark background + large center mic button + transcript card — most "Airbnb-like" surface in the app. This is the prospect demo, so it deserves the strongest visual.
- Don't redesign data-dense tables in v1; they work. Reskin chrome (nav, header, cards, buttons), don't restructure layouts.

**Bigger logo specifically:**
- Replace `<img>` with `next/image` for `public/logo.png`.
- `.admin-brand-logo` height: 30 → 54px. Add proper width via `next/image` for layout stability.
- `.company-brand-logo` height: 28 → 36px.
- Field/login pages: 64px hero logo.

**Mobile demo button — solved by the "Send to foreman ↗" + QR + tokenized share link above.** During a demo: open job detail on the desktop, click Send to foreman, prospect scans QR with their phone, lands directly on the recorder for that job, speaks, submits, manager sees the parsed update + invoice draft appear live on the desktop. No login friction, no tab confusion.

---

## 7. Permissions

Use existing roles, no new role tier in v1.

- `superadmin`: full access including pricing/labor config across all businesses.
- `owner`: pricing + labor + invoice approve + send within own business.
- `staff`: edit invoices, submit field updates, **cannot** approve/send invoices, **cannot** edit pricing catalog (read-only).
- `viewer`: read-only everywhere.
- Foremen: use `staff` role. Document in CLAUDE.md.

**Server-side enforcement (current gap):**
- All write APIs (`updates POST`, `invoice/draft`, `invoice/approve`, `invoice/send`, `pricing/*`) must call a new `verifyAuthAndRole(req, businessId, allowedRoles)` helper. Currently routes use Admin SDK so Firestore rules don't apply — this is **the most important security fix in this plan**.
- Field page: keep auth-required (sign-in). The "unprotected /field route for crew" experiment in git history was a footgun.

---

## 8. Email Deliverability / Sending Strategy

- Keep Resend. Pull all branding from `BusinessConfig` — drop the hardcoded "Apex Roofing" block.
- Sender: `RESEND_FROM` must be a verified domain (`noreply@luxordev.com` already configured — works). Subject: `Invoice {invoiceId} from {businessName}`.
- Add **reply-to** = `BusinessConfig.contactEmail` so client replies hit the business, not Luxor.
- **PDF: don't generate server-side in v1.** Email contains:
  - Branded HTML invoice (existing template, reskinned with BusinessConfig).
  - "View / Print Invoice" link → signed `/i/{invoiceId}?token=...` page (browser print → save as PDF).
- DKIM/SPF: confirm Resend domain has DKIM record verified (existing infra — verify once, document in HANDOFF).
- Bounce/complaint: log Resend webhook → mark invoice with `deliveryStatus: "bounced" | "complained"` in v2.

---

## 9. Phased Implementation

**Phase 1 — Foundation (pricing/labor + auth + status migration)**
- Add `laborRate` to BusinessConfig + migration.
- Add `priceList` collection + CRUD APIs.
- Build `/admin/businesses/[id]/pricing` + `/company/settings/pricing` UIs.
- Add 5-state status enum + backfill script + update stepper labels.
- Add `verifyAuthAndRole` helper, apply to existing updates/invoice routes.
- **No user-visible invoice changes yet.** Ship clean.

**Phase 2 — AI extraction → persisted draft**
- Extend `ParsedUpdate` schema (additive).
- Update parser system prompt + zod validation.
- Add material matcher + labor calc helpers.
- Add `POST /api/jobs/[jobId]/invoice/draft` + `GET /invoice` reads from persisted doc.
- Job invoice tab loads from persisted draft; rows still editable. UI shows banner if `needs_review`.

**Phase 3 — Review, approve, send**
- Add unresolved-item inline actions (set price / add to catalog).
- Add approve/send endpoints with role gates.
- Switch invoice email to BusinessConfig branding.
- Add signed `/i/{invoiceId}` public view + token.
- Status auto-advances on send (`invoiced`).

**Phase 4 — UI facelift + mobile share + hardening**
- Remove "Voice Update ↗" from job detail; add "Send to foreman ↗" popover with QR + copy/SMS link.
- Tokenized share-link route `/field?jobId=X&token=...` with HMAC verification.
- Mobile field full-bleed dark redesign + parsed-result echo for foreman self-correction.
- Bigger logo (`next/image`), restyle admin sidebar dark-glow (per UI scope answer: selective).
- Live `onSnapshot` on job updates so manager sees foreman activity in real time during demo.
- PWA manifest + install prompt on mobile field page.
- Tests (§11), audit log on invoice approve/send, Resend DKIM verify + reply-to.

---

## 10. Risks / Open Questions

1. **Dark-glow scope.** Applying the attached image's aesthetic to *every* page is a big surface. Recommend selective application (admin shell + mobile field full strength, company data pages light with modern primitives). **Confirm with user.**
2. **Status migration risk.** Mapping `"open" → "inspection"` may be wrong for older jobs. Suggest interactive migration: list every existing job and let superadmin pick status in bulk (or default to `inspection` with a banner).
3. **Pricing as cents vs dollars.** Recommend cents (integer) to avoid float drift in invoice math. Existing UI uses dollars — needs a small converter.
4. **AI losing `invoiceSuggestions`.** This is a deliberate strip — pricing belongs server-side. The model gets simpler and more reliable. Confirm OK.
5. **Foreman == staff role.** Avoids new role tier but means foremen can see invoice tab. Acceptable in v1; mitigate by hiding nav links via role check.
6. **Auth on field updates POST.** Currently Admin SDK → no rule enforcement → anonymous POSTs possible. **Highest-priority security fix.** Must verify before Phase 2 ships.
7. **PDF approach.** Signed view link is safer than server-side PDF in Vercel. Some clients may want a real `.pdf` attachment — defer to Phase 5 (use a hosted PDF service like Browserless / DocRaptor).
8. **One active draft per job.** If a foreman submits two "prep invoice" updates, second draft overwrites. Acceptable for v1; flag in UI.
9. **Correction ambiguity.** If foreman says "we used 7 bundles" in update 2 without explicit "actually" / "correction", reconciler may double-count. Mitigation: parser must classify *additions* vs *corrections*; ambiguous cases surface to manager as `unresolved` rather than silently rolling forward.
10. **Tokenized share link security.** `/field?jobId=X&token=...` is unauthenticated; misuse = anyone with link can submit updates as that job. Mitigations: 60-min HMAC expiry, rate-limit by IP, log every tokenized submission with `submittedBy: "tokenized-share"`, surface in audit. Acceptable for demo + foreman flows; don't extend to invoice approve/send.
11. **PWA offline queue.** Deferred to v2 — recording offline and syncing later adds real complexity. v1 requires connection; show clear "No network" toast.

---

## 11. Test Plan

**Unit (vitest, already in repo? — confirm):**
- `matchMaterial`: exact / alias / fuzzy / no-match across 20 fixtures.
- `calcLabor`: with role rates, default, lunch deduction edge cases (4.9h, 5.0h, 5.1h shift).
- Parser schema validation: malformed model outputs → retry once → error.

**Integration (mocked Firebase):**
- POST `/updates` → ParsedUpdate persisted → `Job.status = working`.
- POST `/invoice/draft` → resolves materials → produces line items → flags unresolved.
- POST `/invoice/approve` blocked when `unresolved_pricing` exists.
- POST `/invoice/send` flips job to `invoiced` + email rendered with BusinessConfig branding.

**AI extraction smoke tests:**
- 6 fixture transcripts (clean / messy / ambiguous / multi-job / no-quantity / dollar-stated) → snapshot assertions on schema-shape only (not exact content).

**Permission tests:**
- Staff cannot approve/send.
- Viewer cannot create drafts.
- Cross-tenant POST (wrong businessId in token) rejected with 403.

**Invoice math:**
- Subtotal = Σ line totals; tax = subtotal × rate; grand = subtotal + tax. Cents arithmetic, no float drift.

**Unknown material:**
- Submit update with "drip edge" not in catalog → draft created → flag visible → "Add to catalog" creates entry → re-draft resolves cleanly.

**Email:**
- Snapshot HTML output for a known invoice + BusinessConfig → no "Apex Roofing" hardcoded strings.

**Regression:**
- Existing print/PDF path still works.
- Existing parsed timeline/materials/labor tabs unchanged.

---

## 12. Recommended Implementation Sequence

1. **Add `verifyAuthAndRole` helper** + apply to `/api/jobs/[jobId]/updates` POST (this is the security hole).
2. Extend `BusinessConfig` type with `laborRate` + read it in existing invoice UI (replaces hardcoded `$65`).
3. Create `priceList` collection + CRUD endpoints + admin pricing page.
4. Status enum migration: type change + backfill script + stepper labels + update enum checks in routes.
5. Extend `ParsedUpdate` type (additive) + update parser system prompt + zod validation.
6. Add `matchMaterial` + `calcLabor` helpers with unit tests.
7. Add `POST /invoice/draft` + persisted `invoices/{invoiceId}` model + read endpoint.
8. Update job invoice tab to load persisted draft + show unresolved banner + inline resolve actions.
9. Add approve + send endpoints with role gates + role-gated UI buttons.
10. Rip out hardcoded "Apex Roofing" branding from send template; pull from BusinessConfig.
11. Add signed `/i/{invoiceId}` public view + token.
12. Remove "Voice Update ↗" from job detail; add "Send to foreman ↗" popover with QR + copy/SMS link.
13. Tokenized `/field?jobId=X&token=...` route + HMAC verify; live `onSnapshot` on job updates so manager sees foreman activity in real time.
14. Mobile field full-bleed dark redesign + parse-echo ("Got it — 6 bundles, 3 crew, 7 hrs") for foreman self-correction.
15. Add reconciler (`reconcileUpdates.ts`) + tests for correction handling.
16. UI facelift: bigger logo (`next/image`), admin dark-glow sidebar; keep company pages light with modern primitives per UI scope answer.
17. PWA manifest + install prompt on mobile field page (defer offline queue to v2).
18. Tests (§11) + Resend DKIM verify + reply-to + audit log on approve/send.
19. Update HANDOFF.md, CLAUDE.md, onboarding-guide.html with new flow.

---

## Verification

- `npm run lint && npm run typecheck && npm run build` clean.
- Manual end-to-end on demo-roofing:
  1. Add a "Asphalt shingle bundle" priceList item ($45/bundle).
  2. As foreman on mobile field page (or new inline drawer), submit: "Left office 9am, 3 laborers, 6 bundles shingles, 2 rolls underlayment, drip edge needed, prep invoice."
  3. Open job J-XXXX → Invoice tab → see draft with shingles resolved, underlayment + drip edge flagged.
  4. Click "Add to catalog" for underlayment ($85/roll) → flag clears.
  5. Click "Set one-off price" for drip edge → enter $12/lf, qty 40 → flag clears.
  6. Approve → Send to test client email → verify email shows business branding (not "Apex Roofing"), reply-to = BusinessConfig.contactEmail.
  7. Click email link → see public read-only invoice → print to PDF.
  8. Job status now `invoiced`. Mark `complete` from job detail.
- Auth check: log in as `viewer` → confirm approve/send buttons hidden and API returns 403.
