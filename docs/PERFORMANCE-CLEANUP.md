# Performance-First Cleanup — Verified Spec

**Status:** Partially complete (items 1–6 done; items 7–10 pending).
**Phase:** 4 — in progress.
**Last reviewed:** 2026-05-30

---

## What Was Already Done (do not re-do)

**Phase 3 session:**
- Dashboard redesigned as a Today Feed: urgent leads, today's appointments, active jobs.
- Shared `StatusChip` component replacing 4 inline badge implementations.
- Jobs page filter chips (All / Open / In Progress / Complete with counts).
- `CommandBar` ⌘K global search in company portal.

**Phase 4 session (2026-05-30):**
- ✅ BUG 1 — outbound route auth fixed (`verifySessionCookie` → `verifyIdToken`)
- ✅ BUG 2 — updates and field-audio routes now accept unauthenticated businessId scoping
- ✅ Job status normalization — dashboard filter + jobs chips now cover all 6 statuses; "open" treated as "inspection"
- ✅ Single-job endpoint — `GET /api/jobs/[jobId]` added; job detail page updated
- ✅ /field upgraded to Whisper — `useSpeechRecorder` replaced with `useFieldAudio` (MediaRecorder → Whisper)
- ✅ Unused packages removed — `twilio` and `@opentelemetry/api` removed from package.json

---

## Verified Bugs (broken in production right now)

### BUG 1 — "Call Back" button is silently failing (401 on every click)

**File:** `src/app/api/calls/outbound/route.ts` line 24

**What's wrong:** The route has an inline `getAuthenticatedBusinessId` function that calls `getAuth(app).verifySessionCookie(sessionCookie, true)`. But `AuthContext` (`src/contexts/AuthContext.tsx` line 52–56) stores the Firebase **ID token** (from `firebaseUser.getIdToken()`) in the `__session` cookie — not a Firebase session cookie.

`verifySessionCookie` expects a token created by Firebase Admin SDK's `createSessionCookie`. ID tokens will always fail this check → every Call Back click returns 401.

**Fix:** Replace the inline `getAuthenticatedBusinessId` function entirely. Use the existing `verifyAuthAndRole` from `src/lib/auth/verifyRole.ts` which correctly calls `verifyIdToken` on the `__session` cookie value. Pattern is already working in `src/app/api/jobs/[jobId]/field-audio/route.ts`.

```ts
// Replace the custom auth block with:
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
const auth = await verifyAuthAndRole(request, null, ["owner", "staff", "superadmin"]);
if (!auth.authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const businessId = auth.businessId!;
```

---

### BUG 2 — `/field` (public QR code) is broken for unauthenticated workers

**Files:** `src/app/field/page.tsx`, `src/app/api/jobs/[jobId]/updates/route.ts`

**What's wrong:** The `/field` page is intentionally public (no login, accessed via QR code with `?businessId=demo-roofing`). It posts to `/api/jobs/{jobId}/updates`. But that route now has `verifyAuthAndRole` at line 35, which requires a logged-in user. Unauthenticated field workers get a 401 — their updates silently fail.

**Context:** `/field` and `/company/field` serve DIFFERENT use cases:
- `/field` — public, unauthenticated, QR code access, any field worker or demo prospect
- `/company/field` — authenticated, requires company login, for logged-in staff

**Fix options (pick one):**
- A: Make `/api/jobs/{jobId}/updates` accept `businessId` in the request body as the auth signal (same pattern as Vapi webhook — businessId scoping is the gate). Simple, matches how the QR demo is intended to work.
- B: Add a bearer token approach: `/field` receives a `?token=` param, API validates it against a per-business field token stored in Firestore.
- Option A is simpler and appropriate for a demo/MVP context.

**Do not remove `/field`** — the admin demo QR code points to it. If you remove it, the QR demo breaks.

---

## High Priority — Over-fetching

### 3. Job detail fetches ALL jobs to display one

**File:** `src/app/company/jobs/[jobId]/page.tsx` lines 59–64

```ts
// Current — fetches every job in the business just to find one
fetch(`/api/jobs?businessId=${businessId}`)
  .then(r => r.json())
// then: .find((j) => j.jobId === jobId)
```

**Fix:** Add `GET /api/jobs/[jobId]?businessId=...` endpoint that reads one Firestore doc directly. The `updates` and `config` fetches in the same `Promise.all` are fine — keep those parallel.

This is the highest-latency page in the app for businesses with many jobs.

---

### 4. Job status labels are inconsistent and filters are incomplete

**File:** `src/types/jobs.ts` line 59

The type defines 6 values:
```ts
status: "open" | "inspection" | "quoted" | "in_progress" | "invoiced" | "complete";
// "open" kept for backward compat with existing Firestore docs; maps to "inspection" in UI
```

**Current breakage:**
- Dashboard `activeJobs` filter: `j.status === "open" || j.status === "in_progress"` — misses `inspection`, `quoted`, `invoiced`
- Jobs filter chips (added this session): only shows Open / In Progress / Complete — misses `inspection`, `quoted`, `invoiced`
- Progress bar maps the 5 display steps correctly but the DB values don't align cleanly

**Fix:** Choose one approach:
- A: Normalize DB values — migrate `"open"` docs to `"inspection"` and remove `"open"` from the type. Update all reads.
- B: Keep `"open"` for backward compat and treat it as equivalent to `"inspection"` everywhere in UI logic.

Whichever approach: update the dashboard filter and the jobs filter chips to include all active states (`open`, `inspection`, `quoted`, `in_progress`, `invoiced`).

---

### 5. Calendar fetches ALL appointments and ALL jobs (no range filter)

**File:** `src/app/company/calendar/page.tsx` lines 102–104

```ts
const [apptSnap, jobsRes] = await Promise.all([
  getDocs(query(collection(db, "businesses", biz, "appointments"), orderBy("startTime", "asc"))),
  fetch(`/api/jobs?businessId=${biz}`).then(r => r.json()),
]);
```

All appointments (unbounded), all jobs (unbounded). The spec originally said "100 jobs" — there's actually NO limit, it's worse.

**Fix:** Filter appointments by visible month ± 1 month at query time using Firestore `where("startTime", ">=", startMs)` + `where("startTime", "<=", endMs)`. For jobs, only load active ones (status !== complete) or just use their `createdAt` date — most won't have startTime anyway.

---

## Medium Priority — Redundant Reads

### 6. `useBusinessTimezone` makes a Firestore read on every page that uses it

**File:** `src/hooks/useBusinessTimezone.ts`

Every page that imports `useBusinessTimezone` (calls, appointments, calendar, dashboard, job detail) makes a separate `getDoc(doc(db, "businesses", businessId))` call on mount. The dashboard also fetches this same doc for agent config. That's 2 separate reads to the same doc on the dashboard alone.

**Fix:** Include `timezone` in a shared context or a compact `/api/company/config?businessId=` endpoint that both the layout and individual pages can use. Alternatively, add `timezone` as a field in the `AuthUser` profile (fetched once on login from `businessUsers/{uid}` which could cache it).

---

### 7. Dashboard reads full calls + appointments collections for counts

**File:** `src/app/company/dashboard/page.tsx` (load function)

```ts
getDocs(collection(db!, base + "/calls"))  // reads all call docs just for .size
getDocs(query(collection(db!, base + "/appointments"), ...))  // reads all appt docs
```

**Fix:** Add a `/api/company/today?businessId=` endpoint that returns counts (using Firestore count aggregation queries) plus the urgentLeads, todayAppointments, and activeJobs already needed for the Today Feed — one network request, smaller payload, server-side aggregation.

---

## Lower Priority — Cleanup

### 8. Remove unused npm packages

**Confirm before removing** — run `npm ls <package>` and `rg '<import-pattern>' src/` for each:

| Package | Status | Action |
|---|---|---|
| `twilio` | Only appears as string literals in types/admin routes (`"twilio"` as a service name enum value). No actual `import from 'twilio'` anywhere. | Remove from `package.json` |
| `@opentelemetry/api` | Zero imports in `src/`. In devDependencies only. | Remove from `package.json` |
| `qrcode` | Used by admin demo page QR generation. | Keep |

After removing: `npm install` to update lockfile.

---

### 9. Upgrade `/field` to use Whisper pipeline (quality improvement, not just cleanup)

**Context:** `/field` uses `useSpeechRecorder` (Web Speech API — browser-side, English-biased, poor on job sites). `/company/field` uses `useFieldAudio` (MediaRecorder → Whisper → GPT-4o parsing — much better quality).

**After fixing BUG 2 above:** Update `/field` to use the same `useFieldAudio` hook and post to `/api/jobs/{jobId}/field-audio` instead of `/api/jobs/{jobId}/updates` with raw text. The QR demo experience immediately improves — Whisper handles accent/noise better than browser speech recognition.

`useSpeechRecorder` can then be removed once `/field` is switched.

---

### 10. API route auth — admin routes are unprotected

Many admin API routes (`/api/admin/businesses`, `/api/admin/invoices`, etc.) have no auth check. For MVP this is acceptable behind Vercel's obscure URLs, but before any public launch:
- Admin routes: verify `superadmin: true` using `verifyAuthAndRole` with `["superadmin"]`
- Business data routes: verify business membership

Not blocking for demo, but note as a known gap.

---

### 11. Replace `<a href>` with Next.js `<Link>` for internal navigation

Most company/admin pages use raw `<a href>` tags for internal navigation. Switching to `<Link>` enables client-side transitions (no full page reload, no auth re-check flicker). Low effort, high perceived speed improvement. Not a blocker.

---

## Implementation Order

1. **Fix BUG 1** — outbound `verifySessionCookie` → `verifyAuthAndRole` (30 min, makes Call Back work)
2. **Fix BUG 2** — `/api/jobs/{jobId}/updates` auth model for public `/field` (30 min, makes QR demo reliable)
3. **Fix job status normalization** — normalize DB values OR update all UI filters consistently (1–2 hrs)
4. **Add `GET /api/jobs/[jobId]`** — single-job endpoint, update job detail page (1 hr)
5. **Upgrade `/field` to Whisper** — swap `useSpeechRecorder` for `useFieldAudio` (1 hr)
6. **Remove unused packages** — `twilio`, `@opentelemetry/api` after confirming with grep (15 min)
7. **Calendar month-range filter** — add Firestore date range query (1 hr)
8. **Timezone caching** — add to shared context or company config API (1–2 hrs)
9. **Dashboard count aggregation** — `/api/company/today` endpoint (2 hrs)
10. **API route auth** — admin + business routes (2–3 hrs)

---

## Verification Checklist

```bash
npm run type-check -- --incremental false
npm run build
```

Manual smoke tests:
- [ ] Login works
- [ ] "Call Back" button on leads/appointments makes an actual Vapi outbound call (fix BUG 1)
- [ ] `/field?businessId=demo-roofing` (QR URL) — field worker can submit update without logging in (fix BUG 2)
- [ ] Job detail page loads without fetching all jobs
- [ ] Jobs filter chips show all 5–6 statuses correctly
- [ ] Calendar shows only visible month's appointments
- [ ] Dashboard Today Feed: urgent leads, today's appointments, active jobs all show
- [ ] Invoice / report generation still works
- [ ] Admin pages (businesses, onboarding, invoices, demo) unchanged

Dependency removal: `npm ls <package>` AND `rg '<package>' src/` before deleting from `package.json`.

---

## Acceptance Criteria

- BUG 1 and BUG 2 fixed — Call Back and QR field submission both work
- Job detail loads one job, not all jobs
- Job status labels consistent across type, progress bar, dashboard filter, and list filter chips
- Unused packages removed after confirmation
- No broken Vapi, Firebase, field audio, job, invoice, or report workflows
