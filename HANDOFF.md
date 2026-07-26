# HANDOFF — AI Receptionist Platform
Last updated: 2026-07-15 (industry-applicability pass: 7 verticals, adaptive Calendar, client-safe Demo Studio, dead-code sweep)

> **2026-07-20 — Release plan supersedes this file for release work.** A consolidated three-audit review (`consolidated_implementation_brief.md`) found 2 P0 + 11 P1 defects; verdict: not production-ready (internal demo OK). Canonical execution system: `MASTER_PLAN.md` · `AGENTS.md` · `TODO.md` · `docs/SESSION_HANDOFF.md`. This file remains the historical architecture/demo record.

## Current State

**Completion: ~98%** — live at https://ai-roof.vercel.app. Everything below is shipped and (where noted) verified in production.

**Pushed to `main` as `6adc26a`** (2026-07-15, 34 files, +5564/−842). Vercel auto-deploys from main — confirm the deployment went green.

> ⚠️ **Not click-tested.** This session's work is `tsc` clean, `npm run lint` clean (0 errors), `next build` green, and the seed logic is verified per-vertical by script — but the drag-to-assign Calendar path is **new code that no human has clicked**. Auth-gated pages can't be driven headlessly. See "Pending / Next" below.

**Knowledge graph**: `graphify-out/` — **908 nodes, 1639→1676 edges, 81 communities** (rebuilt + incrementally updated 2026-07-15; health check clean). It is **gitignored/local-only** — each machine builds its own via the `/graphify` skill. God nodes: `getAdminFirestore()` (114), `verifyAuthAndRole()` (42), `verifySuperadmin()` (34), `useBusinessId()` (26), **`useBusinessModules()` (20)**, `verifyFieldAccess()` (19).

---

## This session (2026-07-15) — make every industry applicable, top-tier demo

**The theme: a tenant must only see tools that apply to them, and a demo must never open on an empty screen.**

**1. Seven verticals — added Cleaning** (`Robin`, Teams, "Team A — Rosa"). Full jobs mode, so it gets the 24/7-intake → CRM → field-notes → invoice loop like Roofing/HVAC/Landscaping/GC. Dental + Property Mgmt remain intake-only.

**2. Every industry keeps a Calendar — the board adapts** (new `calendarMode` on the template):
- `"jobs"` (field service): drag an unscheduled job onto a **crew/tech/team** × day → **Confirm + email crew**.
- `"appointments"` (Dental, Property Mgmt): drag an unassigned booking onto a **provider/vendor** × day → **Confirm + email the patient/tenant** (reuses `/api/appointments/send-confirmation`). Dragging preserves time-of-day (a 10:30 cleaning stays 10:30); jobs land at 8am.
- New `Appointment.assignedCrewId` + new **`PATCH /api/appointments/[appointmentId]`** (session-gated, owner/staff/superadmin) to assign/move.
- *An earlier version of this session hid the Calendar from Dental/Prop-Mgmt. That was wrong — a missing tab in a meeting is a lost deal. Reverted; see the Industry-Applicability Rule in CLAUDE.md.*

**3. `useBusinessModules()` — one source of truth** (`src/hooks/useBusinessModules.ts`): `isEnabled(module)`, `vocab`, `calendarMode`, sessionStorage-cached, **fails open** (unknown industry → all tabs). Consumed by nav, dashboard, guide, jobs, library, and the route guard. Killed the nav's private Firestore fetch.
- **Route guard is central**: `MODULE_ROUTES` in `src/app/company/layout.tsx` — hiding a tab wasn't enough; a dental user typing `/company/jobs` now redirects to Dashboard.
- **Per-vertical `vocab`**: HVAC reads "Service call"/"Tech" ("*replaced the capacitor, added 2 lbs of R-410A*"); GC reads "Project"/"Client" ("*hung 40 sheets of drywall*"). Dental never sees "shingles".

**4. 🔴 Fixed a live demo hole: nothing ever seeded crews or jobs.** Every Demo Studio launch — *including roofing, today, in production* — opened the Calendar on "No crews yet" with an empty rail and nothing to drag. Now every launch seeds 3 resources + 3 jobs (field service) or 3 bookings with one deliberately unassigned (intake). Verified per vertical by script.
- Caught two bugs in that seeding before ship: `updates: []` written onto job docs (it's a subcollection) and seeded `J-1001` without advancing `jobCounter` → **the next real job would have overwritten a seeded one**. Both fixed (`jobCounter` now advances).

**5. Demo Studio is client-safe** (`/admin/demo` is usually facing the guest):
- The pitch script ("*Hey [Prospect], imagine your customer calling…*") is now behind **Presenter notes → Show my script**, collapsed by default.
- "Enter prospect info" → **"Personalize"**; "Prospect company name" → "Company name"; "Have the prospect call this number" → "Call this number — {agent} answers as {company}".
- **Fixed a name flip visible mid-demo**: the pre-launch chip said "*Roofus* is your agent" (template) but the launch banner said "*Alice* now answers" (API override). Both now resolve through `demoAgentName()` in the template.

**6. Tools are applicable per industry.** All 7 Vapi tools are generic (book/cancel/lookup appointment, createLead, escalate, checkAvailability, getCurrentDate) — no Vapi change was needed for Cleaning. But dental's booking rules say "collect DOB + insurance" and **the tool has no field for those** — the agent collected them and they evaporated. `buildAgentPrompt` now tells the agent to put extra per-industry details in `notes`, and **not to ask for an address when the rules don't mention one**. Verified: the dental prompt contains no "roof", and asks for no address.

**7. Client-facing email leak fixed**: the confirmation email told every recipient "booked and confirmed this **inspection**" and defaulted the service line to `"Inspection"`. A dental patient would have received that.

**8. Dead code + workflow** (~230 lines): deleted `useSpeechRecorder.ts` (superseded by `useFieldAudio`), `authMiddleware.ts` (superseded by `verifyRole.ts`), `STORAGE_DRIVER`, `getAdminApp`, `BusinessIntegrationConnection`, `crewOf`, `timeAgo`, `btnShadow`, `displayName`, `previewSuffix`, unused imports. Killed drift-prone duplicates: `FIELD_SERVICE_VERTICALS` and `AGENT_NAME` now derive from templates.
- **Kept deliberately**: `CallSession`, `UserBusinessMembership`, `SuperadminProfile` — unused in TS but the only description of the live `calls`/`businessUsers` collections. Rule applied: *drop types with no data behind them, keep types describing a real collection.*
- **`npm run lint` works for the first time** — there was no ESLint config or dependency, so it dropped into an interactive prompt and hung forever. Now `eslint .` on a flat config: **0 errors**, 26 warnings (`<img>`, `exhaustive-deps`) left visible as backlog. `no-explicit-any` is a *warning* (10 pre-existing `any`s in webhook/tools/cron payloads — tightening those in this session risked breaking a working webhook).

**9. Demo Playbook rewritten** (`public/guides/onboarding-guide.html`) — it was **actively misleading**: said "six industry cards", described a "💬 Script" panel and "Enter Prospect Info" that no longer exist, and — worst — told you Dental/HVAC/Cleaning were **"Voice: Pending — dashboard only"**. That's obsolete since the universal line: *every* vertical is callable on +1 (754) 283-7658. Following it you'd tell a dental prospect "no phone demo" when it works. Also collapsed 6 stale `?preview=demo-{industry}` URLs (vestigial tenants → stale data) into the one that works.
- Now: a 7-click "**Forgot everything? This is the whole demo**" block, a 7-row industry table generated from the templates, a Dental/Prop-Mgmt intake demo flow, and troubleshooting rows for the empty-Calendar and wrong-company failures. Rendered + verified in a browser.

**10. Graphify rebuilt** — `graphify-out/` didn't exist at session start. **882 nodes, 1639 edges, 75 communities.** God nodes: `getAdminFirestore()` (114 edges), `verifyAuthAndRole()` (42), `verifySuperadmin()` (34), `useBusinessId()` (26), `useBusinessModules()` (20). It independently surfaced the Roofus/Alice drift.

**Files**: `src/lib/verticals/templates.ts` (vocab + calendarMode + `demoAgentName`), `src/lib/verticals/demoSeed.ts` (resources + jobs), `src/hooks/useBusinessModules.ts` (new), `src/app/api/appointments/[appointmentId]/route.ts` (new), `src/app/company/{layout,company-nav,calendar,dashboard,guide,jobs,library,settings}`, `src/app/admin/demo/page.tsx`, `src/app/api/admin/demo-customize/route.ts`, `src/lib/ai/agentPromptBuilder.ts`, `src/app/api/appointments/send-confirmation/route.ts`, `eslint.config.mjs` (new), `public/guides/onboarding-guide.html`, `CLAUDE.md`.

---

## This session (2026-07-04) — mobile nav, skeleton loaders, crew colors, demo cheat sheet

Closes out the UX-gap punch list from the 2026-06-28 audit + adds a fast-recall cheat sheet to the Demo Playbook.

- **Mobile nav (largest remaining UX gap, now fixed)**: the company topbar used to stack logo/nav/search/user into a tall column under 900px. Now a **hamburger button** (`src/app/company/layout.tsx`) toggles a `.mobile-nav-sheet` — full-width nav links, search, role/email, and a full-width Sign out button, closes automatically on route change. Desktop layout untouched. Verified with Playwright at 390×844 and 1280×800.
- **Skeleton loaders**: new `src/components/ui/PageSkeleton.tsx` (shimmer via `.skeleton` CSS) replaces the bare "Loading X…" text on 11 pages (dashboard, calls, pipeline, jobs, library, settings, calendar, admin businesses/config/usage/invoices).
- **Crew color picker** (`src/app/company/library/page.tsx`): click a crew's color dot → pick from the same 8-color palette the API auto-assigns from → `PATCH /api/company/crews` persists it. Was previously fixed at creation time only.
- **Demo Playbook cheat sheet**: added a **"⚡ Forgot everything? Read this and go."** 6-line box at the very top of Part 1 in `public/guides/onboarding-guide.html` — sits right where the `#part-1` anchor (used by both the admin Playbooks iframe and "Open full screen") lands, above the existing detailed cheat sheet.
- Verified: `tsc --noEmit` clean, `next build` green, Playwright smoke test of `/login`, `/field` (401 → friendly "link isn't active" notice, confirms the 07-03 field-key guard works end-to-end), and a throwaway route to visually confirm the mobile drawer (deleted after verification).

**Files**: `src/app/company/layout.tsx`, `src/app/globals.css`, `src/components/ui/PageSkeleton.tsx` (new), `src/app/company/{dashboard,calls,pipeline,jobs,library,settings,calendar}/page.tsx`, `src/app/admin/{businesses/page.tsx,businesses/[businessId]/config/page.tsx,usage/page.tsx,invoices/page.tsx}`, `public/guides/onboarding-guide.html`.

---

## Previous session (2026-07-03) — data-plane lockdown + one-tap field voice + AI accuracy

**Security — the whole jobs/field data plane was unauthenticated** (anyone with a businessId could read customer PII, create jobs, send invoice/report/crew emails from our Resend domain, and farm `/api/transcribe`/`/api/agent/respond` as free OpenAI proxies). Now:
- New **`verifyFieldAccess(req, businessId)`** (`src/lib/auth/verifyRole.ts`): passes on a session with any role on the business (or superadmin), **or** a per-business **`fieldKey`** sent as `x-field-key` header / `?key=` query — this is what the QR link carries so unauthenticated crews still work. Secure by default: no fieldKey on the business → no anonymous access.
- **Field-access (session or key)**: GET `/api/jobs`, GET `/api/jobs/[jobId]`, GET+POST `updates`, POST `field-audio`, GET+POST `photos`, GET `photos/[photoId]`, POST `/api/transcribe` (now requires businessId).
- **Session-only (owner/staff/superadmin)**: POST `/api/jobs`, PATCH `/api/jobs/[jobId]`, `invoice`, `invoice/send`, `report`, `report/send`, `assign`, photo PATCH/DELETE, `/api/appointments/send-confirmation`, `/api/calls/[callId]` (GET also allows viewer), `agent-config` GET, `faq-suggestions` POST.
- **Superadmin-only**: `/api/agent/respond`, `/api/agent/classify`, `/api/tools/execute` (test endpoints, no UI uses them).
- **fieldKey provisioning**: demo-customize launch mints a stable key for `demo-roofing` (kept across launches so printed QRs stay valid) and returns **`fieldUrl`** — the Demo Studio QR + "Copy link" now use it. Seed script preserves/mints it and prints it. `fieldKey?` added to `BusinessConfig`.
- ⚠️ **After deploy: hit Launch (or Reset) in Demo Studio once** (or run the seed script) to mint demo-roofing's fieldKey — until then the public QR page shows a friendly "link isn't active" notice for anonymous visitors (signed-in staff unaffected).

**Field UX — public `/field` reworked to one-tap voice** (was: record → transcript → review → tap "Parse & Save"): now hold-to-speak → release → Whisper+parse+save in one round trip via `useFieldAudio`/`field-audio` (same flow as `/company/field`), with the correction confirm card, a collapsed "⌨ Type instead" fallback, an access-denied notice, and **localStorage persistence of businessId+key** so the PWA (`start_url` has no key) keeps working after the first QR scan.

**AI accuracy**:
- Whisper now gets a **vocabulary-bias prompt** built from the job context (client/address/title) + trade terms ("squares of shingles, underlayment, drip edge…") — materially better on noisy job sites (`field-audio/route.ts`).
- `parseFieldUpdate` takes **`industry`** (read from the business doc) instead of hardcoding "roofing company"; summarize/classify/FAQ prompts neutralized to "local service business" — correct extraction for all 6 verticals.

**Files**: `src/lib/auth/verifyRole.ts`, 14 API route files, `src/hooks/useFieldAudio.ts` (+`fieldKey`), `src/components/field/PhotoCapture.tsx` (+`fieldKey`), `src/app/field/page.tsx` (rewritten), `src/app/admin/demo/page.tsx`, `src/app/api/admin/demo-customize/route.ts`, `src/lib/ai/deepseekClient.ts`, `src/types/index.ts`, `scripts/seed-demo-business.mjs`, `public/guides/onboarding-guide.html`.

---

## This session (2026-06-28) — UX overhaul: one design language, fewer clicks, pro PDFs, Guide tab

Driven by a multi-agent UX audit (7 surfaces, 83 findings → 5 themes). Three commits, all tsc + build green, pushed to main. Login smoke-tested via Playwright (renders clean, on-brand).

**`9e3a173` — design system + navigation + clarity:**
- One **teal accent** — removed the competing `#2563eb` app-wide (incl. PWA `themeColor`, job tab bar, dashboard/pipeline/library/calendar/invoices/PhotoCapture). New `.button` variants (`secondary`/`ghost`/`danger` + `.small`), global `:focus-visible` ring, spacing/radius/semantic-status-color tokens, reusable `.icon-del`; missing job status chips (inspection/quoted/invoiced/pending).
- **Login** rebuilt on the design system (was off-brand black/system-ui); **Demo Studio** re-skinned dark→light + teal + success banner + reset confirm.
- **Field** added to company nav; `/admin` landing redirect; Usage rows get **Configure** links; demo nav relabeled "Demo: …"; login honors `?next=`; company logout clears `__session`.
- **Play call recordings** (was stored at webhook but never surfaced) + headphones indicator + outbound-phone fix in detail; inline **Call Back / Mark contacted** on lead cards (2 clicks → 1); appointment actions simplified (one primary + "Confirm without email" + danger Cancel); `confirm()` guards on destructive actions; Library delete contrast + guards.

**`7cafc0b` — PDF / Guide / Calendar / multi-day:**
- **PDF invoices/reports** now print as a clean document — `@media print` hides app chrome (topbar/nav/sidebar), strips the card border/shadow, sets `@page` margins; docs tagged `.invoice-doc`/`.report-doc`. (See global Lesson 118.)
- New **`/company/guide` "Guide" tab** (Compass icon): the talk-don't-type idea, full workflow, what-each-tab-does cards, quick how-tos (create a crew, schedule, send invoice, voice update, call back).
- **Calendar**: page title renamed "Powerboard" → **"Calendar"** (matches the nav tab); now defaults to the **full 7-day week** so weekends are always schedulable (emergencies); added a **"+ Manage crews"** link → `Library?section=crews` (Library now honors `?section=`). Earlier in the session: legend, drag grips, "Drop to schedule" hint, full **"Confirm + email crew"** button, clearer unschedule + guard, segmented week toggle.
- **Multi-day jobs**: timeline events carry their source-update day (`dateMs`, stamped in `buildProjection`); the Timeline tab + report "Work Performed" show the **date** alongside the time when a job spans >1 day.

**`9e3a173`/`7cafc0b` key files:** `src/app/globals.css` (token layer + button/icon/focus + print + nav contrast), `src/app/login/page.tsx`, `src/app/admin/demo/page.tsx`, `src/app/admin/page.tsx` (new), `src/app/admin/usage/page.tsx`, `src/app/admin/admin-nav.tsx`, `src/app/company/company-nav.tsx`, `src/app/company/guide/page.tsx` (new), `src/app/company/{calls,pipeline,library,calendar,dashboard}/page.tsx`, `src/app/company/jobs/[jobId]/page.tsx`, `src/lib/jobs/projection.ts` + `src/types/jobs.ts` (timeline `dateMs`), `src/components/{ui/StatusChip,field/PhotoCapture}.tsx`.

**Design-system convention going forward:** one teal `var(--accent)` (no blue), use the `.button` variants + `.icon-del` + tokens — do not reintroduce per-page inline button styles or `#2563eb`. (Saved to project memory `design-system-conventions`.)

---

## Previous session (2026-06-15) — Demo Studio + dynamic agent + after-hours + security + universal line

1. **Demo Studio (multi-vertical)** `1c0b388` — `/admin/demo` rebuilt as a 3-step pick→prospect→launch studio for 6 verticals (Roofing, HVAC, Landscaping, Dental, GC, Property Mgmt), per-industry personas/pitch scripts/brand colors, Firestore-driven nav-module hiding (Dental & Property Mgmt hide Jobs/Library).

2. **Dynamic per-industry Vapi prompt + Canadian timezones** `16d51ed` — the `assistant-request` webhook now builds the FULL system prompt + greeting from each business's own config (`buildAgentPrompt`) and serves them as Vapi vars `{{systemPrompt}}` / `{{greeting}}`. One assistant adapts to any vertical. `resolveBusinessId` resolves **by phone number first** (assistant-id fallback). Timezone picker gained Canada (`SUPPORTED_TIMEZONES`).

3. **UX unification + login hardening** `46b37bd` — `/company/leads` and `/company/appointments` are now redirects into the unified **Pipeline** (single source of truth); Pipeline reads `?urgency=urgent` (fixes the dashboard "Urgent leads" link) and `?lead=<id>` deep-select. CommandBar now searches appointments too and deep-links to the record. Removed public self-signup from `/login` (was creating orphan accounts) + Luxor branding. `alert()` → inline toast.

4. **Security: all `/api/admin/*` gated** `bf7c249` — every admin route was UNAUTHENTICATED. Added `verifySuperadmin()` (`src/lib/auth/verifyRole.ts`) to all ~17 admin handlers. Cookie-based, so no client changes. Curl-verified: every admin endpoint returns 401 without a valid session. **Verified live in prod (401).**

5. **After-hours done end-to-end** `aa0a843` — customer email captured at booking (`Appointment.callerEmail`); "Confirm & notify customer" now actually emails the **customer** (`sendCustomerConfirmation`, was only emailing the business), fixes the hardcoded tz, always confirms even without email. Dashboard surfaces an **"After-hours — Pending Your Approval"** section + clickable pill → Pipeline. Cards clickable app-wide.

6. **Caller-ID phone + optional email + playbook accuracy** `0e1e5a7` — webhook feeds caller ID into the prompt; the agent **confirms the number casually** ("…ending in 4821?") instead of making the caller recite it. Email is explicitly **optional** (offered once, never blocks). Rewrote the guide/Demo Studio to say the agent adapts to *every* industry; "Voice: Pending" = no phone line connected for that vertical yet, not an agent limit.

7. **Universal demo line** `71c5758` — `demo-roofing` is the single live demo tenant (owns the Vapi number + assistant). Each Demo Studio launch **reconfigures it in place** to the chosen vertical (config + reseeds sample data via `src/lib/verticals/demoSeed.ts`), so the **one number adapts** to whatever you launched. One seeded appointment is an after-hours pending booking WITH an email, so the approval flow is demoable immediately. (Reconfigure-in-place, not remap, to avoid the phone-number lookup cache going stale.)

8. **Vapi tools/config verified via API** — confirmed System Prompt = `{{systemPrompt}}`, First Message = `{{greeting}}`. Added the optional **`email`** param to the `bookAppointment` and `createLead` tools (was missing → live calls couldn't pass an email). Optional (not in `required`); webhook/server config intact. *(Vapi-side change, no deploy.)*

---

## Vapi Architecture (current)

- **Assistant**: `9267a84a-0f4f-416b-a328-1dc539f5265e` ("Alice - Roofing" = the universal demo line / `demo-roofing`).
- **Phone**: +1 (754) 283-7658. **Webhook**: `https://ai-roof.vercel.app/api/webhooks/vapi`.
- **Prompt is dynamic**: System Prompt = `{{systemPrompt}}`, First Message = `{{greeting}}`, both served by the `assistant-request` webhook from the resolved business's config. Do **not** overwrite those two fields with literal text.
- **Tenant resolution**: by phone number first, then assistant id (`resolveBusinessId`).
- **7 tools** (by id): bookAppointment, createLead, escalateCall, checkAvailability, lookupAppointment, cancelAppointment, getCurrentDate. bookAppointment + createLead now include an optional `email` param.
- **Keys (3, don't mix up):** **Private key** = `VAPI_API_KEY` (server REST + outbound); **Public key** (browser only); **`VAPI_WEBHOOK_SECRET`** (inbound verification — ⚠️ The `VAPI_AUTH_BYPASS=true` posture described below was removed by T-010 in the release plan; webhook auth is now fail-closed with a timing-safe compare + Firestore replay guard. See `src/lib/vapi/verify.ts`.) `VAPI_API_KEY` + `VAPI_WEBHOOK_SECRET` are **Sensitive** in Vercel (can't be read back via `vercel env pull`).
- **Voice**: Vapi "Layla" / Cartesia stack, GPT-4o Mini, Deepgram nova-3. ~$0.09/min, ~840 ms. (ElevenLabs = max raw realism at higher latency if you ever want to A/B.)

## Demo Instructions (universal line)

1. Log in at `/login` → connect@luxordev.com (must be superadmin; if admin pages 401, run `node scripts/provision-superadmin.mjs` then sign out/in).
2. `/admin/demo` → pick industry → enter prospect company + email → **Launch**.
3. The launch panel shows the live number **for every vertical** now. Hand the prospect the phone → the agent answers **as that industry/company**, confirms their number from caller ID, optionally asks for an email, books.
4. **Open dashboard** (opens the live line) → show Calls/Pipeline + the seeded **after-hours "Pending Your Approval"** booking → **Confirm & notify customer** (emails the customer).
5. Field-service verticals: scan the QR for the voice field-update demo.
6. **Reset demo** restores the roofing default.

## Pending / Next

### TODO — next session, in order

- [ ] **1. Confirm the Vercel deploy of `6adc26a` went green.** `npx vercel ls` or the dashboard.
- [ ] **2. Launch each vertical once from Demo Studio** (`/admin/demo`). A launch is what seeds resources/jobs **and** mints demo-roofing's fieldKey. **Until a vertical is launched, its Calendar has no rows** — do this before any client meeting.
- [ ] **3. Click the new drag-to-assign path (highest risk).** Launch **Dental** → Calendar → drag the unassigned booking onto *Dr. Rivera* → **Confirm + email**. New code, verified only by build + seed script. Then repeat for a field-service vertical (drag a job onto a crew → Confirm + email crew).
- [ ] **4. Verify a dental call doesn't ask for a street address.** Dial +1 (754) 283-7658 after launching Dental, say *"I chipped a tooth"*. If it asks for an address, `address` is in `bookAppointment`'s `required` array in the Vapi dashboard → remove it from `required` (like `email` already is). This is the one thing needing the Vapi dashboard; **no Vapi change was needed to add Cleaning** (prompt/greeting are dynamic, all 7 tools are industry-generic).
- [ ] **5. Decide: Roofus or Alice?** The roofing template says "Roofus" (real onboarded roofing tenants get Roofus), the live demo line answers as "Alice", `pitch-deck.html` says "Meet Roofus". Behavior is preserved and self-consistent either way — it needs one brand decision, then delete `DEMO_AGENT_NAME_OVERRIDE` in `templates.ts` and align the deck.
- [ ] **6. Fix or drop the Stop hook.** It calls `graphify auto-update .` — a command that has never existed (see the graphify section in CLAUDE.md). It fails silently, which is why the graph was missing. Rebuild is the `/graphify` skill, not a CLI command.
- [ ] **7. Smoke-test the field QR** on a real phone: scan → `/field` → hold-to-speak → update lands on the job.

### Backlog

- [ ] **Demo data should look like a business in full swing, not a startup.** (Raised 2026-07-15 after seeing roofing demo with a single crew, "Jaunas" — that's the pre-`6adc26a` state; the shipped seed gives 3 crews + 3 jobs. Still too thin.) A one-crew, three-job board showcases nothing: no parallelism, no conflicts, no "this is what Monday actually looks like." Target **~5–6 resources and ~12–18 jobs/bookings per vertical**, spread across the visible week so the Calendar reads busy at a glance.
  - Edit `RESOURCES` + the `jobs`/`appointments` builders in `src/lib/verticals/demoSeed.ts` — it's the single place; every vertical flows from it.
  - **Mix the states** so the board tells a story rather than looking uniform: some confirmed (solid, crew-colored), some provisional/unconfirmed (grey dashed), 2–3 left in Unscheduled/Unassigned so there's always something to drag live. Vary status across the job stepper (inspection / quoted / in_progress / invoiced) so Jobs + Dashboard don't read as one flat list.
  - **Per-industry names must stay real, not filler** — the point is a prospect recognizing their own operation. Roofing: crews (Carlos, Tyler, Storm Response, +Gutter, +Repairs). HVAC: named techs + an after-hours on-call. Cleaning: Team A/B/C + Deep Clean + Post-Construction. GC: trade crews (framing, drywall, finish, concrete). Dental: 2–3 dentists + 2 hygienists (+ ops/chairs if useful). Prop Mgmt: plumbing/electrical/HVAC vendors + on-call manager + turnover crew.
  - Keep `jobCounter` advancing past the seeded ids (see the 07-15 collision fix) and keep at least one after-hours `pendingConfirmation` booking with an email for the Dashboard approval demo.
  - Watch the write cost: seeding is one Firestore batch per launch on the free Spark plan; ~18 jobs × 7 verticals is still trivial, but don't let it balloon into per-job subcollection writes.
  - Re-verify per vertical with a throwaway `npx tsx` script (rows > 0, draggable > 0, states varied) the way the 07-15 session did.

- **26 lint warnings** now visible via `npm run lint` — mostly `<img>` → `next/image` and `react-hooks/exhaustive-deps`. `no-explicit-any` is a warning, not an error: 10 pre-existing `any`s in webhook/tools/cron payloads. Tighten to `error` once those payload types are filled in.
- **Intake Calendar depth**: Dental/Prop-Mgmt Calendar assigns bookings to a provider/vendor on a day. If a prospect asks for a true time-grid day view (chairs × hours), that's a build — not a gap in the pitch today.
- **Email deliverability** — verify `RESEND_FROM` uses a verified domain.
- **Verify the PDF print fix live** — job → Generate Invoice → Print/Save as PDF.
- **UX follow-ups**: the two field screens still differ visually (public `/field` purple vs `/company/field` orange — behavior already matches); onboarding "wizard" → real stepper; sticky save bars on long forms.
- **Vestigial**: per-vertical demo businesses (`demo-hvac`, `demo-dental`, …) are unused now that every launch reconfigures `demo-roofing`. Harmless; the guide no longer points at them.
- **Post-MVP** — Google Calendar per-business OAuth, Stripe billing, SMS (Twilio A2P 10DLC).
- ~~Mobile responsiveness~~ — done 2026-07-04 (hamburger nav).  ~~Skeleton loaders~~ — done 2026-07-04. ~~Crew color picker~~ — done 2026-07-04.
- **UX follow-ups (audit bigger-bets not yet done):** unify the two field screens' *visuals* (public `/field` is purple, `/company/field` is orange — behavior now matches since both use `useFieldAudio`, but the color schemes still differ); onboarding "wizard" → real stepper or honest anchor list; sticky save bars + dirty-state on long admin/company forms.
- **Email deliverability** — confirm `RESEND_FROM` uses a verified domain so customer confirmation emails land cleanly.
- **Verify the PDF fix live** — once deployed, open a job → Generate Invoice → Print / Save as PDF and confirm only the document prints (Playwright couldn't reach auth-gated pages headlessly).
- **Vestigial** — per-vertical demo businesses (`demo-hvac`, etc.) unused now that the Demo Studio runs on the universal line (`demo-roofing`). Harmless; left in place.
- **Minor** — favicon 404; admin demo links are intentionally `demo-roofing` (now clearly labeled "Demo: …"); `__session` cookie ~1h staleness on very long admin sessions.
- **Post-MVP** — Google Calendar per-business OAuth, Stripe billing, SMS (Twilio A2P 10DLC), more verticals going live (connect a number per the guide's "Connecting a phone line to a vertical").

## Key Files (added/changed this session)

- `src/lib/ai/agentPromptBuilder.ts` — `buildAgentPrompt(config, { runtime })`: industry-aware prompt + runtime context (date/time/after-hours/caller phone), contact-capture (caller-ID confirm + optional email).
- `src/app/api/webhooks/vapi/route.ts` — `assistant-request` serves `{{systemPrompt}}`/`{{greeting}}` + caller phone; bookAppointment/createLead read `email`; phone-first `resolveBusinessId`.
- `src/lib/auth/verifyRole.ts` — `verifySuperadmin()`; all `/api/admin/*` handlers gated.
- `src/app/api/admin/demo-customize/route.ts` — universal line: reconfigure + reseed `demo-roofing` per launch.
- `src/lib/verticals/demoSeed.ts` — template-driven per-vertical sample data (incl. an after-hours pending booking with email).
- `src/lib/verticals/templates.ts` — 6 vertical templates (incl. general-contractors) + icon/color/script/disabledModules.
- `src/app/company/pipeline/page.tsx` — unified Leads+Appointments; `?urgency`/`?lead`; tone-aware toast; customer email on appt cards.
- `src/app/company/dashboard/page.tsx` — after-hours pending section + pill; clickable cards.
- `src/app/api/appointments/send-confirmation/route.ts` — notifies the customer (not just the business).
- `src/app/company/{leads,appointments}/page.tsx` — redirects into Pipeline.
- `src/app/login/page.tsx` — sign-in only + branding.
- `src/hooks/useBusinessTimezone.ts` — `SUPPORTED_TIMEZONES` (US + Canada).
- `public/guides/onboarding-guide.html` — v2 Demo Studio + accurate per-industry framing.
- `src/types/index.ts` — `callerEmail` on Lead + Appointment.

## Prior epic (Field Ops + Calendar Powerhouse + Library) — still live
Booking fix (`ignoreUndefinedProperties`); unified voice-correctable job data (`src/lib/jobs/projection.ts`); job-site photos (base64 split, free Spark); editable report + Mail gate; Library (pricing/crews/docs); Calendar Powerboard (@dnd-kit). See `docs/EPIC-PLAN.md`.
