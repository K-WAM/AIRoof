# HANDOFF — AI Receptionist Platform
Last updated: 2026-06-28 (UX overhaul: one design language, fewer clicks, pro PDFs, Guide tab)

## Current State

**Completion: ~98%** — live at https://ai-roof.vercel.app. Everything below is shipped and (where noted) verified in production.

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
- **Keys (3, don't mix up):** **Private key** = `VAPI_API_KEY` (server REST + outbound); **Public key** (browser only); **`VAPI_WEBHOOK_SECRET`** (inbound verification, bypassed via `VAPI_AUTH_BYPASS=true`). `VAPI_API_KEY` + `VAPI_WEBHOOK_SECRET` are **Sensitive** in Vercel (can't be read back via `vercel env pull`).
- **Voice**: Vapi "Layla" / Cartesia stack, GPT-4o Mini, Deepgram nova-3. ~$0.09/min, ~840 ms. (ElevenLabs = max raw realism at higher latency if you ever want to A/B.)

## Demo Instructions (universal line)

1. Log in at `/login` → connect@luxordev.com (must be superadmin; if admin pages 401, run `node scripts/provision-superadmin.mjs` then sign out/in).
2. `/admin/demo` → pick industry → enter prospect company + email → **Launch**.
3. The launch panel shows the live number **for every vertical** now. Hand the prospect the phone → the agent answers **as that industry/company**, confirms their number from caller ID, optionally asks for an email, books.
4. **Open dashboard** (opens the live line) → show Calls/Pipeline + the seeded **after-hours "Pending Your Approval"** booking → **Confirm & notify customer** (emails the customer).
5. Field-service verticals: scan the QR for the voice field-update demo.
6. **Reset demo** restores the roofing default.

## Pending / Next

- **Mobile responsiveness** — the company topbar (logo + nav + search + user) still stacks into a tall column on phones (≤900px); needs a hamburger/sheet. Largest remaining UX gap, untested surface.
- **UX follow-ups (audit bigger-bets not yet done):** unify the two field screens (`/field` vs `/company/field` — different interaction models/colors); shared skeleton loaders (still bare "Loading…" text); onboarding "wizard" → real stepper or honest anchor list; sticky save bars + dirty-state on long admin/company forms; crew **color picker** in Library.
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
