# Roofing Platform — Customers, Time Clock, Spanish, Invoicing & Speed

> **Status (2026-09-15): Phases 1–3 and 5 shipped, merged to `main` and pushed to `origin/main`.**
> Phases 4, 6, 7 not started. Tracked as **Phase 12** in `TODO.md` (T-088 onward). This doc is the
> canonical spec for the whole initiative — `TODO.md`/`HANDOFF.md`/`docs/SESSION_HANDOFF.md` narrate what
> shipped and point back here rather than re-deriving the design. Where an implementation detail below differs
> from what actually shipped, a `**Shipped:**` note says so; the rest of each phase's spec is unchanged and is
> what a future session should build next.

## Context

The platform works end-to-end but eight gaps block real roofing crews from using it daily:

1. **No customer entity.** `Job` carries flat `clientName`/`clientPhone`/`address` strings. You cannot ask "show me every Walmart job."
2. **English-only.** Whisper is hardcoded to an English roofing prompt, `parseFieldUpdate` is called with `language: "en"` literal, and the phone AI has no language setting. Spanish-speaking crews are locked out.
3. **No time tracking.** Labor hours exist only as LLM-parsed prose from voice notes ("Kevin worked 8 to 4"). Nothing for a worker to tap, and the voice→invoice round trip is slow.
4. **Photos are unstructured.** One `label` field, no before/after, no editing after upload, and the report crops them with `object-fit: cover` in a fixed 200px box.
5. **Invoices are ephemeral React state.** Nothing persists — leaving the tab discards the work. `Job.invoiceId` is declared but never written. No branding at all on the job invoice, no way to hide the materials breakdown, no logo library.
6. **No trade roles.** Only `owner`/`staff`/`viewer`. No way to invite a technician and land them on the field screen.
7. **Slow pages.** All 13 company pages are client components with no shared cache. `@firebase/firestore` ships 281KB on every authenticated page for four remaining call sites. The job detail page is 1854 lines → a 74.7KB chunk. Report generation fires 8 separate ≤900KB requests.
8. **The field screen shows a URL.** The QR encodes a 300-char token in the query string, and the landing URL carries `?businessId=…&jobId=…`.

Outcome: a roofing crew punches in by tapping, speaks in Spanish, snaps labeled before/after photos, and the office produces a branded, persisted invoice attached to a real customer record — with every screen painting from cache.

**Hard constraints:** Firestore free Spark plan (no Firebase Storage, 1MiB doc cap, 1GiB total). Multi-tenant — per CLAUDE.md, a dental office must never see roofing tools, so nothing may hardcode a per-industry list. Speed and minimal clicks are success criteria, not polish.

---

## Phase 1 — Foundation + the URL fix ✅ SHIPPED (T-088)

Everything downstream depends on this. Ship it first.

**Shipped, with these deviations from the original spec (all deliberate, safety-driven — see T-088's `TODO.md` entry for the full reasoning):**
- **1a/1b split into two endpoints, not one.** `/api/auth/profile` (drop-in server replacement for AuthContext's client Firestore read — admin/hub layouts, `FeedbackForm`, `QuickAddContext`, and `company/settings` all consume `useAuth()` outside the company shell, so a company-only bootstrap couldn't cover them) plus `/api/company/bootstrap` (the company-shell-only industry/vocab/timezone/branding payload, as spec'd). `CompanyBootstrap` shipped without the `user`/`locale`/`agentLanguages` fields — those are Phase 6/7 scope, added when those phases land.
- **1c** shipped exactly as spec'd, plus a new `verifyOwnBusinessRole()` (resolves "my own business" from the session with no businessId input) to fix `src/app/api/calls/outbound/route.ts`'s duplicate inline auth check, which the original audit found wasn't even checking `active`.
- **1e (data layer)** shipped as new, working, tested files (`src/lib/data/store.ts`, `src/hooks/useQuery.ts`) wired into `useQuickAddRefresh` as an *additive* tag-invalidation call — but **not** migrated onto any of the 13 company pages yet. That migration, and prefetch-on-hover, remain future work.
- **1g (split the 1854-line job page)** — **not done.** Flagged as the single riskiest refactor in the app to do without the ability to click through the result; deferred, not attempted.
- **1f** shipped: `src/lib/http/cache.ts`, the missing `GET /api/company/settings` auth guard (a real hole — closed), the calls-list default limit (500→100), and the `admin/businesses` N+1 fix (`db.getAll`). The `admin/usage` N+1 was investigated and left alone — it's inherent to Firestore's per-collection `count()` aggregation (can't be batched), and a real fix needs pagination + a separate totals-aggregation strategy, a product decision, not a backend tweak.
- **1h** shipped exactly as spec'd, including the manifest.json cross-tenant bug fix.

Everything else below (1a core design, 1d, 1h's mechanics) shipped as spec'd.

### 1a. `/api/company/bootstrap` — one call replaces two client Firestore reads

`src/hooks/useBusinessModules.ts:84` and `src/hooks/useBusinessTimezone.ts:47` read **the same `businesses/{bid}` doc** via two client-SDK round trips with two sessionStorage keys.

**New:** `src/types/bootstrap.ts`, `src/app/api/company/bootstrap/route.ts`, `src/contexts/BootstrapContext.tsx`

```ts
export interface CompanyBootstrap {
  user: { uid; email; role: TeamRole | "superadmin"; trade?: TradeTitle | null;
          displayName?: string | null; crewId?: string | null };
  business: { businessId; businessName; industry: VerticalId | null; timezone;
              subscriptionStatus; brandColor; logoUrl;
              locale: "en" | "es"; agentLanguages: Array<"en" | "es"> };
  modules: { disabled: CompanyModule[]; calendarMode; family };
  serverNow: number;
}
```

`vocab` stays off the wire — derive it client-side from `industry` via `getVerticalTemplate`. Payload ~600 bytes. `businessId` derived server-side from the session; `?businessId=` honored only for superadmin preview. Guard: `verifyAuthAndRole(req, businessId, ["owner","staff","viewer","superadmin"])`.

`BootstrapProvider` mounts in [src/app/company/layout.tsx](../src/app/company/layout.tsx). **`useBusinessModules()` and `useBusinessTimezone()` keep their exact public signatures** and become thin selectors — zero call-site churn. One sessionStorage key `lx:bootstrap:{bid}` replaces `businessModules_*` and `tz_*`.

### 1b. Remove `@firebase/firestore` (281KB) from the client bundle

| Site | Replacement |
|---|---|
| [src/contexts/AuthContext.tsx:93](../src/contexts/AuthContext.tsx#L93) | Delete. `superadmin` from `getIdTokenResult()` custom claims (more correct than today); `role`/`businessId` from bootstrap |
| `useBusinessModules.ts:84`, `useBusinessTimezone.ts:47` | BootstrapContext selectors |
| [src/app/company/pipeline/page.tsx:162](../src/app/company/pipeline/page.tsx#L162), `:183` | New `PATCH /api/businesses/[businessId]/leads/[leadId]` and `…/appointments/[appointmentId]` |

Those two PATCH routes close a real hole: `firestore.rules` currently lets any owner/staff client write **arbitrary fields** to `leads`/`appointments`. Afterwards tighten both to `allow update: if false`, matching the `jobs`/`library`/`crews` posture.

**Durability:** add a `no-restricted-imports` ESLint rule banning `firebase/firestore` outside `src/lib/firebase/client.ts`, and drop the Firestore export from `getFirebaseDb`. Expected client bundle: `firebase/app` + `firebase/auth` ≈ 120KB.

⚠️ **`useBusinessId()` feeds CommandBar, both business hooks, and most pages. BootstrapContext must ship in the same PR as the AuthContext change, not after.**

### 1c. `verifyAuthAndRole` point-read + memo

[src/lib/auth/verifyRole.ts:379-386](../src/lib/auth/verifyRole.ts#L379-L386) runs a 3-clause composite query on every authenticated request, though `businessUsers` is keyed by uid everywhere else. Replace with `.doc(decoded.uid).get()`.

Use `member.active !== false` (not `=== true`) — the composite query 403s legacy docs written before the field existed; [src/lib/team/invite.ts:73](../src/lib/team/invite.ts#L73) already uses that convention. **This is a behavior fix, not just perf.**

**New:** `src/lib/auth/memberCache.ts` — `Map<uid, {member, exp}>`, 30s TTL, FIFO-capped at 500 entries (an unbounded Map in a warm lambda leaks). Invalidated from `team/[uid]/route.ts` and `invite.ts`. **Bypass the memo whenever `allowedRoles` includes `"owner"`** so an ownership change is never served stale. Also deletes the duplicate inline `getAuthenticatedBusinessId()` in [src/app/api/calls/outbound/route.ts:12-32](../src/app/api/calls/outbound/route.ts#L12-L32).

### 1d. `src/lib/format/` — shared formatters

Timezone formatters are reimplemented in 8+ files; `fmtDay` is defined **twice in the same file** ([jobs/[jobId]/page.tsx:182](../src/app/company/jobs/[jobId]/page.tsx#L182) and `:1559`).

```ts
export function fmtDay(ms, tz, locale?): string;
export function fmtTime(ms, tz, locale?): string;
export function dayKey(ms, tz): string;        // "2026-09-14", business-local
export function normalizeName(s): string;      // NFD diacritic-fold + lowercase + collapse ws
```

Memoize `Intl.DateTimeFormat` in a `Map` keyed `${locale}|${tz}|${style}` — construction is expensive and 8 files do it inside render loops (CalendarBoard is the visible win). `dayKey` is load-bearing for the time clock and must use `Intl.DateTimeFormat("en-CA", {timeZone: tz})`, which emits `YYYY-MM-DD` natively. Companion `src/hooks/useFormat.ts` binds `tz`/`locale` from bootstrap.

**Shipped note:** the job-detail page's two `fmtDay` definitions have *not* yet been migrated onto this module (that lives inside the 1g split, which didn't happen). `src/lib/format/` and `useFormat.ts` exist, are unit-tested, and are ready for that migration.

### 1e. Shared client data layer — hand-rolled, not SWR

**New:** `src/lib/data/store.ts`, `src/lib/data/tags.ts`, `src/hooks/useQuery.ts`

**Why not SWR:** the bundle isn't the decider (4.4KB is cheap). This app needs cross-entity invalidation with optimistic mutation, and **there is already a working in-house event bus for exactly that** — [src/lib/events/quickAdd.ts](../src/lib/events/quickAdd.ts) / `useQuickAddRefresh("crew"|"material")`. Adopting SWR means running two invalidation systems or migrating the bus; generalizing the existing one into `invalidate(tag)` is less work and less concept surface. There are already two hand-rolled read-cache precedents (`profileCache.ts` + sessionStorage in two hooks) — a third pattern is worse than generalizing the two that exist.

```ts
export type Tag = "jobs"|"job"|"customers"|"leads"|"appointments"|"calls"
                |"library"|"crews"|"team"|"photos"|"invoice"|"punches"|"bootstrap";
export function useQuery<T>(key, url, opts): { data?; error?; loading; revalidating; refetch };
export function invalidate(...tags: Tag[]): void;
export function prefetch(key, url, opts): void;
```

Behaviors, ordered by what makes it feel fluid:
1. **Instant paint from cache, always.** Stale data returns synchronously; `revalidating` drives a 2px top bar, never a skeleton. `PageSkeleton` only on a true cold cache.
2. **Single-flight per key** — permanently fixes the double-read class of bug.
3. `persist: true` mirrors to sessionStorage (`lx:q:{key}`, 256KB cap). Back-nav paints at 0ms.
4. **`prefetch` on `onPointerDown` of every job/customer row**, plus one shared `IntersectionObserver` for the top ~10 rows. Biggest perceived-latency win and the main reason to own the layer — the detail page is warm before React renders it. **Not yet wired to any page — future work.**
5. `mutate(url, init, {optimistic, invalidates})` — patch immediately, roll back with a toast on failure. **Not yet built** — `patch()` (pure cache write) exists; the fetch+rollback wrapper doesn't.

`useQuickAddRefresh` becomes a 5-line wrapper over `invalidate()`; existing call sites untouched. **Shipped as additive**: `emitQuickAddCreated` now also calls `invalidate()`, but the underlying event-callback mechanism is untouched (no page has migrated onto `useQuery` yet, so nothing depends on the tag side working alone).

### 1f. Cache-Control + payload trimming

**New:** `src/lib/http/cache.ts` — `jsonWithCache(data, policy)`.

| Tier | Routes | Header |
|---|---|---|
| semi-static | bootstrap, library, crews, customers-slim | `private, max-age=30, stale-while-revalidate=300` |
| volatile | jobs, leads, appointments, calls | `private, no-cache` + strong `ETag` + 304 |
| immutable | `photos/blobs` | `private, max-age=3600` |
| no-store | all mutations, `/api/field/**` | `no-store` |

**Hard rule (added to CLAUDE.md): never `public` or `s-maxage` on a cookie-authed route** — a shared CDN cache would cross-serve tenant data.

**Shipped:** the `CachePolicy` tiers, applied to `bootstrap` and `company/settings` (semi-static). **Not shipped:** the volatile tier's ETag/304 handling, and immutable caching on photo blobs (that route doesn't exist yet — Phase 3). Also shipped: dropped `/calls` default limit 500→100 (call docs carry full transcripts — the largest payload in the app); fixed the two admin N+1s — `admin/businesses` via `db.getAll(...refs)` (shipped), `admin/usage` investigated and left alone (see the Phase 1 status note above); added the **missing auth guard on `GET /api/company/settings`** (a real hole — any caller who knew a businessId could read another tenant's contact info).

### 1g. Split the 1854-line job page — **NOT SHIPPED, still the plan**

```
page.tsx          → shell: header, tabs, loading (~250 lines)
OverviewTab · LaborTab · MaterialsTab · PhotosTab
InvoiceTab.tsx    → next/dynamic, ssr:false
ReportView.tsx    → next/dynamic, ssr:false
FieldQrModal.tsx  → next/dynamic
jobInvoice.ts     → PURE (Phase 4), unit-tested
reportStyles.ts   → print CSS + the 332 inline styles hoisted
```

Invoice and Report are the heaviest and neither is the default tab. Target initial chunk ~25KB. **Shipped instead:** `optimizePackageImports: ["lucide-react"]` in `next.config.ts` (31 importing files) — the cheap, safe half of this task. The redirect-only `company/leads`/`company/appointments` pages were **not** converted to server components (also deferred).

### 1h. The field-screen URL fix ✅ SHIPPED exactly as spec'd

Three leaks plus a latent tenant bug.

**(a) The 300-char grant in the address bar.** The QR encodes `…/api/field/exchange?grant=<token>`, so the browser must display it in flight. **Fix:** `field-qr/route.ts` mints a 22-char opaque id (`base64url(randomBytes(16))`) stored server-side at `fieldAccessGrants/{grantId}` with the same 10-min TTL; the existing `fieldAccessGrantUses` one-use transaction is unchanged. New Route Handler `src/app/f/[grant]/route.ts` looks it up, calls `consumeFieldExchangeToken`, sets the cookie, 303s. URL becomes `…/f/8kQ2mXpL9vR3tYw1nB7cDa`. **Bonus: roughly halves the QR's data density, so it scans from further away off a printed job sheet.**

**(b) `?businessId=…&jobId=…` on the landing URL.** The field session cookie already carries both in `FieldTokenClaims`. Add `GET /api/field/session` returning them from the cookie; `/f/[grant]` then redirects to bare `/field`, and [src/app/field/page.tsx:35-45](../src/app/field/page.tsx#L35-L45) calls that endpoint instead of reading `searchParams`. **Result: the crew's address bar reads `app.example.com/field`. Nothing else, ever.**

**(c)** Delete `prompt("Copy this link:", qrFieldUrl)` at [jobs/[jobId]/page.tsx:920](../src/app/company/jobs/[jobId]/page.tsx#L920) and `:531`. Replace with a readonly `<input>` in the QR modal, auto-selected on click. After (a) the string is 40 chars — safe to show and useful to text a crew member. **Shipped:** only the QR modal instance (the unauthenticated one-time-grant link) was changed; the `:531` instance is a different, non-sensitive authenticated deep link (`/company/field?businessId=&jobId=`) and was correctly left alone.

**(d)** `public/manifest.json` has `start_url: "/field?businessId=demo-roofing"` — **a cross-tenant bug**: any installed PWA opens someone else's tenant. Change to `start_url: "/field"`, `scope: "/"`, add `"id": "/field"` so existing installs update.

---

## Phase 2 — Customers ✅ SHIPPED (T-089)

**Shipped exactly as spec'd**, with two deliberate deviations:
- **`customerPlaceholder` was not added to `VerticalVocab`.** `customerNoun`/`customerNounPlural` already existed on every vertical template (checked before building) and are sufficient for the Library tab and detail form; adding a new field to `VerticalVocab` would force-touch all 11 `Record<VerticalId,…>` template blocks for cosmetic value only.
- **`GET /api/jobs`'s fuller pagination rewrite (`?status=&crewId=&since=&cursor=`, default limit 50) did not ship.** Only the additive `&customerId=` filter did — every existing caller's default (unfiltered, limit 100) behavior is untouched. The fuller rewrite touches 5 different page surfaces (dashboard, jobs list, field, CalendarBoard, CommandBar) that need to be clicked through together; deferred as its own follow-up.
- CommandBar's customer integration uses the same plain-fetch pattern as its existing 3 sources (leads/jobs/appointments), not the `useQuery` rewrite the spec called for — consistent with 1e not being adopted anywhere yet.

**New:** `src/types/customer.ts`, `src/lib/customers/search.ts`, `src/lib/customers/resolve.ts`, `src/app/api/company/customers/route.ts` + `[customerId]/route.ts` + `resolve/route.ts`, `src/app/company/library/CustomersSection.tsx`, `src/components/customers/CustomerCombobox.tsx`, `scripts/backfill-customers.mjs`

```ts
export interface Customer {
  customerId: string;          // "C-1000+" via businesses/{bid}.customerCounter
  businessId: string;
  name: string;
  kind: "residential" | "commercial";
  phone?: string; email?: string; address?: string;
  contacts?: CustomerContact[];              // max 10
  notes?: string; tags?: string[];
  defaultTaxRate?: number; defaultLaborRate?: number;   // beat Library defaults
  jobCount: number; lastJobAt?: number; lifetimeInvoiced?: number;  // rollups
  matchKey: string;            // `${normName}|${last7digits}`
  searchTokens: string[];      // NEVER rendered
  active: boolean; createdAt: number; updatedAt: number;
}
```

**Collection:** `businesses/{bid}/customers/{customerId}`. **Rules:** `allow read: if isSuperadmin() || isBusinessMember(businessId); allow write: if false;` — stricter than `jobs`, which is correct now that Phase 1b removes client writes.

**`Job` change:** add `customerId?: string`. **Keep `clientName`/`clientPhone`/`clientEmail`/`address` exactly as-is.** The rule: `customerId` is relational truth, `clientName` is a snapshot at job time. Renaming a customer must not rewrite 200 job docs — invoices and reports already sent must not mutate. `PATCH /customers/[id]?propagate=true` re-denormalizes **open jobs only**; `invoiced`/`complete` are frozen.

### The fast search — "walmart" or "kevin" lights up instantly

```ts
// src/lib/customers/search.ts — pure, unit-tested
export function buildSearchTokens(input): string[];
```
Diacritic-fold (`normalize("NFD").replace(/\p{Diacritic}/gu,"")`), lowercase, strip punctuation, drop stopwords. Emit every prefix length 2..12 per word (`"walmart"` → `wa,wal,walm,…`). Phone: last-4 and last-7 digit suffixes so a crew can search "1234". **Cap at 250 tokens**, priority `name → contacts → address`.

**Primary path is client-side, not Firestore.** `GET /api/company/customers` returns a slim list (`{customerId,name,phone,address,jobCount,lastJobAt}`) for up to 1000 customers — fetched once and filtered in memory on every keystroke via `matchesQuery()`. **Zero network, sub-millisecond.**

Firestore token query is the **fallback**, engaged via `?q=` (the shared `tokenForQuery()` helper keeps the query-side lookup token in exact sync with how `buildSearchTokens` indexed it):
```ts
.where("searchTokens","array-contains", tokenForQuery(q)).orderBy("lastJobAt","desc").limit(20)
```
Composite index `searchTokens ARRAY, lastJobAt DESC` (shipped in `firestore.indexes.json`), plus `customerId ASC, createdAt DESC` on `jobs` for the per-customer job list.

**Honest ceiling:** in-memory is good to ~2,000 customers (~2ms filter). The token query degrades past ~50k — `array-contains` is single-token with no relevance ranking (it can only order by `lastJobAt`), and multi-word needs OR-semantics or two queries intersected client-side. **Correct to ~50k customers/tenant; past that the answer is Typesense/Algolia, not a patch to this.** For a field-service SMB that's 20+ years of work.

### Library 4th section + CommandBar

`type Section = "customers" | "pricing" | "crews" | "documents"` — customers first, in the segmented control. Label is `vocab.customerNounPlural` ("Customers"/"Patients"/"Residents"). **Gated by vocab, not `disabledModules`** — every vertical has customers.

CommandBar gains a 4th result type `customer`. Enter navigates to `/company/library?section=customers&customerId=C-1042`, which the Library page reads as `initialCustomerId` to open straight to that customer's detail panel and job list — the "type walmart, see all associated jobs" requirement.

### Collision: the job create form

Do **not** make `customerId` required on `POST /api/jobs` — it would break the pipeline's one-tap appointment→job. Instead a **combobox that is simultaneously free text and search** (`CustomerCombobox.tsx`): picking a match fills name/phone/address and sets `customerId`; typing a novel name submits normally and fires a **non-blocking** `POST /api/company/customers/resolve` that find-or-creates by `matchKey` (phone last-7 + normalized name) and back-patches `job.customerId`. **Zero added clicks.** Same `resolveCustomer` the backfill script uses.

---

## Phase 3 — Photos: before/after, labels, report grid ✅ SHIPPED (T-091)

**Shipped, with these deviations from the original spec (all deliberate — see T-091's `TODO.md` entry):**
- **No field-side photo gallery.** `PhotoEditSheet` (label/phase editing after the fact) is wired
  into the desktop job-detail Photos tab, not a new gallery on `/field`/`/company/field` — neither
  field screen has ever listed already-uploaded photos (upload-only, by design, to stay
  lightweight), and building that gallery is a real feature of its own beyond "add an edit
  sheet." The core value — correct before/after tagging — still lands where it's actually
  decided: `PhotoCapture`'s new inline phase control, at the moment of capture, in both field
  contexts.
- **Only `photoDensity: "compact"` (8-up, the default and the actual reported bug) shipped.** The
  `"comfortable"` 4-up variant is spec'd but not built — `compact` alone already fixes the
  crop/dead-space problem and delivers the "8 photos across 2 pages" ask; a density toggle is
  additional UI scope, not required to close the bug.
- **`sort`/`orientation` are real, stored fields with no consumer yet.** `listPhotoMetas` already
  sorts by `sort ?? createdAt` and `putPhoto` derives `orientation` from `w`/`h` on every upload,
  but no drag-reorder UI writes `sort` yet — `updatePhotoMeta` already accepts a `sort` patch for
  whenever that ships.
- Everything else shipped as spec'd: `MAX_PHOTOS_PER_JOB` 10 → 24 (exported), `processPhoto`
  retuned toward a ~400KB typical output, the batched `GET .../photos/blobs` endpoint (≤12 ids,
  `immutable` cache tier) replacing the report's old one-fetch-per-photo loop, the PATCH
  permission split (label/phase → `verifyFieldAccess`; `includeInReport`/DELETE stay
  owner/staff), and the report grid rewrite (fixed-aspect frame + `object-fit: contain` + a
  blurred backdrop copy — no crop, no distortion, no dead space — before → after → other
  ordering with a row-boundary spacer, `MAX_REPORT_PHOTOS` 8 → 16).

<details>
<summary>Original spec (for reference — the "Shipped" notes above are the authoritative delta)</summary>

```ts
export type PhotoPhase = "before" | "after" | "other";

export interface JobPhotoMeta {
  photoId; label;
  phase: PhotoPhase;                                  // NEW — read as `meta.phase ?? "other"`
  sort: number;                                       // NEW — sparse; drag writes midpoints
  orientation?: "portrait" | "landscape" | "square";  // NEW — derived at upload from w/h
  uploadedBy?; createdAt; includeInReport?; thumbB64; w?; h?;
}
```
No migration — both new fields read with defaults. `listPhotoMetas` sorts by `sort ?? createdAt`.

**Limits.** Raise `MAX_PHOTOS_PER_JOB` 10 → 24 and **export it** (the UI must show "18 of 24"). But 24 × 900KB = 21.6MB/job, and Spark's 1GiB caps that at ~46 maxed jobs. **Pair the raise with tightening `processPhoto` to target ≤400KB** (1280 → 1024 → 800 at q0.72) → ~9.6MB/job, ~100 jobs. Keep `MAX_FULL_BYTES = 900_000` as the hard reject.

### Kill the N+1

**New:** `src/app/api/jobs/[jobId]/photos/blobs/route.ts` — `GET ?ids=ph_1,ph_2,…` → `{ blobs: {...} }` via `db.getAll(...refs)`, one round trip. Guard `verifyFieldAccess`. **Cap ids at 12.** `export const maxDuration = 30`. Header `private, max-age=3600` — blob docs are immutable after write (label/phase live on the meta doc), so aggressive caching is unambiguously correct here. `generateReport()` at [page.tsx:309-316](../src/app/company/jobs/[jobId]/page.tsx#L309-L316) collapses from 8 fetches to 1.

Add to `src/lib/photos/store.ts`: `updatePhotoMeta(db, bid, jobId, photoId, patch)` (absorbs `setIncludeInReport`) and `getPhotoBlobs(db, bid, jobId, ids)`.

### Label editing after the fact (mobile)

**New:** `src/components/field/PhotoEditSheet.tsx` — a **bottom sheet**, not the centered desktop `Modal`. New `.sheet` / `.sheet-backdrop` / `.sheet-handle` classes in `globals.css`; this is a real gap in the design system and Phase 5's time editor reuses it. Contents: large preview, 3-way `.segmented-control` for phase, `<textarea enterKeyHint="done">`, an "Include in report" `Toggle`, Save/Delete.

**Permissions change:** `photos/[photoId]/route.ts` PATCH currently requires staff — but the crew who took the photo must be able to fix its label. Split inside the handler: a body touching only `label|phase|sort` needs `verifyFieldAccess`; `includeInReport` and DELETE keep `verifyAuthAndRole(["owner","staff"])`.

`PhotoCapture.tsx` gains an inline phase control defaulting to **"before" when the job has zero photos, else "after"** — a real click saved.

### The report grid (2×2 + 2×2 = 8/page)

**The core conflict:** a fixed-height box with `object-fit: cover` crops (today's bug at `:1797`), but `contain` alone leaves dead letterbox space that makes a portrait phone photo look tiny.

**Solution: fixed-aspect card slot + `object-fit: contain` + a blurred scaled copy of the same image as the backdrop.** No crop, no distortion, no dead space. On print the blur drops to a flat neutral fill (printers render blurs badly and it wastes toner).

**The geometry, since it decides the layout.** US Letter portrait, 0.4in margins → 7.7in × 10.2in content. 2 columns → card width ≈ 3.75in. For 8 photos (2×4) with a one-line caption: 9.6in ÷ 4 ≈ 2.4in/row, image box ≈ 2.2in → slot aspect ≈ **1.7:1**. A landscape 4:3 photo fills 79% of that width; a portrait 3:4 fills 45% — **which is exactly why the blurred backdrop is required for 8-up to survive mixed orientations.** A 2-line caption at 4:3 does not fit 8 rows on Letter at any size; the arithmetic doesn't close. So: `photoDensity: "compact" | "comfortable"`, **default `compact`** (the 8-up ask), `comfortable` = 4-up at 4:3 with a 2-line caption.

```css
@page { size: letter portrait; margin: 0.4in; }

.rpt-photos { display: grid; grid-template-columns: repeat(2, 1fr);
              gap: .14in .2in; break-before: page; page-break-before: always; }
.rpt-photo  { break-inside: avoid; page-break-inside: avoid;
              border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: #fff; }

.rpt-photo__frame { position: relative; aspect-ratio: 16 / 10; background: #eef2f6; overflow: hidden; }
.rpt-photo__bg    { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
                    filter: blur(14px) saturate(1.1) brightness(.92); transform: scale(1.12); }
.rpt-photo__img   { position: absolute; inset: 0; width: 100%; height: 100%;
                    object-fit: contain; object-position: center; }  /* no crop, no distortion */

.rpt-photo__cap   { display: flex; align-items: baseline; gap: 6px;
                    padding: 5px 8px 7px; font-size: 8.5pt; line-height: 1.25; color: #475569; }
.rpt-photo__phase { flex: none; font-size: 7pt; font-weight: 800; letter-spacing: .06em;
                    text-transform: uppercase; padding: 1px 5px; border-radius: 4px; color: #fff; }
.rpt-photo__phase--before { background: #64748b; }
.rpt-photo__phase--after  { background: var(--report-accent, #0f172a); }
.rpt-photo__label { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; }

@media print {
  .rpt-photo__bg { display: none; }
  .rpt-photo { border-color: #cbd5e1; }
  .rpt-photos { gap: .12in .18in; }
  .rpt-photo__cap, .rpt-photo__phase { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
```
`print-color-adjust: exact` on the phase chip is required or the badge prints blank.

**Ordering + the collision.** Sort included photos `before` (by `sort`) → `after` → `other`; interleaved is useless. But 3 before + 5 after puts the last "before" mid-row, which reads as an error. **Pad to a row boundary between phase groups** with a `visibility:hidden` `.rpt-photo--spacer`. Raise `MAX_REPORT_PHOTOS` 8 → 16 (2 pages), fetched as 2 batched calls of ≤12.

</details>

---

## Phase 4 — Invoice persistence, hide-materials, logos — NOT STARTED

**New:** `src/types/invoice.ts`, `src/lib/billing/jobInvoiceNumber.ts`, `src/app/company/jobs/[jobId]/jobInvoice.ts`, `src/lib/branding/logo.ts`, `src/app/api/company/library/logos/route.ts`

### Persistence

**Collection:** `businesses/{bid}/invoices/{invoiceId}`. **Rules:** read for members, `allow write: if false`.

**ID sequence — deliberately separate from `nextLuxorInvoiceNumber`.** That counter is Luxor's *own platform billing*; a tenant's invoice numbers must never share a sequence with the platform's. Same transaction shape, different location: `businesses/{bid}.invoiceCounter`, alongside the existing `jobCounter` which [POST /api/jobs:43-50](../src/app/api/jobs/route.ts#L43-L50) already proves.

```ts
export interface InvoiceLaborLine {
  lineId; name; arrival?; departure?; hours: number; rate: number; total: number;
  source: "punch" | "voice" | "manual";   // provenance — see Phase 5
  day?: string;                            // dayKey, for punch/voice reconciliation
}
export interface InvoiceMaterialLine {
  lineId; item; quantity: number; unit?; unitPrice: number; total: number;
  source: "voice" | "manual" | "catalog";
}
export interface JobInvoice {
  invoiceId; businessId; jobId; customerId?;
  billTo: { name; email?; phone?; address? };   // snapshot, never re-resolved
  status: "draft" | "sent" | "paid" | "void";
  issuedAt?; dueAt?; terms?;
  labor: InvoiceLaborLine[]; materials: InvoiceMaterialLine[]; other: InvoiceOtherLine[];
  hideMaterials: boolean;
  logoId?: string | null;        // null = business.logoUrl; undefined = no logo
  notes?; taxRate: number; discount?: { kind: "amount"|"percent"; value: number };
  laborSubtotal; materialSubtotal; otherSubtotal; subtotal; taxAmount; total; amountPaid?;
  createdAt; updatedAt; createdBy; sentAt?; sentTo?;
}
```

### The pure module

`src/app/company/jobs/[jobId]/jobInvoice.ts` mirrors [src/app/admin/invoices/invoiceFlow.ts](../src/app/admin/invoices/invoiceFlow.ts) (pure + unit-tested), lifting the logic out of `generateInvoice()` at [page.tsx:249-296](../src/app/company/jobs/[jobId]/page.tsx#L249-L296) verbatim:

```ts
export function buildDraftFromProjection(a: { parsed; punches: WorkerDay[]; library;
  businessConfig; customer }): Pick<JobInvoice,"labor"|"materials"|"other"|"taxRate">;
export function computeTotals(inv): { laborSubtotal; materialSubtotal; otherSubtotal;
                                      subtotal; taxAmount; total };
export function canSendInvoice(inv, dirty, email): boolean;
```
**Both the client live preview and `POST/PATCH /api/jobs/[jobId]/invoice` import `computeTotals`** — that's what makes preview and server agree instead of drifting. `send/route.ts` stops accepting rows from the client and reads the saved doc.

Precedence preserved, with customer overrides inserted:
- Rate: `line.rate` → `lookupLaborRate(library.laborRates, name)` → **`customer.defaultLaborRate`** → `businessConfig.laborRate.defaultHourlyRate` → 65
- Material: `m.cost/qty` → `lookupUnitPrice(library.materials, item)` → **blank, never guessed** (invariant preserved)
- Tax: **`customer.defaultTaxRate`** → `library.defaultTaxRate` → `businessConfig.defaultTaxRate` → 0

`POST` allocates the number, writes the doc, and **in the same `WriteBatch` writes `job.invoiceId` and `job.status = "invoiced"`** — finally closing the dangling field. `PATCH` recomputes totals and **refuses if `status !== "draft"`** (a sent invoice is immutable; void and reissue). The currently-dead `POST /api/jobs/[jobId]/invoice/route.ts` is rewritten, not deleted.

### Live preview

Two-pane: editable rows left, live preview right (desktop) / "Preview" toggle (mobile). **Reuse the `.print-only`/`.no-print` twin-render trick** from `admin/invoices/page.tsx` so `window.print()` emits no form controls. `computeTotals` runs on every keystroke — pure and O(rows), no debounce needed. Autosave PATCH debounced 1200ms. **Import `guardUnsavedInvoiceUnload`, `UNSAVED_INVOICE_MESSAGE` and `runSingleFlight` directly from `invoiceFlow.ts`** — they're generic, and the capture-phase anchor interception is the pattern to copy.

### `hideMaterials` — the exact decision

**When true, the customer sees one line `"Materials & supplies"` with the materials subtotal as its amount — no item names, no quantities, no unit prices. Not nothing.**

Why not nothing: if materials vanish, the visible line items no longer sum to the total and the customer calls to ask — worse than the breakdown. Why not rolled into labor: that misstates the tax treatment (materials are frequently taxed differently) and would require rebuilding the tax base. A lump line preserves arithmetic integrity **and** the tax base, and is standard T&M presentation.

Purely presentational: `materialSubtotal` is still computed from real lines, the real lines are still stored (the business needs them for cost tracking), and the internal view always shows them with a "Hidden from customer" chip. One flag, one `if` in the renderer, zero math changes — shared by print and email. Edge case: `hideMaterials && materialSubtotal === 0` → render nothing.

**Editable material amounts:** `unitPrice` is already an input. Add an editable **`total`** column that back-solves `unitPrice = total / max(quantity, 1)` and flips the row to `source: "manual"` — because "that roll was 240 bucks" is how field-service users actually think.

### Logos in the Library

**Separate doc, not the pricing doc** — base64 on `library/pricing` would bloat a document read on every job page. Use `businesses/{bid}/library/logos`, a **sibling doc in the existing `library` collection**, so the current `match /library/{docId} { allow write: if false }` rule already covers it. **Zero rules change.**

```ts
export interface LibraryLogo {
  logoId; name;
  b64: string;                  // no data: prefix — matches LibraryDocument.b64 precedent
  mimeType: "image/png" | "image/jpeg" | "image/svg+xml" | "image/webp";
  w?; h?;
  variant: "color" | "mono-dark" | "mono-light";
  isDefault?: boolean; createdAt: number;
}
```
**`MAX_LOGO_B64_BYTES = 180_000`, `MAX_LOGOS = 5`** — 5 × 180KB = 900KB, matching the `MAX_FULL_BYTES` precedent and under the 1MiB doc cap. **Validate the sum on write, not just each entry.**

New `processLogo(file)` in `src/lib/photos/clientResize.ts` — max 600px long edge, **keeps PNG to preserve alpha** (flattening a logo to JPEG produces a white box: the #1 way logo upload goes wrong), and passes SVG through untouched.

**Color logo rendering — the decision. The invoice header is white. The logo renders at natural colors, `object-fit: contain`, max-height 56px, left-aligned. `brandColor` appears instead as a 4px rule under the header and on the totals row.** That's what real invoices look like, a color logo needs zero treatment, a mono-dark logo also works on white, and it removes the mono-safe constraint from the one document the customer scrutinizes most.

`brightness(0) invert(1)` stays where it belongs — the email header and report cover, which genuinely use a colored bar:
```ts
// src/lib/branding/logo.ts
export function logoStyle(logo, surface: "light" | "brand-bar"): React.CSSProperties;
// "light"     → no filter, ever
// "brand-bar" → mono-light: none · mono-dark: brightness(0) invert(1)
//             → color: NO filter + a white rounded pill behind it (padding 6px 10px, radius 6px)
```
That last branch is the real answer for a color logo on a colored bar: **don't filter it — put it on a white chip.** Library preview shows the logo on white and on the brand bar so the owner picks `variant` correctly.

---

## Phase 5 — Time clock ✅ SHIPPED (T-090)

**Shipped, with these deviations from the original spec (all deliberate — see T-090's `TODO.md` entry):**
- **The `timesheets/{uid}_{dayKey}` collection was never persisted.** `WorkerDay` is computed on
  demand by `foldPunches` from the `punches` ledger, exactly like `job.parsed` is computed from
  the `updates` ledger — a second write path would just be another cache to keep in sync with
  zero benefit, and the whole point of this architecture (both here and for jobs) is that the
  immutable ledger is the only source of truth.
- **The mobile-editable admin time-edit sheet (append a `supersedes` pair, `verifyAuthAndRole`-
  gated) was not built.** The punch route (`POST /api/timeclock/punch`) only carries the live
  field-app flow — the state machine, the cross-job guard, and the projection merge are all real
  and tested, but there's no UI yet for an owner/staff member to correct a past punch. Nothing in
  the ledger design blocks adding it; it's simply more writes through the same collection.
- **No `[PUNCH]`/`[VOICE]` provenance chips on the job detail page's Labor tab.** The data itself
  is there (`ParsedUpdate.labor[].source`/`dayKey`/`workerKey`) and the merge is correct and
  tested — punched hours genuinely shadow voice hours in the invoice — but the *display*
  treatment wasn't added to `company/jobs/[jobId]/page.tsx`, a 1854-line file with three separate
  labor-rendering call sites that a prior session already flagged as too risky to edit blind
  (no ability to click through the result in this environment). Deferred, not attempted.
- **The nightly close-punches cron runs once/day at a fixed UTC hour** (Vercel Hobby's cron
  frequency cap), chosen to land after local midnight in every mainland US timezone — an
  approximation, not a per-business-precise 23:59:00 close. `missing_out`/`over_16h`/`overlap`
  anomalies are computed correctly by the fold but have no dedicated "amber flag, one-tap fix" UI
  yet (that's part of the deferred edit sheet above).
- Everything else — the six-punch state machine, the office/site split, the lunch-break pause,
  the atomic "Switch job" cross-job guard, and the projection merge rule (a punched
  `(workerKey, dayKey)` shadows the spoken one entirely) — shipped exactly as spec'd below, with
  12 unit tests on the pure fold (`src/lib/timeclock/__tests__/fold.test.ts`).

<details>
<summary>Original spec (for reference — the "Shipped" notes above are the authoritative delta)</summary>

**New:** `src/types/timeclock.ts`, `src/lib/timeclock/fold.ts`, `src/lib/timeclock/machine.ts`, `src/app/api/timeclock/punch/route.ts`, `src/app/api/cron/close-punches/route.ts`, `src/lib/jobs/writeProjection.ts`

### The state machine

The five requested buttons overlap because two are **shop** events (paid yard/travel, not job-specific), two are **site** events (job-specific), and "Lunch Break" is a toggle, not an edge.

```ts
export type PunchType =
  | "office_in"    // Arrived Office  — paid day starts
  | "site_in"      // Arrived Jobsite — job-scoped clock starts
  | "break_start"  // Lunch Break     — pauses whichever clock is running
  | "break_end"    // Back from Lunch
  | "site_out"     // Left Jobsite
  | "office_out";  // Left Office     — paid day ends
export type ClockState = "off" | "office" | "site" | "break_office" | "site_break";
```
```
off          --office_in-->   office
off          --site_in-->     site           (drove straight to the job)
office       --site_in-->     site           (auto-emits implicit office_out, same ms)
office       --break_start--> break_office
office       --office_out-->  off
site         --break_start--> site_break
site         --site_out-->    office | off   ← rule below
site         --office_out-->  off            (straight home from site)
break_office --break_end-->   office
site_break   --break_end-->   site
site_break   --site_out-->    office | off   (auto-emits break_end first)
```
**`site_out` rule:** → `office` only if the worker had an `office_in` earlier that `dayKey`, else `off`. Matches reality, needs no extra UI.

**Overlap resolution: office punches are never job-scoped; site punches always are.** Only site time lands on a job's labor. Office time accrues to a per-day timesheet for payroll and is explicitly **not** invoiced (it's overhead) unless someone adds an "Office/Travel" other-line.

### Collections

```
businesses/{bid}/punches/{punchId}           — immutable edge ledger, BUSINESS-level
businesses/{bid}/timesheets/{uid}_{dayKey}   — folded per-worker-per-day projection
```
Business-level, not under a job, because `office_*` has no job and the cross-job guard needs "does this worker have an open site punch *anywhere*" in one query. Index `(workerKey ASC, at DESC)`.

```ts
export interface Punch {
  punchId;            // `pn_${at}_${rand4}`
  businessId;
  workerKey: string;  // `uid:${uid}` for accounts; `name:${normalizeName(n)}` for QR crew
  workerName: string;
  type: PunchType; jobId?: string;   // required for site_in/site_out
  at: number; dayKey: string;        // business-tz local date, from @/lib/format
  source: "field-app" | "admin-edit" | "auto-close";
  editedBy?; editedAt?;
  supersedes?: string;               // append-only edits
  note?; createdAt: number;
}
```
**Punches are append-only, exactly like the `updates` ledger.** An edit appends a new punch carrying `supersedes: oldPunchId`; the fold ignores any punch whose id appears in a later punch's `supersedes`. Same trick `buildProjection` uses for corrections — zero mutation, full audit trail. Rules: read for members, `allow write: if false`.

### The fold (pure)

```ts
export function foldPunches(punches: Punch[], nowMs: number, tz: string): WorkerDay[];
export function punchedLaborForJob(days, jobId):
  Array<{ workerKey; workerName; dayKey; hours; arrivalTime; departureTime }>;
```
Anomalies, specified rather than hand-waved:
- `missing_out` — an open `site` closes at `office_out` if one exists, else at the **last punch + 0 minutes**, flagged. **Never guess a departure.** Labor tab shows it amber with a one-tap "Set departure".
- `over_16h` — clamp to 16h and flag, so a forgotten punch can't bill three days.
- `overlap` — impossible via the guard, but if an admin edit creates one, keep both and warn. Never silently drop billable time.
- Nightly `/api/cron/close-punches` (reusing the existing `CRON_SECRET` pattern) writes `auto-close` punches at 23:59 local so the guard doesn't block the next morning.

**Auto-pause on inactivity is explicitly rejected.** Geofencing/activity heuristics on the free plan produce wrong payroll, and wrong payroll is the fastest way to lose a client. The 23:59 cron plus `missing_out` is the honest substitute. **Put that in the module comment so nobody "helpfully" adds it later.**

### The cross-job guard

`POST /api/timeclock/punch` `{businessId, type, jobId?, workerName, at?, closeOpen?}`:
1. Guard `verifyFieldAccess` (a QR crew member must be able to punch). For a logged-in user `workerKey = uid:${gate.user.uid}` is derived **server-side** and any client value ignored; for QR, `name:${normalizeName(workerName)}`.
2. Load the worker's punches for `dayKey` (one indexed query) → `foldPunches` → current state + `openJobId`.
3. Illegal transition → `409 { error, currentState, openJobId, openSince, suggestion }`.
4. Field client renders: **"You're still clocked in at J-1042 — Walmart #2291 (since 8:04 AM). Clock out there and start here?"** → `[Switch job]` resends with `closeOpen:true`; the server emits both edges atomically in one `WriteBatch`.
5. Returns the new `WorkerDay` so the UI updates with no refetch. One round trip, one dialog.

### Mobile-editable time list

`LaborTab.tsx` renders per worker-day: `Kevin · Mon Sep 14 · 8:04a → 4:31p · 8.0h · [PUNCH]`. Tap opens the **same `.sheet` bottom sheet from Phase 3** with two `<input type="time">`, a break-minutes stepper, Save. Save appends a `supersedes` pair (`admin-edit`) — never a mutation. Requires `verifyAuthAndRole(["owner","staff"])`. Voice rows carry a `[VOICE]` chip and edit as today via a ledger correction. Both kinds sit in one list with provenance chips.

### Projection integration — the most important part

`buildProjection` must not import punches or it stops being a pure fold of one ledger. So:

```ts
export function buildProjection(
  updatesInput: FieldUpdate[],
  punchedLabor?: Array<{ workerKey; workerName; dayKey; hours; arrivalTime; departureTime }>
): ParsedUpdate;   // second arg omitted ⇒ today's behavior byte-for-byte
```
Merge rule, inside the existing step 3:
1. Build voice labor exactly as today, stamping `dayKey(sourceUpdate.createdAt, tz)` and `workerKey = "name:" + normalizeName(l.description)`.
2. Build a `Set` of `${workerKey}|${dayKey}` from `punchedLabor`.
3. **Drop any voice line whose `(workerKey, dayKey)` is in that set** — the punch wins.
4. Append every `punchedLabor` entry with `source: "punch"`.

`ParsedUpdate["labor"]` gains `source?`, `dayKey?`, `workerKey?` — all optional, so existing docs and `laborSchema` stay valid with `.optional()` additions.

**Why the "LLM is never in the arithmetic path" invariant holds:** `punchedLabor` comes from `foldPunches`, pure arithmetic over timestamps written by button taps. Voice labor is **suppressed** by punch data, never combined with it — there is no code path where a model-produced number is added to a punch-produced number. Extend the module doc: *"Two authoritative sources, never mixed: a punched (workerKey, dayKey) shadows the spoken one entirely."*

**Consolidate the duplicated `writeProjection`** — the private helper exists in both `field-audio/route.ts:52-69` and `updates/route.ts`. Replace both, plus the new punch route, with `src/lib/jobs/writeProjection.ts` → `writeJobProjection(db, businessId, jobId, opts?)`.

</details>

---

## Phase 6 — Spanish — NOT STARTED

### `field-audio/route.ts`

**Whisper: auto-detect. Do NOT pass `language`.** Crews code-switch mid-sentence ("puse doce bundles de shingles"); forcing `"es"` degrades the English nouns, forcing `"en"` mangles the Spanish.

```ts
const transcription = await openaiClient.audio.transcriptions.create({
  model: "whisper-1", file: audioFile,
  prompt: buildWhisperPrompt(jobContext, biz?.agentLanguages, biz?.industry, libraryMaterialNames),
  response_format: "verbose_json",   // ← only this shape returns `language`
  temperature: 0,
}, { signal: controller.signal });
const detected = normalizeLang(transcription.language);   // "spanish" → "es"
```

**Extract the biasing prompt** to `src/lib/ai/whisperPrompt.ts`, industry- and tenant-driven instead of hardcoded roofing English: vocabulary from `VERTICAL_TEMPLATES[industry].vocab` **plus the tenant's own Library material names (top 30)** — those are the exact words Whisper mishears, a real accuracy win independent of Spanish. When `languages` includes `"es"`, append Spanish correction cues (`"Las correcciones suenan así: que sean 120 no 150, olvida eso, quise decir."`). **Cap at 224 tokens** (Whisper's documented limit) — truncate the material list, never the instructions.

**Add `export const maxDuration = 60;`.** There is no `maxDuration` export anywhere in the repo, so this route runs at the platform default while doing Whisper (up to 30s) + GPT-4o + 3 Firestore round trips serially. That's an existing latent bug; a translation hop makes it a guaranteed one.

### `parseFieldUpdate` — one call, not two

Add `transcriptEn` to the model's JSON output and instruct it to translate as part of extraction. Why one call: a second adds 1.5–3s to a path already near the timeout; translating in the extraction context keeps "doce bundles" → "12 bundles" consistent between prose and line items (two calls can disagree); and cost. The risk is mitigated because `gpt-4o` at temp 0.1 handles es→en trivially and `transcriptEn` is **display-only**.

System-prompt block:
```
LANGUAGE
- The update may be in English, Spanish, or a mix.
- ALWAYS emit structured data in canonical ENGLISH: material names, issue descriptions,
  and timeline descriptions.
- Worker names are NEVER translated ("José" stays "José").
- Also return "transcriptEn": a faithful English rendering of the whole update.
  If the update is already English, set it to "" (do not echo).
- Numbers, units and times are language-independent — digits and 24h "HH:MM".
```
`ParsedUpdate` gains `transcriptEn?` and `sourceLanguage?`; `parsedUpdateSchema` gains both as `.optional()`.

⚠️ **`buildProjection` must ignore both.** `ParsedUpdate` is both the per-update parse output *and* the folded projection; folding translation fields would concatenate translations across days onto the job doc. Add a test asserting `foldedJob.parsed.transcriptEn === undefined`.

### `FieldUpdate`

```ts
  rawText: string;     // UNCHANGED — verbatim, spoken language
  language?: string;   // EXISTS — now actually populated ("en" | "es")
  rawTextEn?: string;  // NEW — canonical English; absent when language === "en"
```
[src/lib/schemas/persistence.ts:73](../src/lib/schemas/persistence.ts#L73) already allows `language`; add `rawTextEn` beside it. One extra field, no new collection.

**Typed-text fallback** (`POST /api/jobs/[jobId]/updates`, no Whisper): `src/lib/i18n/detect.ts` — a 60-word Spanish stopword list plus `¿¡áéíóúñ` detection; ≥2 hits → `"es"`. Ambiguous → pass `undefined` and let the model decide. **No extra LLM call.**

### The "Translated" badge

Both `/field` RECENT and `/company/field` + the Overview timeline render `rawTextEn ?? rawText` with a chip `ES → EN` (new `.sc--translated` modifier — muted slate, not a status color). Tapping toggles the row to `rawText` and the chip to `Original`. **Pure client state, zero fetch** — both strings are already in the `updates` payload.

`<html lang="en">` → `<html lang={locale}>`. The portal itself stays English; `locale` only drives `Intl` formatting through `@/lib/format` and replaces the two `"en-US"` literals at [field/page.tsx:515](../src/app/field/page.tsx#L515) and [webhooks/vapi/route.ts:114-115](../src/app/api/webhooks/vapi/route.ts#L114-L115).

### Phone AI

`BusinessConfig` gains `agentLanguage?: "en"|"es"` and `agentLanguages?: Array<"en"|"es">`. Settings UI: one `.segmented-control` — `English` / `Español` / `Bilingual (EN first)` / `Bilingüe (ES primero)`.

**`buildAgentPrompt`**: insert a `## Language` section immediately **before** `## Response Style` (line ~120) so the tone rules that follow apply to whichever language is active. No signature change.
```
## Language
- Greet and answer in {primary}.
- [bilingual] If the caller speaks Spanish, switch and stay there. Follow them back to
  English if they switch. Never mix languages within a sentence.
- Spell back names and addresses in the caller's language.
- Record tool arguments (name, phone, email, serviceType, notes) in the language the
  caller used — do NOT translate the customer's own words into English.
```
That last line matters: the **field** path canonicalizes to English, but a booking's `callerName`/`notes` must preserve what the caller actually said or the callback goes wrong. **These two subsystems have opposite requirements — state it explicitly in both prompts.**

**Vapi.** `assistantOverrides.variableValues` is a dead end — per [vapiClient.ts:71-84](../src/lib/vapi/vapiClient.ts#L71-L84) the `assistant-request` event only fires for numbers with no fixed `assistantId`, and every provisioned number has one. Everything goes through `updateAssistantPersona`, which already GETs then PATCHes `firstMessage` + the whole `model` object — **so the prompt half works with zero new plumbing**, just by calling it on the settings save path. Extend it with `transcriber?` and `voice?` params.

⚠️ **The trap:** a partial PATCH of a nested Vapi object replaces it wholesale. `startSpeakingPlan.waitSeconds: 0.1` and `stopSpeakingPlan.numWords: 2` are top-level assistant fields and **must be read from the GET and written back in every PATCH, never omitted.** All voice/transcriber changes go through this one function so preservation happens in exactly one place — refactor `scripts/rollback-vapi-voice.mjs` to call it too.

**Transcriber:** Deepgram Flux with `language: "es"`; `"multi"` for bilingual. **Given the CLAUDE.md 2026-09-07 gpt-realtime finding — that turn-taking tuning does not survive a transcription-stack change — do not ship bilingual as the default.** Ship single-language `en` and `es` first (same model, different language code: low risk, tuning intact). Gate `"multi"` behind a per-business flag labeled "beta — may feel slower". If endpointing degrades, the fallback is **two phone numbers → two assistants**, which is zero-risk and often what SMBs actually want.

**Voice:** `Savannah` is English-only. New `src/lib/vapi/voices.ts` maps `"en"|"es" → {provider, voiceId}`. For bilingual use a **single multilingual voice** — Vapi cannot swap voices mid-call, and a caller hearing two different people is worse than a slight accent.

---

## Phase 7 — Trade roles — NOT STARTED

**Decision: a separate `trade` field on `businessUsers`. Not a new `TeamRole` member. Not a `Crew` link.**

```ts
export type TeamRole = "owner" | "staff" | "viewer";        // UNCHANGED — permission axis
export type TradeTitle = "foreman" | "technician" | "journeyman" | "apprentice"
                       | "estimator" | "installer" | "helper" | "dispatcher" | "office";

export interface TeamMember {
  uid; email; role: TeamRole;
  trade?: TradeTitle;      // NEW — descriptive, carries NO permissions
  displayName?: string;    // NEW — needed for punch attribution and labor lines
  crewId?: string;         // NEW — optional pointer to the scheduling Crew
  active: boolean; createdAt: number;
}
```

**Why not a union member**, grounded in this code:
1. `verifyAuthAndRole(req, bid, ["owner","staff","superadmin"])` appears with literal arrays at dozens of sites. Adding `"foreman"` means auditing every one — a large change whose failure mode is a silent privilege bug.
2. The **last-owner guard** in `team/[uid]/route.ts` counts `role === "owner"`. Two axes in one field makes that count ambiguous — you could demote the last owner via a *title* change.
3. Permission and job title change independently. A foreman promoted to run the office is still a foreman by trade.

**Why not just the `Crew` link:** `Crew` is a login-less scheduling resource. A tradesperson is an account. `crewId` as an optional pointer gives the useful part without conflating identity with a scheduling bucket; a Crew can hold several accounts, which is correct.

**Seats:** `countActiveTeamMembers` is unaffected (`trade` doesn't enter it). But `DEFAULT_SEAT_LIMIT = 5` becomes a real constraint once you're inviting technicians — a roofer with 12 techs can't onboard. **Recommend raising the default to 10 and letting the pricing tier carry `seatLimit` on the business doc** (already read there). Flagged as a product decision.

`verifyAuthAndRole` semantics unchanged. Phase 1c's point-read returns the whole `TeamMemberDoc`, so `VerifiedUser` gains `trade?`/`displayName?` for free — consumed by the punch route and labor attribution.

The **one** behavioral effect, data-driven (not a hardcoded per-industry list):
```ts
// src/lib/team/landing.ts
export function defaultLandingPath(m: { role; trade? }, disabled: CompanyModule[]): string;
// technician|journeyman|apprentice|installer|helper → "/company/field"
// foreman                                           → "/company/jobs"
// everyone else                                     → "/company"
// ALWAYS "/company" when "jobs" ∈ disabled  ← the vertical-safety guard
```

**How an invited tradesperson lands correctly:** owner invites with `role: "staff"`, `trade: "technician"`, optional `crewId` → `inviteTeamMember` validates against `TRADE_TITLES` → `sendTeamInviteEmail` deep-links field trades to `/company/field` → password reset → bootstrap returns `{role, trade, crewId}` → layout redirects via `defaultLandingPath` → `/company/field` filters to **my crew's jobs + unassigned** via `GET /api/jobs?crewId=…&includeUnassigned=1`.

⚠️ **This is scope-as-convenience, not scope-as-security** — `verifyFieldAccess` still grants business-wide read. Tightening it to crew level is a separate, larger change, deliberately deferred (it would break the QR path, which is job-scoped by token, not crew-scoped).

Team panel UI: **two columns, `Role` and `Title`**, never one merged dropdown. Reuse `.form-grid`/`.field`.

---

## Cross-workstream collisions

1. **Time-clock labor ↔ invoice labor.** Punch shadows voice per `(workerKey, dayKey)` inside `buildProjection`; the invoice reads the already-resolved projection and therefore **cannot double-bill**. A manual invoice edit does not write back to the punch ledger; a timesheet edit does not retroactively change a sent invoice. Surface it: when `status === "draft"` and the fold changed since `invoice.updatedAt`, show a **"Timesheet changed — [Refresh lines]"** banner.
2. **Customers ↔ job create form** — combobox, non-blocking resolve, zero added clicks (Phase 2, shipped).
3. **Photo phase ↔ report layout** — row-boundary padding between phase groups, or 8-up splits mid-row and reads as a bug.
4. **Bootstrap ↔ `useBusinessId`** — shipped together, same commit (Phase 1).
5. **`transcriptEn` ↔ `buildProjection`** — guard with a test.
6. **Logos ↔ report/email brand bar** — the invoice's white-header decision must not be blanket-applied to `notify.ts` and the report cover. `logoStyle(logo, surface)` is the seam.
7. **Roles ↔ member memo** — bypass whenever `allowedRoles` includes `"owner"` (shipped in Phase 1c, ready for Phase 7 to depend on).
8. **Customer search ↔ Spanish** — diacritic folding is already in `buildSearchTokens` (shipped, Phase 2) — "José Martínez" is searchable as "jose" today, ready for Phase 6.
9. **`MAX_PHOTOS_PER_JOB` 10→24 ↔ Spark's 1GiB** — pair with the 400KB `processPhoto` target, and add a per-business storage estimate to the admin usage page (already being touched for its 1+3N fix).

---

## Verification

Run per phase; each is independently shippable.

**Every phase:** `npx tsc --noEmit` and `npm test` clean. `Record<VerticalId, …>` in `templates.ts` makes `tsc` fail until every vertical handles a new vocab field — that's the intended guard.

| Phase | Gate | Status |
|---|---|---|
| **1** | DevTools Network on `/company/dashboard`: **no `@firebase/firestore` chunk**, one `/api/company/bootstrap` (not two `businesses/{bid}` reads). Back-nav jobs→detail→jobs paints with no skeleton. `curl https://ai-roof.vercel.app/api/health`. Scan a field QR on a real phone → **address bar reads `/field` with nothing after it**. Install the PWA on a non-demo tenant → opens that tenant, not `demo-roofing`. | Chunk absence confirmed locally by inspecting `.next/static/chunks` after a production build; the field-QR/PWA gates need a real-phone pass, not yet done (no device in this sandbox). |
| **2** | Seed ~200 customers; type "wal" in ⌘K → results in **<50ms with no network request** (confirm in Network). Click through → drawer lists every Walmart job. Create a job with a brand-new client name → reload → `job.customerId` populated. Run `node scripts/backfill-customers.mjs --dry-run` then for real; verify job counts match. | Logic verified by unit/route tests against a fake Firestore; the live ⌘K timing/network-tab check and the backfill script's real-data dry-run against `demo-roofing` are not yet done. |
| **3** | Upload one portrait and one landscape photo, mark both for report → Print Preview: **both look intentional, neither cropped nor distorted**, phase badges print in color, 8 per page, no mid-row phase split. Report generation is **1 network request**, not 8. Edit a label from a phone as a QR crew member (no login) → saves. | Not started. |
| **4** | Build an invoice, navigate away, return → **still there**. Toggle `hideMaterials` → customer view shows one "Materials & supplies" line and the visible lines still sum to the total. Upload a color PNG logo → renders at natural colors on the invoice and on a white chip in the emailed report header. Send → `job.invoiceId` and `status: "invoiced"` written; PATCH afterwards returns 4xx. | Not started. |
| **5** | Tap Arrived Jobsite on J-1001, then on J-1002 → **409 with the "still clocked in at J-1001" dialog**; Switch job emits both edges. Lunch Break pauses, Back from Lunch resumes. Edit a time on mobile → appends a `supersedes` punch, original preserved. Unit test: a punched (worker, day) **removes** the voice line rather than summing with it. | Not started. |
| **6** | Record a Spanish note on a real phone → English line items on the invoice, `ES → EN` chip on the entry, tap shows the verbatim Spanish. Test: `foldedJob.parsed.transcriptEn === undefined`. Set a business to Español, call the demo line → agent greets in Spanish; **verify in the Vapi dashboard that `startSpeakingPlan`/`stopSpeakingPlan` survived the PATCH** (this is the CLAUDE.md-documented failure mode). | Not started. |
| **7** | Invite a technician → invite email deep-links to `/company/field` → after password reset they land there scoped to their crew. Try to demote the last owner → still refused. | Not started. |

**Docs updated on Phase 1–2 completion:** this file (new), `CLAUDE.md` (new Key Files entries, the never-`public`-Cache-Control rule, a Customers/search summary), `TODO.md` (new Phase 12, T-088/T-089), `HANDOFF.md`, `docs/SESSION_HANDOFF.md`. `public/guides/onboarding-guide.html` intentionally **not** touched yet — nothing customer-facing in the demo flow changed (Customers is an internal Library tab, not a new onboarding step); revisit once Phase 4 (logo upload) or Phase 6 (language toggle) land, per the guide's own update-trigger list in `CLAUDE.md`.
