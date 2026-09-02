# Plan: Field Ops + Calendar Powerhouse + Library Epic

> **Source of truth.** This is the approved epic plan, versioned in the repo. Working copy lives at `~/.claude/plans/the-booking-system-currently-fluffy-sunbeam.md`. Reference this file in any session.

## Context

Two things are broken and six are missing. Booking rejects **every** appointment: a `notes: undefined` field (added last session) hits the Firestore Admin SDK, which is initialized without `ignoreUndefinedProperties` and throws on any undefined value. Separately, job-detail tabs show **duplicated, uncorrectable** field data ("2×4s 50 / 50 / 150 / 120") because two divergent write paths exist — `/api/jobs/[id]/updates` (text) stores per-update parsed data the tabs read, while `/api/jobs/[id]/field-audio` (audio) *also* merges into separate `job.materials` fields. No single source of truth, no editing, no way for a foreman to verbally correct a past note.

The operator is non-technical. The product must be **frictionless, fool-proof, fast, and free to run** until a paying client justifies infrastructure spend. This epic: fixes booking; unifies job data into one editable, voice-correctable source; adds job-site photos that flow into a branded report the admin edits and **manually** sends; turns Calendar into a drag-and-drop crew-scheduling powerhouse with branded emails; adds a Library (pricing/crews/docs) every invoice and report pulls from; and completes after-hours booking (AI books 24/7 → provisional/grey → one-click morning confirm emails the customer).

## Decisions locked
- **Build:** one continuous, dependency-ordered sequence (Phases 0–6).
- **Photos/files: NO paid Firebase.** Stay on the free **Spark** plan — no Firebase Storage (it requires Blaze). Store images as compressed base64 in Firestore behind a swappable abstraction; flip to Firebase Storage in one file when a client is secured and we move to Blaze.
- **Notifications:** email now (Resend), `notify()` seam for SMS later.
- **Calls & Leads:** stay separate.

## Engineering principles (apply to every phase — this is the bar)
1. **Ultra-rapid loading.** Primary fetches stay lean; heavy bytes (full-res photos) are lazy-loaded only on demand. Thumbnails for grids. Single-doc GETs. No N+1. Optimistic UI on every edit/drag so the screen reacts instantly, then reconciles.
2. **Free to run.** Everything fits Firestore Spark limits (1 GiB store, 50K reads/day). Photo bytes are split so list views never pull full images.
3. **Frictionless navigation.** Clickable tiles/rows everywhere, `<Link>` client-side nav, deep interlinking (job ⇄ crew ⇄ calendar ⇄ report ⇄ invoice). The operator never hunts.
4. **One source of truth, and code owns the math.** `job.parsed` is a projection **deterministically computed in code** from the immutable `updates` ledger (event-sourcing-lite). The LLM never does arithmetic and never sets a running total — it only extracts line items and, for corrections, *proposes* which entry changes and to what. Totals are always summed by code from the ledger, so a correction can never silently wipe prior days' quantities.
5. **Automate to the last inch, then a human presses send.** AI prepares; the operator clicks **Mail** to dispatch anything outbound.
6. **Distilled code.** Reuse existing utilities (`InlineInput`, the Resend HTML pattern, `verifyAuthAndRole`, single-job GET) — do not reinvent. Small constants for every limit so they're trivially tunable.

---

## Phase 0 — Booking bug fix (critical, ~10 min, unblocks demos)

**File:** `src/lib/firebase/admin.ts` — in `initializeAdmin()`, immediately after `admin.initializeApp(...)`, call `admin.firestore(adminApp).settings({ ignoreUndefinedProperties: true })` once (guarded; `settings()` throws if called twice or post-use). Firestore then drops `undefined` fields instead of throwing — fixes `notes: undefined` in `bookAppointment` and the entire class.

**Verify:** Book via the demo number (after hours too); lands in `/company/appointments`, no 500. Book with no `serviceType`/`address` — also fine.

---

## Phase 1 — Unified, editable, voice-correctable job data (foundational)

**Goal:** One authoritative job state, built by code from an immutable ledger. New entries just add. Corrections are a one-tap confirmation that can only change the entry you mean — never the running total behind your back. Tabs/invoice/report all read the same projection, so fixes trickle everywhere. No duplicates.

**Model (event-sourcing-lite, code-owned aggregation):**
- `updates` subcollection = immutable **ledger**. Two entry kinds:
  - normal: `{ updateId, rawText, parsed: ParsedUpdate, createdAt, submittedBy }`
  - correction: `{ updateId, kind:"correction", targetUpdateId, field:"materials", item, newValue, rawText, createdAt }` — append-only override of one prior entry's one line item.
- `job.parsed: ParsedUpdate` = projection **computed in code** by `buildProjection(updates)` (new pure fn in `src/lib/jobs/projection.ts`). It folds the ledger: each normal entry contributes its line items; a correction overrides the targeted `(updateId, item)` value **before** summation. Materials summed by normalized name, labor unioned by worker, timeline concatenated chronologically, issues listed. Deterministic, testable, re-derivable. **The LLM is never in the arithmetic path.**

**Why this is foolproof (the 30/20/40/150→120 case):** entries 30, 20, 40, then 150 → projection sums to 240. Foreman says "nvm it was 120 not 150." A correction event targets the **150 entry** and overrides it to 120. `buildProjection` recomputes 30+20+40+120 = **210**. The 150→120 swap can only touch that one entry; the prior days are summed by code and cannot be clobbered.

**Correction detection + one-tap confirm (frictionless, on the field device):**
- Extend `parseFieldUpdate` (`src/lib/ai/deepseekClient.ts`) to also return an optional `correction?: { item, newValue, targetHint }` when it hears correction language ("actually / I meant / not 150, it was 120 / scratch that").
- When a correction is detected, the field POST returns a **proposed correction** (not yet applied): the server resolves `targetUpdateId` = most-recent ledger entry containing that item, and computes — **in code** — `oldValue`, `newValue`, and `newRunningTotal`.
- The field page (`/field` and `/company/field`) shows a small **confirm card**: *"Change 2×4s on your last entry from **150 → 120**? Running total becomes **210** (was 240)."* with **[Confirm]** / **[Cancel]** — one tap. Confirm → writes the correction event → `buildProjection` recomputes. Cancel → discard, or "save as new note" fallback.
- If the resolved target looks wrong to the user, Cancel and fix it in the editable tab (manual fallback below). The card always shows the exact entry + recomputed total, so nothing commits unseen.

**Write paths converge** — both routes append to the ledger, then recompute `job.parsed = buildProjection(updates)`:
- `src/app/api/jobs/[jobId]/updates/route.ts` (text/public `/field`) and `src/app/api/jobs/[jobId]/field-audio/route.ts` (audio; keep Whisper, drop the bespoke merge ~lines 75–167). Both: detect correction → if present return proposed-correction for confirm; else append normal entry → recompute projection.
- New endpoint `POST …/updates/confirm-correction` (or a `confirmCorrection` flag on the updates route) writes the confirmed correction event + recomputes.
- Backfill: if a job has legacy `updates` but no `job.parsed`, run `buildProjection` once on first load.
- `/company/field` job-log (`src/app/company/field/page.tsx`): add `parsedToFieldLog(job.parsed)` so the existing JobLogCard keeps working unchanged.

**Editable tabs (manual fallback + everyday edits)** — `src/app/company/jobs/[jobId]/page.tsx`: Timeline/Materials/Labor/Issues read `job.parsed`; per-tab Edit toggle with inline edit + add/delete rows reusing the **existing `InlineInput`**. An admin edit writes a correction/override event (so the ledger stays the source) or directly sets `job.parsed` with an audit note — either way deterministic. Optimistic UI, then PATCH. `generateInvoice` + report repoint to `job.parsed`.

**Endpoint** — extend `src/app/api/jobs/[jobId]/route.ts` PATCH to accept projection edits (validate shape, append audit, bump `updatedAt`).

**Verify:** Submit 30, 20, 40, then 150 2×4s → total 240. Say "it was 120 not 150" → confirm card shows 150→120, total 210 → Confirm → Materials shows 210, not 120. Cancel path leaves 240. Edit a qty inline → invoice + report update. Old jobs still render.

---

## Phase 2 — Job-site photos (free, base64-in-Firestore, ultra-light loading)

**Goal:** Frictionless field capture with a **mandatory description**, instant-loading admin grid, and report selection — all on the free plan.

**Storage abstraction (swap to Firebase Storage later in one file):** `src/lib/photos/store.ts` exposing `putPhoto`, `getPhotoBlob`, `listPhotoMetas`, `deletePhoto`. Default impl = Firestore base64. A `STORAGE_DRIVER` constant documents the future Blaze/Storage swap.

**Two-doc split (the performance crux):**
- `businesses/{id}/jobs/{jobId}/photos/{photoId}` — **meta + thumbnail only**: `{ photoId, label, uploadedBy?, createdAt, includeInReport?, thumbB64, w, h }`. `thumbB64` ≈ 240px JPEG q0.6 (~8–15 KB). Grids/list views read **only** this → ultra-rapid.
- `businesses/{id}/jobs/{jobId}/photoBlobs/{photoId}` — `{ fullB64 }` (~1280px q0.72, target < 800 KB). Fetched **only** on lightbox open or report build.

**Limits (tunable constants):** `MAX_PHOTOS_PER_JOB = 10`; `MAX_FULL_BYTES ≈ 900_000` (forgiving). Client canvas-compresses; if full b64 > cap, re-encode at lower quality, then friendly reject if still over. Server enforces the 10-cap.

**Field upload** — `src/app/field/page.tsx` + `src/app/company/field/page.tsx`: a `+ Photo` control under the mic → `<input type="file" accept="image/*" capture="environment">` → canvas makes thumb + full → small modal with a **required description** (Save disabled until non-empty) → POST to new `src/app/api/jobs/[jobId]/photos/route.ts` (POST/GET-metas/DELETE), businessId-scoped like the updates route.

**Admin viewer** — new **Photos** tab in job detail: thumbnail grid (loads thumbs only); click → lightbox popup that lazy-fetches the one `photoBlobs` doc; per-photo **Include in report** toggle.

**Verify:** Snap photo on `/field`, empty description blocked, save → admin grid loads instantly (thumbs) → click → full loads in lightbox → toggle include. 11th photo rejected.

---

## Phase 3 — Report preview the admin edits, then **manually** mails

**Goal:** AI assembles a polished branded report; the admin reviews a true preview, edits values, **adds notes**, picks photos, then presses **Mail report** (or Print/PDF). Nothing sends automatically.

**File:** `src/app/company/jobs/[jobId]/page.tsx` (Report tab + `ReportRenderer`):
- Editable preview mirroring the Invoice tab: inline-editable issues/materials/labor (same `job.parsed`, so consistent with tabs), plus:
  - A dedicated **Notes / Scope & Resolution** section — free-text `job.reportNotes` (textarea) for "issue identified → repair applied" narrative; optional per-issue `resolution?`.
  - Selected photos (Phase 2) appended, resized to **≤ 2 pages**, each captioned with its field label (print grid + existing `@media print`).
- **Mail report** button → new `src/app/api/jobs/[jobId]/report/send/route.ts` (reuse the Resend branded-HTML pattern from `invoice/send/route.ts`): branded report email with inline-resized included photos (the ≤2-page cap bounds count/size). Keep **Print / Save as PDF**.
- Persist `reportNotes` / resolutions via the Phase-1 PATCH.

**Verify:** Edit summary + a qty + add resolution notes + include 2 photos → Print preview shows all, branded, ≤2 photo pages → **Mail report** sends to the client; nothing leaves without that click.

---

## Phase 4 — Library (pricing / crews / documents)

**Goal:** One place to maintain pricing, crews, and shared docs. Invoices + reports pull pricing automatically.

**Nav + page:** add "Library" to `src/app/company/company-nav.tsx`; new `src/app/company/library/page.tsx`, three pill-switched sections (uncluttered):
1. **Pricing** — `businesses/{id}/library` doc `{ materials:[{name,unit,unitPrice}], laborRates:[{role,rate}], defaultTaxRate }` (consolidates the `laborRate`/`defaultTaxRate` already on BusinessConfig).
2. **Crews** — `businesses/{id}/crews/{crewId}` `{ name, email, phone, color, active }`. Used by Calendar.
3. **Documents** — small files (base64 via the Phase-2 photo store, capped) **or** pasted URL links (for anything large — avoids paid storage). Metadata in `businesses/{id}/library/documents`.

**APIs:** `src/app/api/company/library/route.ts` (GET/PUT pricing+docs), `src/app/api/company/crews/route.ts` (GET/POST/PATCH/DELETE). `verifyAuthAndRole(["owner","staff","superadmin"])`.

**Pricing pull (reliable AI assist):** in `generateInvoice` + `src/app/api/jobs/[jobId]/invoice/route.ts`, when a material lacks a price, fuzzy-match its name to the catalog; labor rate falls back catalog-role → `defaultLaborRate`. No match → leave blank for manual entry (**never fabricate a price**).

**Rules:** add `match /businesses/{businessId}/crews/{crewId}` and `/library/{docId}` (read: member; write: owner/staff/superadmin).

**Verify:** Add "Shingles bundle $42/sq"; field update mentions shingles w/o price; invoice auto-prices $42. Add crew → shows in Calendar.

---

## Phase 5 — Calendar Powerboard (drag-drop crew scheduling)

**Goal:** Calendar becomes the hub: crews down the left, unscheduled jobs in a rail; drag a job onto a crew×day cell → **grey/provisional** → **Confirm** sends a branded crew email and turns the tile the crew color. Links crew⇄job and carries the time downstream.

**Dep:** add `@dnd-kit/core` (+`@dnd-kit/sortable`) — React 19 + touch friendly.

**Model — extend `Job`:** `assignedCrewId?`, `scheduledStart?`, `scheduledEnd?`, `crewConfirmed?: boolean`.

**Rebuild `src/app/company/calendar/page.tsx`:** left rail (crews + "Unscheduled jobs"); grid crews×days (Work-Week/Week toggle) inside the existing range-filtered fetch. Drag job → tile → optimistic grey/dashed placement → PATCH `{assignedCrewId, scheduledStart, crewConfirmed:false}`. **Confirm** → PATCH `crewConfirmed:true` + POST `src/app/api/jobs/[jobId]/assign/route.ts` → branded crew email (Resend pattern) with address/time/client/scope → tile turns crew color. After-hours provisional appointments (Phase 6) also render grey here.

**Interlink:** scheduled time + crew surface on job detail, report ("Crew: Chava's Crew · Thu 6/04 6:30am"), invoice.

**`src/lib/notify.ts`:** `sendCrewAssignment()`, `sendCustomerConfirmation()` — Resend now, SMS seam later.

**Verify:** Drag job → Carlos Crew/Thu → grey → Confirm → crew emailed, tile colors, job detail shows assignment. Tiles + rows clickable through to job.

---

## Phase 6 — After-hours completion + friction polish

**After-hours:** `bookAppointment` (`src/lib/tools/agentTools.ts`) — when after-hours (webhook already computes `isAfterHours` + injects `afterHoursContext`), set appointment `status:"requested"`, `pendingConfirmation:true`. Caller already told "booked, confirmed in the morning." `src/app/company/appointments/page.tsx` + Calendar render these **grey** with **Confirm & notify customer** → clears pending, `status:"confirmed"`, calls existing `src/app/api/appointments/send-confirmation/route.ts` (branded email; SMS-ready via `notify.ts`).

**Polish:** pills/`⋯` menus to de-clutter dense pages; clickable tiles/rows + `<Link>` everywhere; verify Calls/Leads stay separate but friction-trimmed; interlink summaries (call → lead → appointment → job → calendar → report).

**Verify:** After-hours call books → grey in Appointments + Calendar → Confirm & notify → customer email sent, turns confirmed.

---

## Cross-cutting

- **Cost/free-tier:** no Firebase Storage; base64 split-doc photos + capped docs/links keep us on Spark. Abstraction (`src/lib/photos/store.ts`) flips to Storage when a client justifies Blaze.
- **Performance budget:** job detail GET stays single-doc + lean; photos list = thumbs only; full blobs + report photos lazy; optimistic edits/drags; `<Link>` nav; skeleton states.
- **Firestore rules:** add `crews`, `library`; job `photos`/`photoBlobs` subcollections (member read, owner/staff write). Deploy `firebase deploy --only firestore:rules --project business-expense-trackin-ef659`.
- **New dep:** `@dnd-kit/core` (Phase 5) — `npm install`, commit lockfile.
- **Vapi (user action, not code):** assistant must have `checkAvailability` + `bookAppointment` tools and `{{afterHoursContext}}`/`{{currentDate}}` in the system prompt so after-hours booking fires.

## Verification (per phase, each ends green)
1. `npm run type-check` clean. 2. Manual smoke of that phase's Verify line. 3. Commit + push (ask before push per repo rule). Phase 0 ships immediately.

**Epic acceptance:** Booking never 500s. Field data single-source, editable, voice-correctable, no dupes. Photos field→admin→report (≤2 pages, captioned) on the free plan, grids load instantly. Report is admin-editable with a notes section and a manual Mail gate. Calendar drag-schedules crews with branded confirm emails. Library drives invoice/report pricing. After-hours bookings provisional→confirmed with customer email. Navigation is interlinked and clickable throughout. No regression in Vapi calls, auth, invoicing, or field audio.

## Open risk
- Spark limits are ample for demo/early use (~2k full photos within 1 GiB); the Storage swap is the documented growth path when a client lands.
- Correction safety: the LLM only *detects* a correction and proposes a target; **code computes old/new value + running total**, the human confirms a one-tap card showing exactly what changes, and only that one entry is overridden. The immutable ledger preserves every original statement, so corrections are always traceable and reversible. Worst case (wrong target guess) is caught at the confirm card or fixed in the editable tab — never a silent total wipe.
