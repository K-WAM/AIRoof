# Performance-First Cleanup — Spec for Next Session

**Status:** Not started. Assess feasibility and accuracy before executing.
**Priority:** Phase 4 — after demo validation.

---

## Objective

Frictionless experience: pages feel instant, dead code removed, data fetching smaller and faster, all workflows intact.

---

## Repo State (at time of writing)

- Type-check passes: `npm run type-check -- --incremental false`
- Production build: was started but interrupted — rerun after changes
- Newly added invoice/follow-up files are current work, not dead code
- Preserve all uncommitted work; do not revert unrelated changes

---

## 1. Page Latency and Client-Side Loading

Most pages under `src/app/company` and `src/app/admin` are `"use client"` and fetch after mount — causing loading screens and extra Firebase client bundle cost.

**Optimize in this order:**
1. company dashboard
2. calls, leads, appointments
3. jobs list, job detail
4. field

**Actions:**
- Prefer server-side API aggregation and small payloads over client `getDocs`
- Add `loading.tsx` skeletons so navigation feels instant
- Keep interactive pieces as client components; move initial data loading to server/API where practical

---

## 2. Over-fetching (per page)

| Page | Current problem | Fix |
|---|---|---|
| `dashboard/page.tsx` | Reads full calls + appointments collections just for count | Server count aggregation or compact `/api/company/today` endpoint |
| `calls/page.tsx` | Loads all calls + all messages | Limit initial list, omit full transcripts until call selected, add call-detail fetch |
| `leads/page.tsx` | Loads all leads | Limit to recent/open leads, filter server-side |
| `appointments/page.tsx` | Loads all appointments | Default to upcoming/recent with sane date range |
| `calendar/page.tsx` | Loads all appointments + 100 jobs | Query by visible month range only |
| `jobs/[jobId]/page.tsx` | Fetches all jobs to find one | Replace with `GET /api/jobs/[jobId]?businessId=...`, keep updates/config parallel |

---

## 3. Duplicate or Dead Code

**Two field experiences exist — pick one:**
- `/field` — uses `useSpeechRecorder`, posts text updates
- `/company/field` — uses `useFieldAudio` + Whisper/GPT parsing (the better, current flow)

**Decision needed:** Keep `/company/field` as canonical. Either redirect `/field` → `/company/field` or remove it.

**Dependencies to remove if `/field` is removed or redirected:**
- `useSpeechRecorder` — only used by `/field`

**Confirm and remove unused packages:**
- `twilio` — in `package.json`, but no `src` code imports it (confirm with `npm ls twilio` and `rg 'twilio' src/`)
- `@opentelemetry/api` — appears unused (confirm with `npm ls` and `rg '@opentelemetry' src/`)
- `qrcode` — keep, used by admin demo QR generation

**Docs:**
- Update stale Twilio flow references and `ts-node` seed steps only where they mislead setup

---

## 4. API Security and Consistency

Many API routes are unauthenticated even though they read/write admin or business data.

**Actions:**
- Add role checks to admin APIs → require superadmin auth
- Add business membership checks to business APIs → require matching `businessId`
- Keep Vapi webhook `VAPI_AUTH_BYPASS` behavior (confirmed correct for new Vapi UI)
- Remove noisy per-webhook header logging if it causes log spam/latency
- **Bug:** `src/app/api/calls/outbound/route.ts` calls `verifySessionCookie(__session)` but `AuthContext` stores an ID token, not a Firebase session cookie. Fix: use `verifyIdToken` same as `verifyAuthAndRole`

---

## 5. Field Audio Latency

Current flow: transcription → parsing synchronously → blocks UI.

**Keep one-tap/hold-to-speak feel, reduce perceived latency:**
- Option A: Return transcript immediately, parse/update in background (needs second request or background job)
- Option B: Keep one request but show optimistic `"saved → transcribing → parsing"` state stages in UI
- Switch base64 audio payload to `FormData`/blob upload (simpler, smaller wire format)
- Maintain compatibility with `businesses/{businessId}/jobs/{jobId}/updates` data shape

---

## 6. Data and Model Cleanup

**Job status inconsistency:**
- Values in use: `open`, `inspection`, `quoted`, `in_progress`, `invoiced`, `complete`
- Some UI maps only `open` / `in_progress` / `complete`
- Normalize labels everywhere (types, UI, DB writes, progress bar steps)

**Timezone re-fetching:**
- `useBusinessTimezone` reads `businesses/{businessId}` on every page that uses it
- Fix: include `timezone` in shared company context or API payloads so it's fetched once

**Dashboard — Today view already started (session 2026-05-30):**
- Urgent leads, today's appointments, active jobs, latest calls ✓
- Recommended next actions from existing data — not yet added

---

## 7. UI Simplification for Frictionless Workflows

**Reduce page jumps — expose actions where the user already is:**

| Location | Actions to expose inline |
|---|---|
| Lead detail | Call back, mark contacted, create job |
| Appointment cards | Confirm, call back, create job |
| Job detail | Copy field link, generate report, generate invoice, send invoice |

**Navigation:**
- Replace raw `<a href="...">` with Next.js `<Link>` for internal company/admin navigation
- Replace "Loading…" text screens with skeletons or server-rendered initial state
- Keep UI dense, operational — no marketing padding

---

## Implementation Order

1. Add/repair auth helpers → apply to admin + business API routes
2. Add compact API endpoints: `/api/company/today`, paginated calls, single job detail, date-ranged calendar
3. Refactor company pages to use compact endpoints, remove full-collection client reads
4. Resolve duplicate field flow, remove unused dependencies (confirm before deleting)
5. Polish field audio perceived latency and job detail UX
6. Update stale docs where they mislead setup or operations
7. Run full verification

---

## Verification Checklist

```bash
npm run type-check -- --incremental false
npm run build
```

Manual smoke test (local):
- [ ] Login works
- [ ] Dashboard loads without long blank state
- [ ] Calls list loads; selected call transcript works
- [ ] Leads filter and call-back button still work
- [ ] Appointments confirm / create job still work
- [ ] Jobs list and single job detail load without fetching all jobs
- [ ] Field voice update still writes update + parsed job data
- [ ] Invoice / report generation still works
- [ ] ⌘K search still works
- [ ] Admin pages (businesses, onboarding, invoices, demo) unchanged

Dependency removal: confirm with `npm ls <package>` AND `rg '<package>' src/` before deleting from `package.json`.

---

## Acceptance Criteria

- No broken Vapi, Firebase, field audio, job, invoice, or report workflows
- Company dashboard, calls, leads, appointments, jobs, calendar load with bounded payloads
- Duplicate field code removed or redirected cleanly
- Unused dependencies removed only after confirmation
- API route auth consistent; does not break logged-in staff/superadmin usage
